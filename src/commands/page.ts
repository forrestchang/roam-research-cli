import { Command } from "commander";
import { RoamBackendClient, type WriteAction } from "../client.js";
import { resolveAuth } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";
import { parseView } from "../location.js";

export function registerPageCommand(program: Command): void {
  const page = program.command("page").description("Create, rename, or delete pages");

  page
    .command("create")
    .description("Create a new page")
    .requiredOption("-t, --title <title>", "Page title")
    .option("--uid <uid>", "Explicit UID for the new page")
    .option("--view <type>", "children-view-type: bullet | document | numbered")
    .action(async (opts, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const action: WriteAction = {
        action: "create-page",
        page: {
          title: opts.title,
          ...(opts.uid ? { uid: opts.uid } : {}),
          ...(opts.view ? { "children-view-type": parseView(opts.view)! } : {}),
        },
      };
      const res = await client.write(action);
      printResult(res ?? { ok: true, title: opts.title, uid: opts.uid }, globals.pretty ? "pretty" : "json");
    });

  page
    .command("update <uid>")
    .description("Update a page (rename, change view)")
    .option("-t, --title <title>", "New page title")
    .option("--view <type>", "children-view-type: bullet | document | numbered")
    .action(async (uid: string, opts, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const action: WriteAction = {
        action: "update-page",
        page: {
          uid,
          ...(opts.title ? { title: opts.title } : {}),
          ...(opts.view ? { "children-view-type": parseView(opts.view)! } : {}),
        },
      };
      const res = await client.write(action);
      printResult(res ?? { ok: true, uid }, globals.pretty ? "pretty" : "json");
    });

  page
    .command("delete <uid>")
    .description("Delete a page by UID")
    .action(async (uid: string, _opts, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const res = await client.write({ action: "delete-page", page: { uid } });
      printResult(res ?? { ok: true, uid }, globals.pretty ? "pretty" : "json");
    });
}
