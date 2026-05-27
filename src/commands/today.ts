import { Command } from "commander";
import { RoamBackendClient } from "../client.js";
import { resolveAuth } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";
import { todayDnp, dnpToTitle } from "../dates.js";
import { renderOutlineMarkdown, type OutlineNode } from "../markdown.js";

const OUTLINE_SELECTOR = "[:block/uid :node/title :block/string :block/order :block/heading {:block/children ...}]";

export function registerTodayCommand(program: Command): void {
  program
    .command("today")
    .description(
      "Show today's Daily Notes Page (uid + title, or full outline). " +
        "Roam uses the MM-DD-YYYY string as the DNP uid, so `--uid` works even before the page exists."
    )
    .option("--uid", "Print only the DNP uid (MM-DD-YYYY) — no API call")
    .option("--show", "Print the full outline as markdown")
    .option("--date <MM-DD-YYYY>", "Use a specific date instead of today")
    .action(async (opts: { uid?: boolean; show?: boolean; date?: string }, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const dnp = opts.date ?? todayDnp();
      const title = dnpToTitle(dnp);

      if (opts.uid) {
        process.stdout.write(dnp + "\n");
        return;
      }

      const client = new RoamBackendClient({ auth: resolveAuth(globals) });
      const raw = await client.pull<{ result?: OutlineNode } | null>(dnp, OUTLINE_SELECTOR);
      const pulled = raw?.result ?? null;

      if (opts.show) {
        if (!pulled) {
          process.stdout.write(`# ${title}\n\n_(empty — page does not exist yet)_\n`);
          return;
        }
        process.stdout.write(renderOutlineMarkdown(pulled));
        return;
      }

      printResult(
        {
          dnp,
          title,
          uid: dnp,
          exists: pulled !== null,
        },
        globals.pretty ? "pretty" : "json"
      );
    });
}
