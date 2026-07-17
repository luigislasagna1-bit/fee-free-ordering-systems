/**
 * ffd-role-pref — the dual-role RENDERING-preference cookie (v1.1 plan §2.3).
 *
 * ONE home for the client-side read/write/clear helpers so the unified login
 * form, RoleSwitch and the relocated sign-out buttons can never drift on
 * cookie attributes. Attributes are exactly what Phase 0/1 shipped:
 * path=/, ~400 days, SameSite=Lax, Secure on https, non-httpOnly (the client
 * must read it to order the login cascade legs).
 *
 * It is a rendering preference ONLY — never an authz input. A CI grep gate
 * keeps it out of src/app/api (see AGENTS.md / plan §2.3).
 */
export type RolePref = "driver" | "restaurant";

export function readPrefCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)ffd-role-pref=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function setPrefCookie(role: RolePref) {
  document.cookie = `ffd-role-pref=${role}; path=/; max-age=34560000; SameSite=Lax${
    window.location.protocol === "https:" ? "; Secure" : ""
  }`;
}

/** Sign-out must clear the pref (plan §2.4) — the clear travels with the
 *  relocated sign-out buttons (driver → Profile tab, dispatch → Account tab). */
export function clearPrefCookie() {
  document.cookie = `ffd-role-pref=; path=/; max-age=0; SameSite=Lax${
    window.location.protocol === "https:" ? "; Secure" : ""
  }`;
}
