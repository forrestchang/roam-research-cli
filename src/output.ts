export type OutputFormat = "json" | "pretty";

export function printResult(value: unknown, format: OutputFormat = "json"): void {
  if (value === undefined || value === null) {
    if (format === "pretty") process.stdout.write("OK\n");
    else process.stdout.write("null\n");
    return;
  }
  if (typeof value === "string") {
    process.stdout.write(value.endsWith("\n") ? value : value + "\n");
    return;
  }
  if (format === "pretty") {
    process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  } else {
    process.stdout.write(JSON.stringify(value) + "\n");
  }
}

export function fail(message: string, code = 1): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(code);
}
