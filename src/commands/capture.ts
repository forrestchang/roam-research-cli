import { Command } from "commander";
import { RoamAppendClient, type AppendBlock, type AppendRequest } from "../client.js";
import { DEFAULT_CAPTURE_HEADER, readConfig, resolveAuth } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";
import { todayDnp, isDnpString } from "../dates.js";

export function registerCaptureCommand(program: Command): void {
  program
    .command("capture")
    .description(
      "Capture a quick note to a Daily Notes Page under a configurable header. " +
        "Defaults to today's DNP and the `captureHeader` from config (or 'Captures from [[CLI]]'). " +
        "Uses the Append API so it works on encrypted graphs too."
    )
    .argument("[text...]", "Block text. Pass multiple positional strings or repeat -s to capture sibling blocks.")
    .option("-s, --string <text...>", "Block text (repeatable). Equivalent to positional args.")
    .option("--dnp <MM-DD-YYYY>", "Capture to a specific DNP instead of today")
    .option("--page <title>", "Capture to a named page instead of a DNP")
    .option(
      "--header <text>",
      "Override the nest-under header for this capture. Pass an empty string to disable nesting."
    )
    .option("--no-header", "Disable the nest-under header entirely (write at page top-level)")
    .action(async (positional: string[], opts, cmd) => {
      const globals = cmd.optsWithGlobals() as GlobalOptions;
      const cfg = readConfig();

      const strings = [...(positional ?? []), ...((opts.string as string[] | undefined) ?? [])].filter(s => s !== undefined && s !== "");
      if (strings.length === 0) {
        throw new Error("Nothing to capture. Pass text as positional args or via -s/--string.");
      }
      if (opts.dnp && opts.page) {
        throw new Error("--dnp and --page are mutually exclusive.");
      }
      if (opts.dnp && !isDnpString(opts.dnp)) {
        throw new Error(`Invalid --dnp '${opts.dnp}'. Expected MM-DD-YYYY (e.g. 05-27-2026).`);
      }

      const dnp = opts.page ? undefined : (opts.dnp ?? todayDnp());
      const headerOverride: string | undefined =
        opts.header !== undefined ? (opts.header || undefined) : undefined;
      const headerFromCfg = cfg.captureHeader ?? DEFAULT_CAPTURE_HEADER;
      // Commander's --no-header sets opts.header === false at parse time when the user passes it.
      const headerDisabled = (opts as { header?: boolean | string }).header === false;
      const header = headerDisabled ? undefined : (headerOverride ?? headerFromCfg);

      const location = opts.page
        ? { page: { title: opts.page } as { title: string } }
        : { page: { title: { "daily-note-page": dnp! } } };

      const req: AppendRequest = {
        location: header ? { ...location, "nest-under": { string: header } } : location,
        "append-data": strings.map<AppendBlock>(s => ({ string: s })),
      };

      const client = new RoamAppendClient({ auth: resolveAuth(globals) });
      const res = await client.appendBlocks(req);
      printResult(
        res ?? {
          ok: true,
          captured: strings.length,
          target: opts.page ? { page: opts.page } : { dnp },
          header: header ?? null,
        },
        globals.pretty ? "pretty" : "json"
      );
    });
}
