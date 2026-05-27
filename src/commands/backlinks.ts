import { Command } from "commander";
import { RoamBackendClient } from "../client.js";
import { resolveAuth } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";

const BACKLINKS_Q = `[
 :find ?uid ?str ?page-title ?page-uid
 :in $ ?target
 :where
  [?p :node/title ?target]
  [?b :block/refs ?p]
  [?b :block/uid ?uid]
  [?b :block/string ?str]
  [?b :block/page ?bp]
  [?bp :node/title ?page-title]
  [?bp :block/uid ?page-uid]
]`;

interface Backlink {
  uid: string;
  string: string;
  page: string;
  page_uid: string;
}

export function registerBacklinksCommand(program: Command): void {
  program
    .command("backlinks <page>")
    .alias("refs")
    .description(
      "List blocks that reference the given page (linked references). " +
        "Matches both `[[page]]` and `#page` since both produce `:block/refs`."
    )
    .option("-l, --limit <n>", "Cap results", v => parseInt(v, 10))
    .action(async (page: string, opts: { limit?: number }, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const res = await client.query<{ result?: [string, string, string, string][] }>(BACKLINKS_Q, [page]);
      const out: Backlink[] = (res?.result ?? []).map(([uid, str, pt, pu]) => ({ uid, string: str, page: pt, page_uid: pu }));
      const limited = opts.limit ? out.slice(0, opts.limit) : out;
      printResult(limited, globals.pretty ? "pretty" : "json");
    });
}
