// Typed client for the HelpDesk API. Next.js forwards /api/* to FastAPI.
// Support-team login is an httpOnly cookie; customer chats use a per-chat token instead.

export type User = { id: string; email: string; name: string; created_at: string };

export type Source = { n: number; document: string; heading: string; snippet: string; score: number };

export type Message = {
  id: number;
  role: "customer" | "ai" | "agent" | "system";
  content: string;
  author: string;
  sources: Source[];
  meta: { route?: string; ticket_number?: number | null; order?: OrderFacts | null; offered_handoff?: boolean; feedback?: "up" | "down" };
  created_at: string;
  trace?: Trace | null;
};

export type OrderFacts = {
  found: boolean;
  order_number: string;
  status?: "processing" | "shipped" | "delivered" | "cancelled";
  items?: string[];
  total_usd?: number;
  shipping_method?: string;
  placed?: string | null;
  shipped?: string | null;
  delivered?: string | null;
  estimated_delivery?: string | null;
  carrier?: string | null;
  tracking_number?: string | null;
};

export type CustomerOrder = { number: string; status: string; total: number; placed_at: string; items: string[]; tracking: string; carrier: string };

export type ToolCall = { tool: string; [k: string]: unknown };

export type Trace = {
  route?: string;
  analysis?: { intent: string; mood: string; refund_request: boolean; order_number: string | null; standalone_question: string };
  tool_calls?: ToolCall[];
  check?: Record<string, unknown> | null;
  handoff_reason?: string;
  ticket_number?: number | null;
  seconds?: number;
  model?: string;
};

export type ChatStatus = "ai" | "human" | "closed";

export type Chat = { id: string; token?: string; status: ChatStatus; customer_name?: string; messages: Message[] };

export type Ticket = {
  id: number;
  number: number;
  subject: string;
  summary: string;
  category: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "solved";
  customer_email: string;
  order_number: string;
  notes: { at: string; by: string; text: string }[];
  conversation_id: string | null;
  hubspot: { status: "off" | "pending" | "synced" | "failed"; id: string; error: string };
  created_at: string;
  updated_at: string;
};

export type ConversationSummary = {
  id: string;
  customer_name: string;
  customer_email: string;
  status: ChatStatus;
  resolution: string;
  handoff_reason: string;
  customer_messages: number;
  last_message: { role: string; content: string } | null;
  waiting_for_team: boolean;
  ticket: { number: number; priority: string } | null;
  created_at: string;
  updated_at: string;
};

export type Conversation = ConversationSummary & { messages: Message[]; tickets: Ticket[]; orders: CustomerOrder[] };

export type Doc = { id: string; title: string; filename: string; chunks: number; words: number; created_at: string };
export type SearchHit = { label: string; document: string; heading: string; snippet: string; score: number };

export type Stats = {
  days: number;
  conversations: number;
  resolved_by_ai: number;
  handed_off: number;
  ai_resolution_rate: number;
  open_tickets: number;
  tickets_created: number;
  avg_reply_seconds: number | null;
  feedback: { up: number; down: number };
  top_topics: { topic: string; count: number }[];
  handoff_reasons: { reason: string; count: number }[];
  replies_by_route: Record<string, number>;
  daily: { date: string; conversations: number; handed_off: number }[];
};

export type Health = { ok: boolean; llm: boolean; model: string; hubspot: boolean };

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const OFFLINE = "Can't reach the HelpDesk server. Is the API running?";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init });
  } catch {
    throw new ApiError(OFFLINE, 0);
  }
  if (!res.ok) {
    let msg = `Something went wrong (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail) && body.detail[0]?.msg) msg = friendlyValidation(body.detail[0]);
    } catch {
      if (res.status >= 500) msg = OFFLINE;
    }
    throw new ApiError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

function friendlyValidation(d: { loc?: string[]; msg: string }) {
  const field = d.loc?.[d.loc.length - 1];
  if (field === "password") return "Password must be at least 8 characters.";
  if (field === "email") return "Please enter a valid email address.";
  if (field === "name") return "Please enter your name.";
  return d.msg;
}

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const json = (body: unknown) => send("POST", body);
const chatHeaders = (token: string) => ({ "X-Chat-Token": token });

export type ChatEvent =
  | { type: "status"; text: string }
  | { type: "token"; text: string }
  | { type: "reset" }
  | { type: "error"; text: string }
  | { type: "done"; message: Message | null; conversation: { id: string; status: ChatStatus } };

/** Send a customer message and read the agent's reply as it streams (Server-Sent Events). */
async function streamMessage(id: string, token: string, text: string, onEvent: (e: ChatEvent) => void) {
  let res: Response;
  try {
    res = await fetch(`/api/chat/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...chatHeaders(token) },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new ApiError(OFFLINE, 0);
  }
  if (!res.ok || !res.body) throw new ApiError(res.status === 404 ? "This chat has expired." : OFFLINE, res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i;
    while ((i = buffer.indexOf("\n\n")) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 2);
      if (line.startsWith("data: ")) onEvent(JSON.parse(line.slice(6)) as ChatEvent);
    }
  }
}

export const api = {
  health: () => call<Health>("/api/health"),

  me: () => call<User>("/api/auth/me"),
  signup: (b: { email: string; password: string; name: string }) => call<User>("/api/auth/signup", json(b)),
  login: (b: { email: string; password: string }) => call<User>("/api/auth/login", json(b)),
  logout: () => call<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  // customer chat
  // name/email can be left out when the shopper is logged in (their account is used)
  startChat: (b: { name?: string; email?: string }) => call<Chat>("/api/chat/start", json(b)),
  chat: (id: string, token: string, after = 0) =>
    call<Chat>(`/api/chat/${id}?after=${after}`, { headers: chatHeaders(token) }),
  streamMessage,
  feedback: (id: string, token: string, messageId: number, value: "up" | "down" | "none") =>
    call<Message>(`/api/chat/${id}/messages/${messageId}/feedback`, {
      method: "POST", headers: { "Content-Type": "application/json", ...chatHeaders(token) }, body: JSON.stringify({ value }),
    }),

  // dashboard
  stats: (days = 7) => call<Stats>(`/api/admin/stats?days=${days}`),
  conversations: () => call<ConversationSummary[]>("/api/admin/conversations"),
  conversation: (id: string) => call<Conversation>(`/api/admin/conversations/${id}`),
  suggest: (id: string) => call<{ text: string }>(`/api/admin/conversations/${id}/suggest`, { method: "POST" }),
  reply: (id: string, text: string) => call<Message>(`/api/admin/conversations/${id}/reply`, json({ text })),
  setChatStatus: (id: string, status: ChatStatus) =>
    call<ConversationSummary>(`/api/admin/conversations/${id}/status`, json({ status })),
  tickets: () => call<Ticket[]>("/api/admin/tickets"),
  updateTicket: (id: number, b: { status?: string; priority?: string; note?: string }) =>
    call<Ticket>(`/api/admin/tickets/${id}`, send("PATCH", b)),
  syncTicket: (id: number) => call<Ticket>(`/api/admin/tickets/${id}/sync`, { method: "POST" }),
  docs: () => call<Doc[]>("/api/admin/docs"),
  uploadDoc: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return call<Doc>("/api/admin/docs", { method: "POST", body: fd });
  },
  deleteDoc: (id: string) => call<{ ok: boolean }>(`/api/admin/docs/${id}`, { method: "DELETE" }),
  search: (q: string) => call<SearchHit[]>(`/api/admin/search?q=${encodeURIComponent(q)}`),
};
