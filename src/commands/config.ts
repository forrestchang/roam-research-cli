import { Command } from "commander";
import { configPath, readConfig, updateConfig } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";

export function registerConfigCommand(program: Command): void {
  const cmd = program.command("config").description("Manage CLI configuration (API token, default graph)");

  cmd
    .command("set")
    .description("Set the API token, default graph, capture header, and/or local API token")
    .option("--token <token>", "Roam Research API token (Backend/Append; starts with 'roam-graph-token-')")
    .option("--graph <graph>", "Default graph name")
    .option("--capture-header <header>", "Default header used by `roam capture` (e.g. 'Captures from [[CLI]]')")
    .option(
      "--local-token <token>",
      "Desktop Local API token used by `roam file *` (starts with 'roam-graph-local-token-')"
    )
    .action((opts: { captureHeader?: string; localToken?: string }, command) => {
      const globals = command.optsWithGlobals() as GlobalOptions;
      const token = globals.token;
      const graph = globals.graph;

      if (!token && !graph && opts.captureHeader === undefined && opts.localToken === undefined) {
        process.stderr.write(
          "Nothing to set. Pass --token, --graph, --capture-header, and/or --local-token.\n"
        );
        process.exit(2);
      }
      const next = updateConfig({
        ...(token ? { token } : {}),
        ...(graph ? { graph } : {}),
        ...(opts.captureHeader !== undefined ? { captureHeader: opts.captureHeader } : {}),
        ...(opts.localToken !== undefined ? { localToken: opts.localToken } : {}),
      });
      printResult(
        {
          path: configPath(),
          graph: next.graph,
          token: next.token ? "***" : undefined,
          captureHeader: next.captureHeader,
          localToken: next.localToken ? "***" : undefined,
        },
        "pretty"
      );
    });

  cmd
    .command("show")
    .description("Show the current configuration (token is masked)")
    .action(() => {
      const cfg = readConfig();
      printResult(
        {
          path: configPath(),
          graph: cfg.graph,
          token: cfg.token ? "***" : undefined,
          captureHeader: cfg.captureHeader,
          localToken: cfg.localToken ? "***" : undefined,
        },
        "pretty"
      );
    });

  cmd
    .command("path")
    .description("Print the path to the config file")
    .action(() => {
      process.stdout.write(configPath() + "\n");
    });
}
