import type { ResolvedAuth } from "./config.js";

const DEFAULT_BACKEND_URL = "https://api.roamresearch.com";
const DEFAULT_APPEND_URL = "https://append-api.roamresearch.com";
const DEFAULT_LOCAL_URL = "http://localhost:3333";

export type PageTitle = string | { "daily-note-page": string };

export type WriteLocation =
  | { "parent-uid": string | number; order: number | "first" | "last" }
  | { "page-title": PageTitle; order: number | "first" | "last" };

export type WriteAction =
  | {
      action: "create-block";
      location: WriteLocation;
      block: {
        string: string;
        uid?: string | number;
        open?: boolean;
        heading?: 1 | 2 | 3;
        "text-align"?: "left" | "center" | "right" | "justify";
        "children-view-type"?: "bullet" | "document" | "numbered";
        "block-view-type"?: "bullet" | "document" | "numbered";
      };
    }
  | {
      action: "update-block";
      block: {
        uid: string;
        string?: string;
        open?: boolean;
        heading?: 0 | 1 | 2 | 3;
        "text-align"?: "left" | "center" | "right" | "justify";
        "children-view-type"?: "bullet" | "document" | "numbered";
        "block-view-type"?: "bullet" | "document" | "numbered";
      };
    }
  | { action: "move-block"; location: WriteLocation; block: { uid: string } }
  | { action: "delete-block"; block: { uid: string } }
  | {
      action: "create-page";
      page: {
        title: string;
        uid?: string | number;
        "children-view-type"?: "bullet" | "document" | "numbered";
      };
    }
  | {
      action: "update-page";
      page: {
        uid: string;
        title?: string;
        "children-view-type"?: "bullet" | "document" | "numbered";
      };
    }
  | { action: "delete-page"; page: { uid: string } };

export type BatchAction = { action: "batch-actions"; actions: WriteAction[] };

export interface AppendBlock {
  string: string;
  uid?: string;
  open?: boolean;
  heading?: 0 | 1 | 2 | 3;
  "text-align"?: "left" | "center" | "right" | "justify";
  "children-view-type"?: "bullet" | "document" | "numbered";
  children?: AppendBlock[];
}

export interface AppendLocationPage {
  page: { title: PageTitle };
  "nest-under"?: { string: string };
}
export interface AppendLocationBlock {
  block: { uid: string };
  "nest-under"?: { string: string };
}
export type AppendLocation = AppendLocationPage | AppendLocationBlock;

export interface AppendRequest {
  location: AppendLocation;
  "append-data": AppendBlock[];
}

/**
 * Structured error from any Roam API. Carries enough context for an LLM/agent
 * caller to decide whether to retry, surface to the user, or give up.
 */
export class RoamApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly endpoint: string;
  /** Parsed `{message}` from the body, if the API returned JSON. */
  readonly apiMessage?: string;
  /** `Retry-After` header (seconds) on 429 responses. */
  readonly retryAfter?: number;
  /** Number of batch actions committed before failure (4XX responses to batch-actions). */
  readonly numActionsSucceeded?: number;

  constructor(opts: {
    status: number;
    body: string;
    endpoint: string;
    apiMessage?: string;
    retryAfter?: number;
    numActionsSucceeded?: number;
  }) {
    const msg = opts.apiMessage
      ? `Roam ${opts.endpoint} HTTP ${opts.status}: ${opts.apiMessage}`
      : `Roam ${opts.endpoint} HTTP ${opts.status}: ${opts.body || "(no body)"}`;
    super(msg);
    this.name = "RoamApiError";
    this.status = opts.status;
    this.body = opts.body;
    this.endpoint = opts.endpoint;
    this.apiMessage = opts.apiMessage;
    this.retryAfter = opts.retryAfter;
    this.numActionsSucceeded = opts.numActionsSucceeded;
  }
}

interface RequestOpts {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  endpointLabel: string;
}

async function httpRequest<T>(url: string, opts: RequestOpts): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? "POST",
    headers: {
      "Accept": "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers ?? {}),
    },
    redirect: "follow",
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  };

  const res = await fetch(url, init);
  const rawText = await res.text().catch(() => "");

  if (!res.ok) {
    let apiMessage: string | undefined;
    let numActionsSucceeded: number | undefined;
    if (rawText) {
      try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === "object") {
          if (typeof parsed.message === "string") apiMessage = parsed.message;
          // Backend API returns this nested under data on batch-actions failure
          const n =
            parsed["num-actions-successfully-transacted-before-failure"] ??
            parsed?.data?.["num-actions-successfully-transacted-before-failure"];
          if (typeof n === "number") numActionsSucceeded = n;
        }
      } catch {
        /* non-JSON body — leave apiMessage undefined */
      }
    }
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    throw new RoamApiError({
      status: res.status,
      body: rawText,
      endpoint: opts.endpointLabel,
      apiMessage,
      retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
      numActionsSucceeded,
    });
  }

  if (res.status === 204 || !rawText) return undefined as T;
  try {
    return JSON.parse(rawText) as T;
  } catch {
    return rawText as unknown as T;
  }
}

/**
 * Encode an EID for the Backend API. Lookup-refs must arrive as EDN-style
 * strings (e.g. `[:block/uid "abc"]`), not JSON tuples — the server otherwise
 * returns `Lookup ref attribute should be marked as :db/unique`.
 */
function encodeEid(eid: string | [string, string]): string {
  if (typeof eid === "string") {
    const t = eid.trim();
    if (t.startsWith("[") || /^-?\d+$/.test(t)) return t;
    return `[:block/uid "${escapeEdnString(t)}"]`;
  }
  const [attr, value] = eid;
  return `[${attr} "${escapeEdnString(value)}"]`;
}

function escapeEdnString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function authHeaders(token: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${token}`,
    "x-authorization": `Bearer ${token}`,
  };
}

export interface BackendClientOptions {
  auth: ResolvedAuth;
  baseUrl?: string;
}

export class RoamBackendClient {
  private readonly baseUrl: string;
  private readonly auth: ResolvedAuth;

  constructor(opts: BackendClientOptions) {
    this.auth = opts.auth;
    this.baseUrl = (opts.baseUrl ?? process.env.ROAM_API_BASE_URL ?? DEFAULT_BACKEND_URL).replace(/\/+$/, "");
  }

  private url(path: string): string {
    return `${this.baseUrl}/api/graph/${encodeURIComponent(this.auth.graph)}/${path}`;
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return httpRequest<T>(this.url(path), {
      method: "POST",
      body,
      headers: authHeaders(this.auth.token),
      endpointLabel: path,
    });
  }

  query<T = unknown>(query: string, args: unknown[] = []): Promise<T> {
    return this.post<T>("q", { query, args });
  }

  pull<T = unknown>(eid: string | [string, string], selector: string = "[*]"): Promise<T> {
    return this.post<T>("pull", { eid: encodeEid(eid), selector });
  }

  pullMany<T = unknown>(eids: Array<string | [string, string]>, selector: string = "[*]"): Promise<T> {
    const encoded = "[" + eids.map(e => encodeEid(e)).join(" ") + "]";
    return this.post<T>("pull-many", { eids: encoded, selector });
  }

  write<T = unknown>(action: WriteAction | BatchAction): Promise<T> {
    return this.post<T>("write", action as unknown as Record<string, unknown>);
  }
}

export interface AppendClientOptions {
  auth: ResolvedAuth;
  baseUrl?: string;
}

export class RoamAppendClient {
  private readonly baseUrl: string;
  private readonly auth: ResolvedAuth;

  constructor(opts: AppendClientOptions) {
    this.auth = opts.auth;
    this.baseUrl = (opts.baseUrl ?? process.env.ROAM_APPEND_API_BASE_URL ?? DEFAULT_APPEND_URL).replace(/\/+$/, "");
  }

  private url(path: string): string {
    return `${this.baseUrl}/api/graph/${encodeURIComponent(this.auth.graph)}/${path}`;
  }

  appendBlocks<T = unknown>(req: AppendRequest): Promise<T> {
    return httpRequest<T>(this.url("append-blocks"), {
      method: "POST",
      body: req,
      headers: authHeaders(this.auth.token),
      endpointLabel: "append-blocks",
    });
  }
}

export interface LocalClientOptions {
  baseUrl?: string;
  graph?: string;
  /** Optional bearer token. Older builds of the desktop API needed nothing; newer builds reject without it. */
  token?: string;
}

export interface LocalApiInfo {
  port: number;
  "last-graph"?: string;
}

export interface LocalResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
}

export class RoamLocalClient {
  readonly baseUrl: string;
  readonly graph?: string;
  private readonly token?: string;

  constructor(opts: LocalClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.ROAM_LOCAL_API_BASE_URL ?? DEFAULT_LOCAL_URL).replace(/\/+$/, "");
    this.graph = opts.graph;
    this.token = opts.token;
  }

  private headers(): Record<string, string> | undefined {
    return this.token ? authHeaders(this.token) : undefined;
  }

  async invoke<T = unknown>(action: string, args: unknown[] = [], graph?: string): Promise<LocalResponse<T>> {
    const g = graph ?? this.graph;
    if (!g) throw new Error("Local API requires a graph name (use --graph, set ROAM_GRAPH, or `roam local discover`).");
    return httpRequest<LocalResponse<T>>(`${this.baseUrl}/api/${encodeURIComponent(g)}`, {
      method: "POST",
      body: { action, args },
      headers: this.headers(),
      endpointLabel: `local ${action}`,
    });
  }

  graphsOpen<T = unknown>(): Promise<LocalResponse<T>> {
    return httpRequest<LocalResponse<T>>(`${this.baseUrl}/api/graphs/open`, {
      method: "GET",
      headers: this.headers(),
      endpointLabel: "local graphs/open",
    });
  }

  graphsAvailable<T = unknown>(): Promise<LocalResponse<T>> {
    return httpRequest<LocalResponse<T>>(`${this.baseUrl}/api/graphs/available`, {
      method: "GET",
      headers: this.headers(),
      endpointLabel: "local graphs/available",
    });
  }
}
