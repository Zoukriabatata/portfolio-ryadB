// SessionContext.tsx
// =====================================================================
// Global session context for the desktop app. The session lives at the
// `<App />` level (initialized from the persisted Rust session file at
// boot) and propagates here so every route can:
//
//   - read the current `session` to decide whether to show locked
//     state or normal content;
//   - call `setSession(null)` on logout / `setSession(s)` on login
//     without forcing a window reload.
//
// Unauthenticated state is FULLY in-app: the router keeps rendering,
// the navbar stays, and the user sees a sign-in form inside the
// Account route instead of being kicked out to a fullscreen login.

import { createContext, useContext, type ReactNode } from "react";
import { Navigate } from "react-router-dom";

export type LicenseSnapshot = {
  license_key: string;
  status: string;
  max_machines: number;
  active_machines: number;
};

export type Session = {
  token: string;
  expires_at: string;
  license: LicenseSnapshot;
  email: string | null;
};

export type SessionContextValue = {
  session: Session | null;
  setSession: (s: Session | null) => void;
};

const SessionContext = createContext<SessionContextValue>({
  session: null,
  setSession: () => {},
});

export function SessionProvider({
  value,
  children,
}: {
  value: SessionContextValue;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

/** Read the current session (or `null` if logged out). */
export function useSession(): Session | null {
  return useContext(SessionContext).session;
}

/** Set the session (e.g. after login / logout). */
export function useSetSession(): (s: Session | null) => void {
  return useContext(SessionContext).setSession;
}

/** Convenience: returns true iff a non-null session is present. */
export function useIsAuthenticated(): boolean {
  return useContext(SessionContext).session !== null;
}

/**
 * Route-level guard. Wrap any route whose content requires an active
 * session — visitors without one are bounced to `/account`, which is
 * the only route that renders a sign-in form when unauthenticated.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  if (!session) return <Navigate to="/account" replace />;
  return <>{children}</>;
}
