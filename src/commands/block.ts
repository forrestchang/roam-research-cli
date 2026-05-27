import { Command } from "commander";
import { RoamBackendClient, type WriteAction } from "../client.js";
import { resolveAuth } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";
import { parseLocation, parseAlign, parseView } from "../location.js";

export function registerBlockCommand(program: Command): void {
  const block = program.command("block").description("Create, update, move, or delete blocks");

  block
    .command("create")
    .description("Create a block. Provide one of --parent, --page-title, or --dnp.")
    .option("-p, --parent <uid>", "Parent block or page UID")
    .option("--page-title <title>", "Page title to create the block under (creates the page if missing)")
    .option("--dnp <MM-DD-YYYY>", "Daily Notes Page (recommended over --page-title for DNPs)")
    .requiredOption("-s, --string <text>", "Block content")
    .option("-o, --order <order>", "Position: 'first', 'last', or a 0-based index", "last")
    .option("--uid <uid>", "Explicit UID for the new block")
    .option("--open <bool>", "Whether the block is expanded", v => v !== "false", true)
    .option("--heading <n>", "Heading level (1-3)", v => parseInt(v, 10))
    .option("--text-align <align>", "left | center | right | justify")
    .option("--children-view <type>", "children-view-type: bullet | document | numbered")
    .option("--block-view <type>", "block-view-type: bullet | document | numbered")
    .action(async (opts, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const location = parseLocation({
        parent: opts.parent,
        pageTitle: opts.pageTitle,
        dnp: opts.dnp,
        order: opts.order,
      });
      const action: WriteAction = {
        action: "create-block",
        location,
        block: {
          string: opts.string,
          ...(opts.uid ? { uid: opts.uid } : {}),
          ...(opts.open !== undefined ? { open: opts.open } : {}),
          ...(opts.heading ? { heading: opts.heading as 1 | 2 | 3 } : {}),
          ...(opts.textAlign ? { "text-align": parseAlign(opts.textAlign)! } : {}),
          ...(opts.childrenView ? { "children-view-type": parseView(opts.childrenView)! } : {}),
          ...(opts.blockView ? { "block-view-type": parseView(opts.blockView)! } : {}),
        },
      };
      const res = await client.write(action);
      printResult(res ?? { ok: true, uid: opts.uid }, globals.pretty ? "pretty" : "json");
    });

  block
    .command("update <uid>")
    .description("Update an existing block")
    .option("-s, --string <text>", "New block content")
    .option("--open <bool>", "Whether the block is expanded", v => v !== "false")
    .option("--heading <n>", "Heading level (0 to clear, 1-3 to set)", v => parseInt(v, 10))
    .option("--text-align <align>", "left | center | right | justify")
    .option("--children-view <type>", "children-view-type: bullet | document | numbered")
    .option("--block-view <type>", "block-view-type: bullet | document | numbered")
    .action(async (uid: string, opts, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const action: WriteAction = {
        action: "update-block",
        block: {
          uid,
          ...(opts.string !== undefined ? { string: opts.string } : {}),
          ...(opts.open !== undefined ? { open: opts.open } : {}),
          ...(opts.heading !== undefined ? { heading: opts.heading as 0 | 1 | 2 | 3 } : {}),
          ...(opts.textAlign ? { "text-align": parseAlign(opts.textAlign)! } : {}),
          ...(opts.childrenView ? { "children-view-type": parseView(opts.childrenView)! } : {}),
          ...(opts.blockView ? { "block-view-type": parseView(opts.blockView)! } : {}),
        },
      };
      const res = await client.write(action);
      printResult(res ?? { ok: true, uid }, globals.pretty ? "pretty" : "json");
    });

  block
    .command("move <uid>")
    .description("Move a block to a new location. Provide one of --parent, --page-title, or --dnp.")
    .option("-p, --parent <uid>", "New parent UID")
    .option("--page-title <title>", "Move to be a direct child of this page (created if missing)")
    .option("--dnp <MM-DD-YYYY>", "Move to a Daily Notes Page")
    .option("-o, --order <order>", "Position: 'first', 'last', or a 0-based index", "last")
    .action(async (uid: string, opts, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const location = parseLocation({
        parent: opts.parent,
        pageTitle: opts.pageTitle,
        dnp: opts.dnp,
        order: opts.order,
      });
      const action: WriteAction = {
        action: "move-block",
        location,
        block: { uid },
      };
      const res = await client.write(action);
      printResult(res ?? { ok: true, uid }, globals.pretty ? "pretty" : "json");
    });

  block
    .command("delete <uid>")
    .description("Delete a block")
    .action(async (uid: string, _opts, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const res = await client.write({ action: "delete-block", block: { uid } });
      printResult(res ?? { ok: true, uid }, globals.pretty ? "pretty" : "json");
    });
}
