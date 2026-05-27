import { Command } from "commander";
import { RoamBackendClient, type WriteAction } from "../client.js";
import { resolveAuth } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";

const TODO_TOKEN = "{{[[TODO]]}}";
const DONE_TOKEN = "{{[[DONE]]}}";

const TODO_Q = `[
 :find ?uid ?str ?page-title ?page-uid
 :where
  [?b :block/string ?str]
  [(clojure.string/includes? ?str "{{[[TODO]]}}")]
  [?b :block/uid ?uid]
  [?b :block/page ?p]
  [?p :node/title ?page-title]
  [?p :block/uid ?page-uid]
]`;

const TODO_BY_PAGE_Q = `[
 :find ?uid ?str ?page-title ?page-uid
 :in $ ?page-title
 :where
  [?p :node/title ?page-title]
  [?p :block/uid ?page-uid]
  [?b :block/page ?p]
  [?b :block/string ?str]
  [(clojure.string/includes? ?str "{{[[TODO]]}}")]
  [?b :block/uid ?uid]
]`;

interface TodoRow {
  uid: string;
  string: string;
  page: string;
  page_uid: string;
}

export function registerTodoCommand(program: Command): void {
  const todo = program.command("todo").description("List and resolve {{[[TODO]]}} blocks");

  todo
    .command("list")
    .description("List blocks containing {{[[TODO]]}}. Filter by --page.")
    .option("--page <title>", "Only list TODOs on this page")
    .option("-l, --limit <n>", "Cap results", v => parseInt(v, 10))
    .action(async (opts: { page?: string; limit?: number }, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const res = opts.page
        ? await client.query<{ result?: [string, string, string, string][] }>(TODO_BY_PAGE_Q, [opts.page])
        : await client.query<{ result?: [string, string, string, string][] }>(TODO_Q);
      const out: TodoRow[] = (res?.result ?? []).map(([uid, str, pt, pu]) => ({
        uid,
        string: str,
        page: pt,
        page_uid: pu,
      }));
      const limited = opts.limit ? out.slice(0, opts.limit) : out;
      printResult(limited, globals.pretty ? "pretty" : "json");
    });

  todo
    .command("done <uid>")
    .description("Mark a TODO block as done (replaces the first {{[[TODO]]}} occurrence with {{[[DONE]]}}).")
    .action(async (uid: string, _opts, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const pulled = await client.pull<{ result?: { ":block/string"?: string } } | null>(uid, "[:block/string]");
      const current = pulled?.result?.[":block/string"];
      if (!current) {
        throw new Error(`Block '${uid}' not found or has no string content.`);
      }
      if (!current.includes(TODO_TOKEN)) {
        throw new Error(`Block '${uid}' does not contain ${TODO_TOKEN}. Current content: ${JSON.stringify(current)}`);
      }
      const next = current.replace(TODO_TOKEN, DONE_TOKEN);
      const action: WriteAction = { action: "update-block", block: { uid, string: next } };
      const res = await client.write(action);
      printResult(
        res ?? { ok: true, uid, before: current, after: next },
        globals.pretty ? "pretty" : "json"
      );
    });

  todo
    .command("reopen <uid>")
    .description("Flip a DONE block back to TODO.")
    .action(async (uid: string, _opts, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const pulled = await client.pull<{ result?: { ":block/string"?: string } } | null>(uid, "[:block/string]");
      const current = pulled?.result?.[":block/string"];
      if (!current) {
        throw new Error(`Block '${uid}' not found or has no string content.`);
      }
      if (!current.includes(DONE_TOKEN)) {
        throw new Error(`Block '${uid}' does not contain ${DONE_TOKEN}.`);
      }
      const next = current.replace(DONE_TOKEN, TODO_TOKEN);
      const action: WriteAction = { action: "update-block", block: { uid, string: next } };
      const res = await client.write(action);
      printResult(
        res ?? { ok: true, uid, before: current, after: next },
        globals.pretty ? "pretty" : "json"
      );
    });
}
