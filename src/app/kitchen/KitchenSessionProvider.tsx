"use client";
import { SessionProvider } from "next-auth/react";

// All client-side NextAuth calls inside /kitchen (signIn, signOut, useSession)
// go through /api/auth/kitchen/* so they read/write the kitchen session cookie,
// not the main admin cookie. This is what lets the same browser stay signed in
// to /kitchen as Account A and /admin as Account B at the same time.
export function KitchenSessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/api/auth/kitchen">
      {children}
    </SessionProvider>
  );
}
