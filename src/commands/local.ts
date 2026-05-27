import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { RoamLocalClient } from "../client.js";
import { readConfig } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";

interface LocalGlobalsLike extends GlobalOptions {
  localUrl?: string;
}

const DISCOVERY_FILE = join(homedir(), ".roam-local-api.json");

interface DiscoveryInfo {
  port?: number;
  "last-graph"?: string;
}

function readDiscovery(): DiscoveryInfo {
  if (!existsSync(DISCOVERY_FILE)) return {};
  try {
    return JSON.parse(readFileSync(DISCOVERY_FILE, "utf8")) as DiscoveryInfo;
  } catch {
    return {};
  }
}

function buildLocalClient(opts: LocalGlobalsLike, requireGraph: boolean): RoamLocalClient {
  const disc = readDiscovery();
  let baseUrl = opts.localUrl;
  if (!baseUrl && disc.port) baseUrl = `http://localhost:${disc.port}`;

  const cfg = readConfig();
  let graph = opts.graph ?? process.env.ROAM_GRAPH ?? cfg.graph ?? disc["last-graph"];
  if (requireGraph && !graph) {
    throw new Error(
      "Local API requires a graph name. Pass --graph, set ROAM_GRAPH, run `roam config set --graph`, " +
        "or open a graph in the desktop app so it appears in ~/.roam-local-api.json."
    );
  }
  // Newer desktop builds reject calls without a Bearer token. Pass one through if we have it.
  const token = opts.token ?? process.env.ROAM_API_TOKEN ?? cfg.token;
  return new RoamLocalClient({ baseUrl, graph, token });
}

export function registerLocalCommand(program: Command): void {
  const local = program
    .command("local")
    .description(
      "Desktop Local API (http://localhost:3333). Enables querying / writing via the Roam Alpha API " +
        "from your machine. No token required — just enable it in Roam Desktop Settings."
    )
    .option(
      "--local-url <url>",
      "Override the local API base URL (default: read port from ~/.roam-local-api.json, fall back to http://localhost:3333)"
    );

  local
    .command("discover")
    .description("Print the discovered port + last-opened graph from ~/.roam-local-api.json.")
    .action((_opts, cmd) => {
      const globals = cmd.optsWithGlobals() as LocalGlobalsLike;
      const disc = readDiscovery();
      printResult(
        {
          "discovery-file": DISCOVERY_FILE,
          exists: existsSync(DISCOVERY_FILE),
          port: disc.port,
          "last-graph": disc["last-graph"],
          "base-url-in-use": globals.localUrl ?? (disc.port ? `http://localhost:${disc.port}` : "http://localhost:3333"),
        },
        globals.pretty ? "pretty" : "json"
      );
    });

  local
    .command("graphs")
    .description("List graphs (open in the desktop app, plus optionally all available).")
    .option("--available", "List all graphs the user has access to (requires a graph window open)")
    .action(async (opts: { available?: boolean }, cmd) => {
      const globals = cmd.optsWithGlobals() as LocalGlobalsLike;
      const client = buildLocalClient(globals, false);
      const res = opts.available ? await client.graphsAvailable() : await client.graphsOpen();
      printResult(res, globals.pretty ? "pretty" : "json");
    });

  local
    .command("invoke <action>")
    .description(
      "Invoke any roamAlphaAPI action by dotted path (e.g. `data.q`, `data.block.create`, `util.generate-uid`). " +
        "Args come from --arg (repeatable) or --args-json."
    )
    .option("-a, --arg <value...>", "Positional arg(s); pass multiple times for multiple args")
    .option("--args-json <json>", "JSON-encoded array of args, e.g. '[{\"location\":{...}}]'")
    .action(async (action: string, opts: { arg?: string[]; argsJson?: string }, cmd) => {
      const globals = cmd.optsWithGlobals() as LocalGlobalsLike;
      const args = parseArgs(opts.arg, opts.argsJson);
      const client = buildLocalClient(globals, true);
      const res = await client.invoke(action, args);
      printResult(res, globals.pretty ? "pretty" : "json");
    });

  local
    .command("query <datalog>")
    .alias("q")
    .description("Run a Datalog query via the Local API (shortcut for `local invoke data.q`).")
    .option("-a, --arg <value...>", "Positional arg(s) for the query")
    .option("--args-json <json>", "JSON-encoded array of args")
    .action(async (datalog: string, opts: { arg?: string[]; argsJson?: string }, cmd) => {
      const globals = cmd.optsWithGlobals() as LocalGlobalsLike;
      const args = [datalog, ...parseArgs(opts.arg, opts.argsJson)];
      const client = buildLocalClient(globals, true);
      const res = await client.invoke("data.q", args);
      printResult(res, globals.pretty ? "pretty" : "json");
    });

  local
    .command("pull <uid>")
    .description("Pull an entity via the Local API (shortcut for `local invoke data.pull`).")
    .option("-s, --selector <selector>", "Pull pattern", "[*]")
    .action(async (uid: string, opts: { selector: string }, cmd) => {
      const globals = cmd.optsWithGlobals() as LocalGlobalsLike;
      const client = buildLocalClient(globals, true);
      const res = await client.invoke("data.pull", [opts.selector, [":block/uid", uid]]);
      printResult(res, globals.pretty ? "pretty" : "json");
    });
}

function parseArgs(argList: string[] | undefined, argsJson: string | undefined): unknown[] {
  if (argList?.length && argsJson) {
    throw new Error("Pass either --arg or --args-json, not both.");
  }
  if (argsJson) {
    const parsed = JSON.parse(argsJson);
    if (!Array.isArray(parsed)) throw new Error("--args-json must be a JSON array.");
    return parsed;
  }
  return argList ?? [];
}
