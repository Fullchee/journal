import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import * as auth from "@/lib/auth/auth";
import type { AuthStatus } from "@/lib/auth/auth-status";
import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError } from "@/lib/api/errors";
import { resumeQueuedMutations } from "@/lib/data/query-client";

interface Auth {
  /** `loading` until the stored session is read. */
  status: AuthStatus | "loading";
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

// Access admits any email, and the API refuses all but the owner; a failed check (offline) keeps the session.
async function isOwner() {
  try {
    await apiFetch("/api/me");

    return true;
  } catch (error) {
    return !(error instanceof ApiError && error.status === 403);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [status, setStatus] = useState<Auth["status"]>("loading");

  useEffect(() => {
    const unsubscribe = auth.subscribeAuthStatus(setStatus);
    void auth.loadAuthStatus().then(setStatus);

    return unsubscribe;
  }, []);

  const signIn = useCallback(async () => {
    if ((await auth.signIn()) !== "signed-in") return;

    if (!(await isOwner())) {
      await auth.signOut();
      setStatus("not-owner");

      return;
    }

    // Captures made while signed out have been waiting for a token.
    void resumeQueuedMutations(client);
  }, [client]);

  const value = useMemo(() => ({ status, signIn, signOut: auth.signOut }), [status, signIn]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const value = use(AuthContext);

  if (!value) throw new Error("useAuth must be used inside DataProvider");

  return value;
}
