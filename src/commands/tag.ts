import { Command } from "commander";
import { RoamBackendClient } from "../client.js";
import { resolveAuth } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";

const TAG_REFS_Q = `[
 :find ?uid ?str ?page-title ?page-uid
 :in $ ?tag
 :where
  [?t :node/title ?tag]
  [?b :block/refs ?t]
  [?b :block/uid ?uid]
  [?b :block/string ?str]
  [?b :block/page ?p]
  [?p :node/title ?page-title]
  [?p :block/uid ?page-uid]
]`;

const TAG_COUNT_Q = `[
 :find (count ?b)
 :in $ ?tag
 :where
  [?t :node/title ?tag]
  [?b :block/refs ?t]
]`;

interface TagHit {
  uid: string;
  string: string;
  page: string;
  page_uid: string;
}

export function registerTagCommand(program: Command): void {
  program
    .command("tag <tag>")
    .description(
      "List blocks tagged with #tag or [[tag]] (semantically identical — both create :block/refs). " +
        "Pass --count to only print the total."
    )
    .option("--count", "Print only the count")
    .option("-l, --limit <n>", "Cap results", v => parseInt(v, 10))
    .action(async (tag: string, opts: { count?: boolean; limit?: number }, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });

      if (opts.count) {
        const res = await client.query<{ result?: [number][] }>(TAG_COUNT_Q, [tag]);
        const count = res?.result?.[0]?.[0] ?? 0;
        printResult({ tag, count }, globals.pretty ? "pretty" : "json");
        return;
      }

      const res = await client.query<{ result?: [string, string, string, string][] }>(TAG_REFS_Q, [tag]);
      const out: TagHit[] = (res?.result ?? []).map(([uid, str, pt, pu]) => ({ uid, string: str, page: pt, page_uid: pu }));
      const limited = opts.limit ? out.slice(0, opts.limit) : out;
      printResult(limited, globals.pretty ? "pretty" : "json");
    });
}
