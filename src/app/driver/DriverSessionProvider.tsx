"use client";
import { SessionProvider } from "next-auth/react";

// All client-side NextAuth calls inside /driver (signIn, signOut, useSession)
// route through /api/auth/driver/* so they read/write the DRIVER session cookie,
// independent of the admin and kitchen sessions — one device can be signed into
// all three at once.
export function DriverSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider basePath="/api/auth/driver">{children}</SessionProvider>;
}
