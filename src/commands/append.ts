import { readFileSync } from "node:fs";
import { Command } from "commander";
import {
  RoamAppendClient,
  type AppendBlock,
  type AppendLocation,
  type AppendRequest,
} from "../client.js";
import { resolveAuth } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";
import { parsePageTitle } from "../location.js";

export function registerAppendCommand(program: Command): void {
  program
    .command("append")
    .description(
      "Append blocks via the Roam Append API (https://append-api.roamresearch.com). " +
        "Works with append-only tokens AND encrypted graphs."
    )
    .option("--page <title>", "Target page title (created if missing)")
    .option("--dnp <MM-DD-YYYY>", "Target Daily Notes Page (recommended for DNPs)")
    .option(
      "--block <uid>",
      "Target a block by UID instead of a page. See API docs for the fragility caveats."
    )
    .option(
      "--nest-under <string>",
      "Optional: append under a top-level child block matching this string (created if missing). " +
        "Useful for per-tool capture groups."
    )
    .option(
      "-s, --string <text...>",
      "Block content. Pass multiple --string flags to append several sibling blocks."
    )
    .option(
      "--data <json>",
      "Raw append-data JSON array, e.g. '[{\"string\":\"a\",\"children\":[{\"string\":\"b\"}]}]'"
    )
    .option("--file <path>", "Read append-data JSON from a file (use - for stdin)")
    .action(async (opts, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamAppendClient({ auth: resolveAuth(globals) });

      const location = buildAppendLocation(opts);
      const appendData = await buildAppendData(opts);
      if (!appendData.length) {
        throw new Error("append-data is empty. Provide --string, --data, --file, or stdin.");
      }

      const req: AppendRequest = { location, "append-data": appendData };
      const res = await client.appendBlocks(req);
      printResult(res ?? { ok: true }, globals.pretty ? "pretty" : "json");
    });
}

function buildAppendLocation(opts: {
  page?: string;
  dnp?: string;
  block?: string;
  nestUnder?: string;
}): AppendLocation {
  const targets = [opts.page, opts.dnp, opts.block].filter(v => v !== undefined && v !== "");
  if (targets.length === 0) {
    throw new Error("Provide one of --page, --dnp, or --block.");
  }
  if (targets.length > 1) {
    throw new Error("--page, --dnp, and --block are mutually exclusive.");
  }

  const nestUnder = opts.nestUnder ? { "nest-under": { string: opts.nestUnder } } : {};

  if (opts.block) {
    return { block: { uid: opts.block }, ...nestUnder };
  }
  const title = parsePageTitle({ pageTitle: opts.page, dnp: opts.dnp });
  if (title === undefined) {
    throw new Error("Internal: page title resolution failed.");
  }
  return { page: { title }, ...nestUnder };
}

async function buildAppendData(opts: {
  string?: string[];
  data?: string;
  file?: string;
}): Promise<AppendBlock[]> {
  const sources = [opts.string?.length ? "string" : null, opts.data ? "data" : null, opts.file ? "file" : null].filter(
    Boolean
  );
  if (sources.length > 1) {
    throw new Error("Pass only one of --string, --data, or --file.");
  }
  if (opts.string?.length) {
    return opts.string.map(s => ({ string: s }));
  }
  if (opts.data) return parseAppendData(opts.data);
  if (opts.file !== undefined) {
    const raw = opts.file === "-" || (!opts.file && !process.stdin.isTTY)
      ? await readStdin()
      : readFileSync(opts.file, "utf8");
    return parseAppendData(raw);
  }
  if (!process.stdin.isTTY) {
    const raw = await readStdin();
    if (raw.trim()) return parseAppendData(raw);
  }
  return [];
}

function parseAppendData(raw: string): AppendBlock[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("append-data must be a JSON array of blocks.");
  }
  return parsed as AppendBlock[];
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
