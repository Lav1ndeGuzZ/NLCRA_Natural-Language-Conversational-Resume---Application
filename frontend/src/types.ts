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
  pages?: number;
};

export type ApiEnvelope<T> = {
  ok: boolean;
  data: T;
  demo?: boolean;
  total?: number;
  pages?: number;
};

export type ResumeData = Record<string, unknown>;

export type ExtractResult = {
  resume: ResumeData;
  missing: string[];
  model: string;
  demo: boolean;
};

export type JobMatch = {
  index: number;
  score: number;
  matched: string[];
  missing: string[];
  suggestion: string;
};

export type MatchResponse = {
  results: JobMatch[];
  model: string;
  demo: boolean;
};

export type ApplicationStatus = "submitted" | "viewed" | "interview" | "offer" | "rejected";

export type Application = {
  id: number;
  job_id: number;
  job_kind: string;
  title: string;
  company: string;
  city: string;
  salary: string;
  status: ApplicationStatus;
  note: string;
  source?: string;
  contact_email?: string;
  jd_url?: string;
  status_source?: string;
  last_reply_at?: string;
  email_subject?: string;
  email_sent_at?: string;
  created_at: string;
};

export type ApplicationCounts = Record<string, number>;

export type ResumeTemplate = {
  id: string;
  name: string;
  description: string;
  accent: string;
};

export type ResumeAnalysis = {
  score: number;
  missing: string[];
  sections: Record<string, number>;
  strengths: string[];
  gaps: string[];
  suggestions: string[];
};

export type CompanySite = {
  company: string;
  domain: string;
  url: string;
  title: string;
  query: string;
  engine?: string;
};

export type OfficialJob = {
  id: number;
  company: string;
  title: string;
  city: string;
  salary: string;
  url: string;
  email: string;
  description: string;
  created_at: string;
};

export type EmailReply = {
  id: number;
  application_id: number | null;
  is_read?: number;
  uid: string;
  from_addr: string;
  subject: string;
  snippet: string;
  category: string;
  received_at: string;
  created_at: string;
};

export type Reminder = {
  kind?: "followup" | "reply";
  email_reply_id?: number;
  application_id: number | null;
  title: string;
  company: string;
  status: string;
  days_since: number;
  level: number;
  message: string;
};

export type EmailDraft = {
  subject: string;
  body: string;
  to: string;
};
