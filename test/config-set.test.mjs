import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function runRoam(args, configDir = tempConfigDir()) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ROAM_CONFIG_DIR: configDir,
    },
  });

  return { ...result, configDir };
}

function tempConfigDir() {
  return mkdtempSync(join(tmpdir(), "roam-cli-config-"));
}

function readConfig(configDir) {
  return JSON.parse(readFileSync(join(configDir, "config.json"), "utf8"));
}

test("config set writes token and graph passed after the subcommand", () => {
  const result = runRoam(["config", "set", "--token", "roam-token", "--graph", "my-graph"]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readConfig(result.configDir), {
    token: "roam-token",
    graph: "my-graph",
  });
  assert.match(result.stdout, /"token": "\*\*\*"/);
  assert.doesNotMatch(result.stdout, /roam-token/);
});

test("config set writes only token when graph is omitted", () => {
  const result = runRoam(["config", "set", "--token", "roam-token"]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readConfig(result.configDir), {
    token: "roam-token",
  });
});

test("config set writes only graph when token is omitted", () => {
  const result = runRoam(["config", "set", "--graph", "my-graph"]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readConfig(result.configDir), {
    graph: "my-graph",
  });
});

test("config set without values still exits with a usage error", () => {
  const result = runRoam(["config", "set"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Nothing to set/);
  assert.equal(existsSync(join(result.configDir, "config.json")), false);
});
