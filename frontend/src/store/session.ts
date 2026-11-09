import { create } from "zustand";

const TOKEN_KEY = "nlcra.liepin_token";
const ACCESS_KEY = "nlcra.access_code";
const SESSION_KEY = "nlcra.session_id";

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
  sessionId: string;
  resumeDraft: Record<string, unknown> | null;
  resumeMissing: string[];
  savedAt: string | null;
  setToken: (token: string) => void;
  setAccessCode: (code: string) => void;
  setResumeDraft: (draft: Record<string, unknown>, missing?: string[]) => void;
  setSavedAt: (value: string | null) => void;
  clear: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  token: readSession(TOKEN_KEY),
  accessCode: readSession(ACCESS_KEY),
  sessionId: createSessionId(),
  resumeDraft: null,
  resumeMissing: [],
  savedAt: null,
  setToken: (token) => {
    writeSession(TOKEN_KEY, token);
    set({ token });
  },
  setAccessCode: (code) => {
    writeSession(ACCESS_KEY, code);
    set({ accessCode: code });
  },
  setResumeDraft: (draft, missing = []) => set({ resumeDraft: draft, resumeMissing: missing }),
  setSavedAt: (value) => set({ savedAt: value }),
  clear: () => {
    writeSession(TOKEN_KEY, "");
    set({ token: "" });
  },
}));
