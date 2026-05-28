import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { RoamClient } from "@roam-research/roam-tools-local";
import {
  findTool,
  type CallToolResult,
  type ClientToolDefinition,
  type GraphType,
  type RoamActionClient,
} from "@roam-research/roam-tools-core";
import { readConfig } from "../config.js";
import { printResult } from "../output.js";
import type { GlobalOptions } from "../globals.js";

function clientTool(name: string): ClientToolDefinition {
  const tool = findTool(name);
  if (!tool || tool.type !== "client") {
    throw new Error(
      `Internal error: tool '${name}' is not exposed by @roam-research/roam-tools-core (got ${tool?.type ?? "undefined"}).`
    );
  }
  return tool;
}

async function runTool(
  name: string,
  client: RoamActionClient,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const tool = clientTool(name);
  return tool.action(client, args);
}

interface FileGlobalsLike extends GlobalOptions {
  localToken?: string;
  localPort?: number;
  graphType?: GraphType;
}

function buildLocalClient(globals: FileGlobalsLike): RoamClient {
  const cfg = readConfig();
  const graph = globals.graph ?? process.env.ROAM_GRAPH ?? cfg.graph;
  if (!graph) {
    throw new Error(
      "File commands require a graph name. Pass --graph, set ROAM_GRAPH, or run `roam config set --graph`."
    );
  }
  const token = globals.localToken ?? process.env.ROAM_LOCAL_API_TOKEN ?? cfg.localToken;
  if (!token) {
    throw new Error(
      "File commands require a Desktop Local API token (starts with 'roam-graph-local-token-'). " +
        "Create one in the Roam desktop app under Settings → Graph → Local API Tokens, then pass " +
        "--local-token, set ROAM_LOCAL_API_TOKEN, or run `roam config set --local-token <token>`."
    );
  }
  return new RoamClient({
    graphName: graph,
    graphType: globals.graphType ?? "hosted",
    token,
    port: globals.localPort,
  });
}

function unwrapTextResult<T = unknown>(result: CallToolResult): T {
  if (result.isError) {
    const first = result.content[0] as { type: string; text?: string } | undefined;
    throw new Error(first?.text ?? "File operation failed");
  }
  const first = result.content[0] as { type: string; text?: string };
  if (first?.type !== "text" || first.text === undefined) {
    throw new Error("Unexpected non-text result from file operation");
  }
  try {
    return JSON.parse(first.text) as T;
  } catch {
    return first.text as unknown as T;
  }
}

export function registerFileCommand(program: Command): void {
  const file = program
    .command("file")
    .description(
      "Upload, fetch, or delete files (images, PDFs, etc.) on Roam. Uses the Desktop Local API, " +
        "so the desktop app must be running and you need a separate Local API token (set with " +
        "`roam config set --local-token`)."
    )
    .option("--local-token <token>", "Desktop Local API token (overrides ROAM_LOCAL_API_TOKEN/config)")
    .option(
      "--local-port <port>",
      "Override the Local API port (defaults to the value in ~/.roam-local-api.json, or 3333)",
      (v: string) => Number(v)
    )
    .option("--graph-type <type>", "Graph type for the local API: 'hosted' (default) or 'offline'", "hosted");

  file
    .command("upload")
    .description(
      "Upload a file to Roam and print the resulting URL. Provide exactly one of --file, --url, or --base64."
    )
    .option("-f, --file <path>", "Local file path to upload")
    .option("-u, --url <url>", "Remote URL to fetch and re-upload")
    .option("--base64 <data>", "Raw base64-encoded payload")
    .option("--mimetype <type>", "Override MIME type (auto-detected if omitted)")
    .option("--filename <name>", "Override filename (auto-derived if omitted)")
    .action(
      async (
        opts: {
          file?: string;
          url?: string;
          base64?: string;
          mimetype?: string;
          filename?: string;
        },
        cmd
      ) => {
        const globals = cmd.optsWithGlobals() as FileGlobalsLike;
        const client = buildLocalClient(globals);
        const result = await runTool("file_upload", client, {
          filePath: opts.file,
          url: opts.url,
          base64: opts.base64,
          mimetype: opts.mimetype,
          filename: opts.filename,
        });
        printResult(unwrapTextResult(result), globals.pretty ? "pretty" : "json");
      }
    );

  file
    .command("get <url>")
    .description(
      "Fetch a file from Roam by its storage URL. By default prints the JSON payload; pass --output " +
        "to write the bytes to disk instead (recommended for images / PDFs)."
    )
    .option("-o, --output <path>", "Write the raw file bytes to this path instead of printing JSON")
    .action(async (url: string, opts: { output?: string }, cmd) => {
      const globals = cmd.optsWithGlobals() as FileGlobalsLike;
      const client = buildLocalClient(globals);
      const result = await runTool("file_get", client, { url });
      if (result.isError) {
        const first = result.content[0] as { text?: string } | undefined;
        throw new Error(first?.text ?? "file get failed");
      }
      const first = result.content[0] as
        | { type: "text"; text: string }
        | { type: "image"; data: string; mimeType: string };
      if (first.type === "image") {
        if (opts.output) {
          const buf = Buffer.from(first.data, "base64");
          writeFileSync(opts.output, buf);
          printResult(
            { path: opts.output, bytes: buf.length, mimeType: first.mimeType },
            globals.pretty ? "pretty" : "json"
          );
          return;
        }
        printResult(
          { mimeType: first.mimeType, base64: first.data },
          globals.pretty ? "pretty" : "json"
        );
        return;
      }
      const parsed = (() => {
        try {
          return JSON.parse(first.text);
        } catch {
          return first.text;
        }
      })();
      if (opts.output && parsed && typeof parsed === "object" && typeof (parsed as { base64?: string }).base64 === "string") {
        const payload = parsed as { base64: string; mimetype?: string };
        const buf = Buffer.from(payload.base64, "base64");
        writeFileSync(opts.output, buf);
        printResult(
          { path: opts.output, bytes: buf.length, mimeType: payload.mimetype },
          globals.pretty ? "pretty" : "json"
        );
        return;
      }
      printResult(parsed, globals.pretty ? "pretty" : "json");
    });

  file
    .command("delete <url>")
    .description("Delete a file from Roam by its storage URL.")
    .action(async (url: string, _opts, cmd) => {
      const globals = cmd.optsWithGlobals() as FileGlobalsLike;
      const client = buildLocalClient(globals);
      const result = await runTool("file_delete", client, { url });
      printResult(unwrapTextResult(result), globals.pretty ? "pretty" : "json");
    });
}
