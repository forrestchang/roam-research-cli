import { Command } from "commander";
import { RoamBackendClient } from "../client.js";
import { resolveAuth } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";

const PAGE_Q = `[
 :find ?uid ?title
 :in $ ?q
 :where
  [?p :node/title ?title]
  [?p :block/uid ?uid]
  [(clojure.string/lower-case ?title) ?lower]
  [(clojure.string/includes? ?lower ?q)]
]`;

const BLOCK_Q = `[
 :find ?uid ?str ?page-title ?page-uid
 :in $ ?q
 :where
  [?b :block/string ?str]
  [?b :block/uid ?uid]
  [(clojure.string/lower-case ?str) ?lower]
  [(clojure.string/includes? ?lower ?q)]
  [?b :block/page ?p]
  [?p :node/title ?page-title]
  [?p :block/uid ?page-uid]
]`;

interface SearchHit {
  type: "page" | "block";
  uid: string;
  text: string;
  page?: string;
  page_uid?: string;
}

export function registerSearchCommand(program: Command): void {
  program
    .command("search <query>")
    .description(
      "Case-insensitive substring search across page titles and block strings. " +
        "Default returns both; use --pages-only or --blocks-only to restrict."
    )
    .option("--pages-only", "Match only page titles")
    .option("--blocks-only", "Match only block strings")
    .option("-l, --limit <n>", "Cap results (applied to each side independently)", v => parseInt(v, 10), 100)
    .action(async (query: string, opts: { pagesOnly?: boolean; blocksOnly?: boolean; limit: number }, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      if (opts.pagesOnly && opts.blocksOnly) {
        throw new Error("--pages-only and --blocks-only are mutually exclusive.");
      }
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const needle = query.toLowerCase();
      const hits: SearchHit[] = [];

      if (!opts.blocksOnly) {
        const res = await client.query<{ result?: [string, string][] }>(PAGE_Q, [needle]);
        for (const [uid, title] of (res?.result ?? []).slice(0, opts.limit)) {
          hits.push({ type: "page", uid, text: title });
        }
      }
      if (!opts.pagesOnly) {
        const res = await client.query<{ result?: [string, string, string, string][] }>(BLOCK_Q, [needle]);
        for (const [uid, str, pageTitle, pageUid] of (res?.result ?? []).slice(0, opts.limit)) {
          hits.push({ type: "block", uid, text: str, page: pageTitle, page_uid: pageUid });
        }
      }

      printResult(hits, globals.pretty ? "pretty" : "json");
    });
}
