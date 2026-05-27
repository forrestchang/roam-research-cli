import type { WriteLocation, PageTitle } from "./client.js";

export interface LocationOpts {
  parent?: string;
  pageTitle?: string;
  dnp?: string;
  order: string;
}

const DNP_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])-\d{4}$/;

export function parsePageTitle(opts: { pageTitle?: string; dnp?: string }): PageTitle | undefined {
  if (opts.dnp) {
    if (!DNP_RE.test(opts.dnp)) {
      throw new Error(`Invalid --dnp value '${opts.dnp}'. Expected MM-DD-YYYY (e.g. 05-27-2026).`);
    }
    return { "daily-note-page": opts.dnp };
  }
  if (opts.pageTitle !== undefined) return opts.pageTitle;
  return undefined;
}

export function parseLocation(opts: LocationOpts): WriteLocation {
  const sources = [opts.parent, opts.pageTitle, opts.dnp].filter(v => v !== undefined && v !== "");
  if (sources.length === 0) {
    throw new Error("Provide one of --parent <uid>, --page-title <title>, or --dnp <MM-DD-YYYY>.");
  }
  if (sources.length > 1) {
    throw new Error("--parent, --page-title, and --dnp are mutually exclusive.");
  }
  const order = parseOrder(opts.order);
  if (opts.parent) return { "parent-uid": opts.parent, order };
  const pageTitle = parsePageTitle(opts);
  return { "page-title": pageTitle as PageTitle, order };
}

export function parseOrder(value: string): number | "first" | "last" {
  if (value === "first" || value === "last") return value;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid --order '${value}'. Use 'first', 'last', or a non-negative integer.`);
  }
  return n;
}

const VIEW_TYPES = new Set(["bullet", "document", "numbered"]);
export function parseView(value: string | undefined): "bullet" | "document" | "numbered" | undefined {
  if (value === undefined) return undefined;
  if (!VIEW_TYPES.has(value)) {
    throw new Error(`Invalid view type '${value}'. Use bullet | document | numbered.`);
  }
  return value as "bullet" | "document" | "numbered";
}

const ALIGN_TYPES = new Set(["left", "center", "right", "justify"]);
export function parseAlign(value: string | undefined): "left" | "center" | "right" | "justify" | undefined {
  if (value === undefined) return undefined;
  if (!ALIGN_TYPES.has(value)) {
    throw new Error(`Invalid text-align '${value}'. Use left | center | right | justify.`);
  }
  return value as "left" | "center" | "right" | "justify";
}
