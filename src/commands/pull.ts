import { Command } from "commander";
import { RoamBackendClient } from "../client.js";
import { resolveAuth } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";

export function registerPullCommand(program: Command): void {
  program
    .command("pull <eid>")
    .description(
      "Pull a single entity. <eid> can be a bare UID (default, wrapped as [:block/uid \"...\"]), " +
        "a numeric EID, or a full EDN lookup-ref string like '[:node/title \"My Page\"]'."
    )
    .option("-s, --selector <selector>", "Pull pattern", "[*]")
    .action(async (eid: string, opts: { selector: string }, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const result = await client.pull(eid, opts.selector);
      printResult(result, globals.pretty ? "pretty" : "json");
    });

  program
    .command("pull-many <eids...>")
    .description("Pull multiple entities. Each arg is parsed like `pull`.")
    .option("-s, --selector <selector>", "Pull pattern", "[*]")
    .action(async (eids: string[], opts: { selector: string }, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const result = await client.pullMany(eids, opts.selector);
      printResult(result, globals.pretty ? "pretty" : "json");
    });
}
