#!/usr/bin/env node
import { Command } from "commander";
import { registerConfigCommand } from "./commands/config.js";
import { registerQueryCommand } from "./commands/query.js";
import { registerPullCommand } from "./commands/pull.js";
import { registerBlockCommand } from "./commands/block.js";
import { registerPageCommand } from "./commands/page.js";
import { registerWriteCommand } from "./commands/write.js";
import { registerAppendCommand } from "./commands/append.js";
import { registerLocalCommand } from "./commands/local.js";
import { registerCaptureCommand } from "./commands/capture.js";
import { registerTodayCommand } from "./commands/today.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerOutlineCommand } from "./commands/outline.js";
import { registerBacklinksCommand } from "./commands/backlinks.js";
import { registerTodoCommand } from "./commands/todo.js";
import { registerTagCommand } from "./commands/tag.js";
import { registerExportCommand } from "./commands/export.js";
import { RoamApiError } from "./client.js";

const program = new Command();

program
  .name("roam")
  .description(
    "CLI for the Roam Research APIs (Backend + Append + Desktop Local) — friendly to humans and AI agents."
  )
  .version("0.3.0")
  .option("--token <token>", "Override API token (else uses ROAM_API_TOKEN or config)")
  .option("--graph <graph>", "Override graph name (else uses ROAM_GRAPH or config)")
  .option("--pretty", "Pretty-print JSON output (default is compact)", false);

registerConfigCommand(program);
registerCaptureCommand(program);
registerTodayCommand(program);
registerSearchCommand(program);
registerOutlineCommand(program);
registerBacklinksCommand(program);
registerTodoCommand(program);
registerTagCommand(program);
registerExportCommand(program);
registerQueryCommand(program);
registerPullCommand(program);
registerBlockCommand(program);
registerPageCommand(program);
registerWriteCommand(program);
registerAppendCommand(program);
registerLocalCommand(program);

program.parseAsync(process.argv).catch(err => {
  if (err instanceof RoamApiError) {
    const detail: Record<string, unknown> = {
      error: err.apiMessage ?? err.body ?? err.message,
      status: err.status,
      endpoint: err.endpoint,
    };
    if (err.retryAfter !== undefined) detail["retry-after-seconds"] = err.retryAfter;
    if (err.numActionsSucceeded !== undefined) {
      detail["num-actions-successfully-transacted-before-failure"] = err.numActionsSucceeded;
    }
    process.stderr.write(`error: ${JSON.stringify(detail)}\n`);
    process.exit(exitCodeFor(err.status));
  }
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

function exitCodeFor(status: number): number {
  if (status === 401 || status === 403) return 3;
  if (status === 413) return 4;
  if (status === 429) return 5;
  if (status >= 500) return 6;
  return 2;
}
