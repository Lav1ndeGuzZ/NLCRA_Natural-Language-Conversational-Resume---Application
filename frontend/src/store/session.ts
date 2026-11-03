import { create } from "zustand";

const TOKEN_KEY = "nlcra.liepin_token";
const ACCESS_KEY = "nlcra.access_code";

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

type SessionState = {
  token: string;
  accessCode: string;
  setToken: (token: string) => void;
  setAccessCode: (code: string) => void;
  clear: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  token: readSession(TOKEN_KEY),
  accessCode: readSession(ACCESS_KEY),
  setToken: (token) => {
    writeSession(TOKEN_KEY, token);
    set({ token });
  },
  setAccessCode: (code) => {
    writeSession(ACCESS_KEY, code);
    set({ accessCode: code });
  },
  clear: () => {
    writeSession(TOKEN_KEY, "");
    set({ token: "" });
  },
}));
