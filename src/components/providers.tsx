"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider, type AuthContextValue } from "@/components/auth/auth-provider";
import { Toaster } from "@/components/ui/sonner";

export function Providers({
  children,
  auth,
}: {
  children: React.ReactNode;
  auth?: AuthContextValue;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <AuthProvider value={auth ?? { enabled: false, session: null }}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </AuthProvider>
  );
}
