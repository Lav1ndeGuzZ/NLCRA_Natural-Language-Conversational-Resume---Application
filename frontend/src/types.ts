export type Health = {
  status: string;
  version: string;
  environment: string;
  demo_mode: boolean;
  deepseek_configured: boolean;
  access_code_required: boolean;
  liepin_base_url: string;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  content: string;
  model: string;
  demo: boolean;
};

export type DemoJob = {
  job_id: number;
  job_kind: "1" | "2";
  title: string;
  company: string;
  city: string;
  salary: string;
  experience: string;
  education: string;
  tags: string[];
  match_score: number;
  source: string;
};

export type JobSearchForm = {
  job_name?: string;
  address?: string;
  salary_floor?: string;
  salary_cap?: string;
  page?: number;
};

export type ApiEnvelope<T> = {
  ok: boolean;
  data: T;
  demo?: boolean;
  total?: number;
};

export type ResumeData = Record<string, unknown>;
