"use client";

import { createContext, useContext } from "react";
import type { SessionUser } from "@/lib/auth/require-session";

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** Only usable inside the (dashboard) layout's subtree, where SessionProvider is always mounted. */
export function useSession(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSession() called outside <SessionProvider> — is this component rendered inside the (dashboard) route group?");
  return user;
}
