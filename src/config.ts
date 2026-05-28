import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface RoamConfig {
  token?: string;
  graph?: string;
  /** Default header used by `roam capture` to group captures under a top-level block. */
  captureHeader?: string;
  /** Desktop Local API token (starts with `roam-graph-local-token-`); needed by `roam file *`. */
  localToken?: string;
}

export const DEFAULT_CAPTURE_HEADER = "Captures from [[CLI]]";

const CONFIG_DIR = process.env.ROAM_CONFIG_DIR ?? join(homedir(), ".config", "roam-cli");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function configPath(): string {
  return CONFIG_PATH;
}

export function readConfig(): RoamConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as RoamConfig;
  } catch {
    return {};
  }
}

export function writeConfig(cfg: RoamConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  try {
    chmodSync(CONFIG_PATH, 0o600);
  } catch {
    // best-effort on platforms where chmod is a no-op
  }
}

export function updateConfig(patch: Partial<RoamConfig>): RoamConfig {
  const next = { ...readConfig(), ...patch };
  writeConfig(next);
  return next;
}

export interface ResolvedAuth {
  token: string;
  graph: string;
}

export function resolveAuth(overrides: Partial<RoamConfig> = {}): ResolvedAuth {
  const cfg = readConfig();
  const token = overrides.token ?? process.env.ROAM_API_TOKEN ?? cfg.token;
  const graph = overrides.graph ?? process.env.ROAM_GRAPH ?? cfg.graph;
  if (!token) {
    throw new Error(
      "Missing API token. Set it with `roam config set --token <token>`, the ROAM_API_TOKEN env var, or --token."
    );
  }
  if (!graph) {
    throw new Error(
      "Missing graph name. Set it with `roam config set --graph <name>`, the ROAM_GRAPH env var, or --graph."
    );
  }
  return { token, graph };
}
