import { getServerSession } from "next-auth";
import { driverAuthOptions } from "./auth-driver";
import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";
import { DRIVER_COOKIE_NAME } from "./auth-driver";
import prisma from "./db";

export type DriverSession = {
  driverId: string;
  name: string;
  email: string;
  driverSessionToken?: string;
};

/**
 * Read the current /driver session. Its OWN getServerSession against the driver
 * cookie — deliberately NOT bolted onto getSessionUser (which is User-centric).
 * Returns null when no driver is signed in.
 */
export async function getDriverSession(): Promise<DriverSession | null> {
  const session = await getServerSession(driverAuthOptions);
  const u = session?.user as
    | { id?: string; driverId?: string; name?: string; email?: string; driverSessionToken?: string }
    | undefined;
  const driverId = u?.driverId ?? u?.id;
  if (!driverId) return null;
  return {
    driverId,
    name: u?.name ?? "",
    email: u?.email ?? "",
    driverSessionToken: u?.driverSessionToken,
  };
}

/**
 * Single-active-session freshness check (mirrors checkKitchenSessionFresh):
 * compare the JWT's driverSessionToken against Driver.driverSessionToken. A
 * mismatch means another device signed in and superseded this one → "stale",
 * and the caller (heartbeat / API) returns 401 so the client redirects to login.
 * Returns "fresh" | "stale" | "no_session".
 */
export async function checkDriverSessionFresh(): Promise<"fresh" | "stale" | "no_session"> {
  const token = await getToken({
    req: { cookies: await cookies() } as any,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: DRIVER_COOKIE_NAME,
  });
  const driverId = (token as any)?.driverId ?? token?.sub;
  const jwtToken = (token as any)?.driverSessionToken as string | undefined;
  if (!driverId || !jwtToken) return "no_session";
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { driverSessionToken: true },
  });
  if (!driver) return "no_session";
  return driver.driverSessionToken === jwtToken ? "fresh" : "stale";
}
