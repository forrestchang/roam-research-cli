import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { RoamBackendClient } from "../client.js";
import { resolveAuth } from "../config.js";
import type { GlobalOptions } from "../globals.js";
import { renderOutlineMarkdown, type OutlineNode } from "../markdown.js";
import { resolveEid } from "./outline.js";

const OUTLINE_SELECTOR = "[:block/uid :node/title :block/string :block/order :block/heading {:block/children ...}]";

export function registerExportCommand(program: Command): void {
  program
    .command("export <page>")
    .description("Export a page (or subtree) to markdown. Default: stdout. Use --output to write to a file.")
    .option("--by <kind>", "How to resolve <page>: 'auto' | 'title' | 'uid'", "auto")
    .option("-o, --output <path>", "Write to this file instead of stdout")
    .option("--format <fmt>", "Output format (only 'md' is supported today)", "md")
    .action(async (page: string, opts: { by: string; output?: string; format: string }, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      if (opts.format !== "md") {
        throw new Error(`Unsupported --format '${opts.format}'. Only 'md' is implemented.`);
      }
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const eid = resolveEid(page, opts.by);
      const raw = await client.pull<{ result?: OutlineNode } | null>(eid, OUTLINE_SELECTOR);
      const tree = raw?.result ?? null;
      if (!tree) {
        throw new Error(`No entity found for '${page}' (resolved as ${eid}).`);
      }
      const md = renderOutlineMarkdown(tree);
      if (opts.output) {
        writeFileSync(opts.output, md, "utf8");
        process.stdout.write(`Wrote ${md.length} bytes to ${opts.output}\n`);
      } else {
        process.stdout.write(md);
      }
    });
}
