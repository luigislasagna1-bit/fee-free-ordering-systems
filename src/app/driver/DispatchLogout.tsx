"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Log-out control for the restaurant-owner DISPATCH view of /driver.
 *
 * The owner reaches RestaurantDispatch on the ADMIN session (default
 * "/api/auth" NextAuth basePath), but this whole /driver tree is wrapped in a
 * driver-scoped SessionProvider (basePath "/api/auth/driver"). So a plain
 * next-auth/react `signOut()` here would target the DRIVER session — the wrong
 * one — and leave the owner still signed in. Hit the admin NextAuth signout
 * endpoint directly instead (CSRF token + POST), then hard-redirect to the
 * driver login. Falls through to the redirect even if the POST hiccups.
 */
export function DispatchLogout() {
  const t = useTranslations("driver");
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      const { csrfToken } = await fetch("/api/auth/csrf", { cache: "no-store" }).then((r) => r.json());
      await fetch("/api/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken, callbackUrl: "/driver/login", json: "true" }),
      });
    } catch {
      /* clear-cookie best effort — the hard redirect below still takes them to login */
    }
    window.location.href = "/driver/login";
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      title={t("signOut")}
      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-300 hover:text-white border border-gray-700 rounded-lg px-2.5 py-1.5 flex-shrink-0 disabled:opacity-50"
    >
      <LogOut className="w-3.5 h-3.5" /> {t("signOut")}
    </button>
  );
}
