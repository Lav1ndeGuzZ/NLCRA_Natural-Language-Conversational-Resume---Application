import { create } from "zustand";

const TOKEN_KEY = "nlcra.liepin_token";
const ACCESS_KEY = "nlcra.access_code";
const SESSION_KEY = "nlcra.session_id";
const QQ_EMAIL_KEY = "nlcra.qq_email";
const QQ_AUTH_KEY = "nlcra.qq_auth_code";

function readSession(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeSession(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // sessionStorage can be unavailable in private mode; memory state still works.
  }
}

function readLocal(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function createSessionId(): string {
  const existing = readLocal(SESSION_KEY);
  if (existing) return existing;
  const id =
    globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {
    // ignore; falls back to in-memory id
  }
  return id;
}

type SessionState = {
  token: string;
  accessCode: string;
  qqEmail: string;
  qqAuthCode: string;
  sessionId: string;
  resumeDraft: Record<string, unknown> | null;
  resumeMissing: string[];
  resumeAnalysis: Record<string, unknown> | null;
  recentCompanies: string[];
  savedAt: string | null;
  setToken: (token: string) => void;
  setAccessCode: (code: string) => void;
  setQqCredentials: (email: string, authCode: string) => void;
  setResumeDraft: (draft: Record<string, unknown>, missing?: string[]) => void;
  setResumeAnalysis: (analysis: Record<string, unknown> | null) => void;
  setRecentCompanies: (companies: string[]) => void;
  setSavedAt: (value: string | null) => void;
  clear: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  token: readSession(TOKEN_KEY),
  accessCode: readSession(ACCESS_KEY),
  qqEmail: readSession(QQ_EMAIL_KEY),
  qqAuthCode: readSession(QQ_AUTH_KEY),
  sessionId: createSessionId(),
  resumeDraft: null,
  resumeMissing: [],
  resumeAnalysis: null,
  recentCompanies: [],
  savedAt: null,
  setToken: (token) => {
    writeSession(TOKEN_KEY, token);
    set({ token });
  },
  setAccessCode: (code) => {
    writeSession(ACCESS_KEY, code);
    set({ accessCode: code });
  },
  setQqCredentials: (email, authCode) => {
    writeSession(QQ_EMAIL_KEY, email);
    writeSession(QQ_AUTH_KEY, authCode);
    set({ qqEmail: email, qqAuthCode: authCode });
  },
  setResumeDraft: (draft, missing = []) => set({ resumeDraft: draft, resumeMissing: missing }),
  setResumeAnalysis: (analysis) => set({ resumeAnalysis: analysis }),
  setRecentCompanies: (companies) => set({ recentCompanies: companies }),
  setSavedAt: (value) => set({ savedAt: value }),
  clear: () => {
    writeSession(TOKEN_KEY, "");
    set({ token: "" });
  },
}));
