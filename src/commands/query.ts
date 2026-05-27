import { readFileSync } from "node:fs";
import { Command } from "commander";
import { RoamBackendClient } from "../client.js";
import { resolveAuth } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";

export function registerQueryCommand(program: Command): void {
  program
    .command("query [datalog]")
    .alias("q")
    .description("Run a Datalog query against the graph")
    .option("-f, --file <path>", "Read the query from a file (use - for stdin)")
    .option("-a, --arg <value...>", "Positional arg(s) for the query; pass multiple times or space-separated")
    .option("--args-json <json>", "JSON-encoded array of args, e.g. '[\"page-title\", 42]'")
    .action(async (datalog: string | undefined, opts: { file?: string; arg?: string[]; argsJson?: string }, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const query = await loadQuery(datalog, opts.file);
      const args = parseArgs(opts.arg, opts.argsJson);
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const result = await client.query(query, args);
      printResult(result, globals.pretty ? "pretty" : "json");
    });
}

async function loadQuery(inline: string | undefined, file: string | undefined): Promise<string> {
  if (inline && file) {
    throw new Error("Pass either a positional query or --file, not both.");
  }
  if (inline) return inline;
  if (file === "-" || (!inline && !file && !process.stdin.isTTY)) {
    return await readStdin();
  }
  if (file) return readFileSync(file, "utf8");
  throw new Error("Provide a Datalog query (positional, --file, or stdin).");
}

function parseArgs(argList: string[] | undefined, argsJson: string | undefined): unknown[] {
  if (argList && argsJson) {
    throw new Error("Pass either --arg or --args-json, not both.");
  }
  if (argsJson) {
    const parsed = JSON.parse(argsJson);
    if (!Array.isArray(parsed)) throw new Error("--args-json must be a JSON array.");
    return parsed;
  }
  return argList ?? [];
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}
