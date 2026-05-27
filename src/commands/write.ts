import { readFileSync } from "node:fs";
import { Command } from "commander";
import { RoamBackendClient, type BatchAction, type WriteAction } from "../client.js";
import { resolveAuth } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";

export function registerWriteCommand(program: Command): void {
  program
    .command("write")
    .description(
      "Send raw write action(s). Default: each action is sent in its own request. " +
        "Use --atomic to wrap them in a single `batch-actions` request (all-or-nothing-ish; see API docs)."
    )
    .option("-f, --file <path>", "Read JSON from a file (use - for stdin)")
    .option("-j, --json <json>", "Inline JSON action(s) — object or array")
    .option(
      "--atomic",
      "Wrap multiple actions in a single batch-actions request (server transacts in order, bails on first failure)."
    )
    .action(async (opts: { file?: string; json?: string; atomic?: boolean }, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const raw = await loadJson(opts.file, opts.json);
      const parsed = JSON.parse(raw);
      const actions: WriteAction[] = Array.isArray(parsed) ? parsed : [parsed];
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });

      if (opts.atomic) {
        const batch: BatchAction = { action: "batch-actions", actions };
        const res = await client.write(batch);
        printResult(res ?? { ok: true, "actions-sent": actions.length }, globals.pretty ? "pretty" : "json");
        return;
      }

      const results = [];
      for (const action of actions) {
        results.push((await client.write(action)) ?? { ok: true });
      }
      const out = actions.length === 1 ? results[0] : results;
      printResult(out, globals.pretty ? "pretty" : "json");
    });
}

async function loadJson(file: string | undefined, inline: string | undefined): Promise<string> {
  if (inline && file) throw new Error("Pass either --file or --json, not both.");
  if (inline) return inline;
  if (file === "-" || (!file && !process.stdin.isTTY)) return await readStdin();
  if (file) return readFileSync(file, "utf8");
  throw new Error("Provide JSON via --json, --file, or stdin.");
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
