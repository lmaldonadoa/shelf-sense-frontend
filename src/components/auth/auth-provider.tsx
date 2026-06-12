"use client";

import { createContext, useContext } from "react";
import type { AuthSession } from "@/lib/auth/session";

export type AuthContextValue = {
  enabled: boolean;
  session: AuthSession | null;
};

const DEFAULT_AUTH_CONTEXT: AuthContextValue = {
  enabled: false,
  session: null,
};

const AuthContext = createContext<AuthContextValue>(DEFAULT_AUTH_CONTEXT);

export function AuthProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: AuthContextValue;
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext) ?? DEFAULT_AUTH_CONTEXT;
}
