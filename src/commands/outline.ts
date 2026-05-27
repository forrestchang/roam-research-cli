import { Command } from "commander";
import { RoamBackendClient } from "../client.js";
import { resolveAuth } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";
import { renderOutlineMarkdown, type OutlineNode } from "../markdown.js";
import { isDnpString } from "../dates.js";

const OUTLINE_SELECTOR = "[:block/uid :node/title :block/string :block/order :block/heading {:block/children ...}]";

const UID_RE = /^[A-Za-z0-9_-]{9}$/;

export function registerOutlineCommand(program: Command): void {
  program
    .command("outline <page>")
    .description(
      "Print a page (or any subtree) as indented markdown. <page> is auto-detected as a page title or " +
        "block/page UID; use --by to force."
    )
    .option("--by <kind>", "How to resolve <page>: 'auto' | 'title' | 'uid'", "auto")
    .option("--json", "Print the raw pulled tree as JSON instead of markdown")
    .action(async (page: string, opts: { by: string; json?: boolean }, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });

      const eid = resolveEid(page, opts.by);
      const raw = await client.pull<{ result?: OutlineNode } | null>(eid, OUTLINE_SELECTOR);
      const tree = raw?.result ?? null;
      if (!tree) {
        throw new Error(`No entity found for '${page}' (resolved as ${eid}).`);
      }
      if (opts.json) {
        printResult(tree, globals.pretty ? "pretty" : "json");
        return;
      }
      process.stdout.write(renderOutlineMarkdown(tree));
    });
}

export function resolveEid(input: string, by: string): string {
  const mode = (by ?? "auto").toLowerCase();
  if (mode === "title") return `[:node/title "${escapeEdn(input)}"]`;
  if (mode === "uid") return input;
  if (mode !== "auto") throw new Error(`--by must be 'auto', 'title', or 'uid' (got '${by}').`);
  if (isDnpString(input)) return input;
  if (UID_RE.test(input)) return input;
  return `[:node/title "${escapeEdn(input)}"]`;
}

function escapeEdn(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
