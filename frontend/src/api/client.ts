import { useSessionStore } from "../store/session";
import type {
  ApiEnvelope,
  ChatMessage,
  ChatResponse,
  DemoJob,
  Health,
  JobSearchForm,
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
  const accessCode = useSessionStore.getState().accessCode;
  if (accessCode) headers["x-access-code"] = accessCode;
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
