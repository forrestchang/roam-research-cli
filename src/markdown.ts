/**
 * Tree node as returned by a recursive pull, e.g.
 *   [:node/title :block/string :block/uid :block/order :block/heading {:block/children ...}]
 */
export interface OutlineNode {
  ":node/title"?: string;
  ":block/string"?: string;
  ":block/uid"?: string;
  ":block/order"?: number;
  ":block/heading"?: number;
  ":block/children"?: OutlineNode[];
  // Also accept the Local API style (keyword-as-string without leading colon)
  "node/title"?: string;
  "block/string"?: string;
  "block/uid"?: string;
  "block/order"?: number;
  "block/heading"?: number;
  "block/children"?: OutlineNode[];
}

function field<T>(n: OutlineNode, name: string): T | undefined {
  return ((n as Record<string, unknown>)[`:${name}`] ?? (n as Record<string, unknown>)[name]) as T | undefined;
}

export function renderOutlineMarkdown(node: OutlineNode): string {
  const lines: string[] = [];
  const title = field<string>(node, "node/title");
  if (title) {
    lines.push(`# ${title}`);
    lines.push("");
    const children = sortChildren(field<OutlineNode[]>(node, "block/children"));
    for (const c of children) renderBlock(c, 0, lines);
    return lines.join("\n").trimEnd() + "\n";
  }
  renderBlock(node, 0, lines);
  return lines.join("\n").trimEnd() + "\n";
}

function renderBlock(n: OutlineNode, depth: number, out: string[]): void {
  const text = field<string>(n, "block/string") ?? "";
  const heading = field<number>(n, "block/heading");
  const indent = "  ".repeat(depth);
  const prefix = heading === 1 ? "# " : heading === 2 ? "## " : heading === 3 ? "### " : "";
  // Roam blocks are bulleted by default; we preserve that as `- ` and apply heading prefix inside.
  out.push(`${indent}- ${prefix}${text}`);
  const children = sortChildren(field<OutlineNode[]>(n, "block/children"));
  for (const c of children) renderBlock(c, depth + 1, out);
}

function sortChildren(children: OutlineNode[] | undefined): OutlineNode[] {
  if (!children) return [];
  return [...children].sort((a, b) => {
    const ao = field<number>(a, "block/order") ?? 0;
    const bo = field<number>(b, "block/order") ?? 0;
    return ao - bo;
  });
}
