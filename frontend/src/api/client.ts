import { useSessionStore } from "../store/session";
import type {
  ApiEnvelope,
  Application,
  ApplicationCounts,
  ApplicationStatus,
  ChatMessage,
  ChatResponse,
  DemoJob,
  ExtractResult,
  Health,
  JobSearchForm,
  MatchResponse,
  ResumeData,
} from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function authHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {};
  const { accessCode, sessionId } = useSessionStore.getState();
  if (accessCode) headers["x-access-code"] = accessCode;
  if (sessionId) headers["x-session-id"] = sessionId;
  if (token) headers["x-user-token"] = token;
  return headers;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) return data.detail.map((item: { msg?: string }) => item.msg).join("；");
    if (typeof data?.message === "string") return data.message;
  } catch {
    // fall through
  }
  return `请求失败（HTTP ${response.status}）`;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  const auth = authHeaders(token) as Record<string, string>;
  Object.entries(auth).forEach(([key, value]) => headers.set(key, value));

  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, body });
  if (!response.ok) {
    throw new ApiError(response.status, await parseError(response));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getHealth(): Promise<Health> {
  return request<Health>("/api/health");
}

export function getDemoResume(): Promise<ApiEnvelope<ResumeData>> {
  return request<ApiEnvelope<ResumeData>>("/api/demo/resume");
}

export function getDemoJobs(): Promise<ApiEnvelope<DemoJob[]>> {
  return request<ApiEnvelope<DemoJob[]>>("/api/demo/jobs");
}

export function getLiepinResume(token: string): Promise<ApiEnvelope<ResumeData>> {
  return request<ApiEnvelope<ResumeData>>("/api/liepin/resume", {}, token);
}

export function searchLiepinJobs(
  token: string,
  form: JobSearchForm,
): Promise<ApiEnvelope<unknown>> {
  return request<ApiEnvelope<unknown>>(
    "/api/liepin/jobs/search",
    { method: "POST", body: form as unknown as BodyInit },
    token,
  );
}

export function applyLiepinJob(
  token: string,
  jobId: number,
  jobKind: "1" | "2",
): Promise<ApiEnvelope<unknown>> {
  return request<ApiEnvelope<unknown>>(
    "/api/liepin/apply",
    { method: "POST", body: { job_id: jobId, job_kind: jobKind } as unknown as BodyInit },
    token,
  );
}

export function demoApply(jobId: number, jobKind: "1" | "2"): Promise<ApiEnvelope<unknown>> {
  return request<ApiEnvelope<unknown>>("/api/demo/apply", {
    method: "POST",
    body: { job_id: jobId, job_kind: jobKind } as unknown as BodyInit,
  });
}

export function chat(messages: ChatMessage[]): Promise<ChatResponse> {
  return request<ChatResponse>("/api/llm/chat", {
    method: "POST",
    body: { messages } as unknown as BodyInit,
  });
}

export type StreamHandlers = {
  onDelta: (delta: string) => void;
  onDone?: (info: { model: string; demo: boolean }) => void;
  signal?: AbortSignal;
};

/** SSE 流式对话：逐字回调 onDelta，出错时抛 ApiError。 */
export async function chatStream(messages: ChatMessage[], handlers: StreamHandlers): Promise<void> {
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  });
  const auth = authHeaders() as Record<string, string>;
  Object.entries(auth).forEach(([key, value]) => headers.set(key, value));

  const response = await fetch(`${API_BASE}/api/llm/chat/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages }),
    signal: handlers.signal,
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseError(response));
  }
  if (!response.body) {
    throw new ApiError(500, "当前浏览器不支持流式响应");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consume = (block: string) => {
    const line = block.split("\n").find((item) => item.startsWith("data:"));
    if (!line) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    let event: {
      delta?: string;
      done?: boolean;
      error?: string;
      model?: string;
      demo?: boolean;
    };
    try {
      event = JSON.parse(payload);
    } catch {
      return;
    }
    if (event.error) {
      throw new ApiError(502, event.error);
    }
    if (event.delta) handlers.onDelta(event.delta);
    if (event.done) {
      handlers.onDone?.({ model: event.model ?? "", demo: Boolean(event.demo) });
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    blocks.forEach(consume);
  }
}

export function extractResume(messages: ChatMessage[]): Promise<ExtractResult> {
  return request<ExtractResult>("/api/resume/extract", {
    method: "POST",
    body: { messages } as unknown as BodyInit,
  });
}

export type SavedResume = {
  ok: boolean;
  data: ResumeData | null;
  updated_at: string | null;
};

export function getSavedResume(): Promise<SavedResume> {
  return request<SavedResume>("/api/resume");
}

export function saveResume(resume: ResumeData): Promise<{ ok: boolean; updated_at: string; missing: string[] }> {
  return request<{ ok: boolean; updated_at: string; missing: string[] }>("/api/resume", {
    method: "PUT",
    body: { resume } as unknown as BodyInit,
  });
}

export type SavedHistory = {
  ok: boolean;
  data: ChatMessage[] | null;
  updated_at: string | null;
};

export function getHistory(): Promise<SavedHistory> {
  return request<SavedHistory>("/api/llm/history");
}

export function saveHistory(messages: ChatMessage[]): Promise<{ ok: boolean; updated_at: string }> {
  return request<{ ok: boolean; updated_at: string }>("/api/llm/history", {
    method: "PUT",
    body: { messages } as unknown as BodyInit,
  });
}

export type MatchJobPayload = {
  job_id?: number;
  title: string;
  company: string;
  city: string;
  salary: string;
  experience: string;
  education: string;
  tags: string[];
};

export function scoreJobs(resume: ResumeData, jobs: MatchJobPayload[]): Promise<MatchResponse> {
  return request<MatchResponse>("/api/match/score", {
    method: "POST",
    body: { resume, jobs } as unknown as BodyInit,
  });
}

export type ApplicationList = {
  ok: boolean;
  data: Application[];
  counts: ApplicationCounts;
};

export type NewApplication = {
  job_id: number;
  job_kind: string;
  title: string;
  company: string;
  city: string;
  salary: string;
  note?: string;
};

export function listApplications(): Promise<ApplicationList> {
  return request<ApplicationList>("/api/applications");
}

export function addApplication(
  payload: NewApplication,
): Promise<{ ok: boolean; data: Application; counts: ApplicationCounts }> {
  return request<{ ok: boolean; data: Application; counts: ApplicationCounts }>(
    "/api/applications",
    { method: "POST", body: payload as unknown as BodyInit },
  );
}

export function updateApplication(
  id: number,
  patch: { status?: ApplicationStatus; note?: string },
): Promise<{ ok: boolean; data: Application; counts: ApplicationCounts }> {
  return request<{ ok: boolean; data: Application; counts: ApplicationCounts }>(
    `/api/applications/${id}`,
    { method: "PATCH", body: patch as unknown as BodyInit },
  );
}

export async function downloadDocx(resume: ResumeData, filename: string): Promise<Blob> {
  const headers = new Headers({ "Content-Type": "application/json", ...authHeaders() });
  const response = await fetch(`${API_BASE}/api/resume/export/docx`, {
    method: "POST",
    headers,
    body: JSON.stringify({ resume, filename }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseError(response));
  }
  return response.blob();
}
