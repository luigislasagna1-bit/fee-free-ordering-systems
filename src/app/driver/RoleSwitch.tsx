"use client";
import { Bike, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { setPrefCookie, type RolePref } from "./shared/role-pref";

/**
 * RoleSwitch (v1.1 plan §2.4) — THE one dual-role switcher. A tiny header
 * icon that flips the ffd-role-pref rendering-preference cookie and hard-
 * navigates /driver (hard, not soft: the server render must see the fresh
 * cookie — soft-nav can race the cookie write on some mobile browsers).
 * If the other role's session is absent, deep-link the unified login with
 * the leg pinned (?as=<other>) instead of bouncing off the truth table.
 *
 * Mounts EXACTLY ONCE in each shell's header — dashboard workstreams
 * relocate it, never duplicate it.
 */
export function RoleSwitch({ role, hasOtherRole }: { role: RolePref; hasOtherRole: boolean }) {
  const tApp = useTranslations("feefreeApp");
  const other: RolePref = role === "driver" ? "restaurant" : "driver";
  const label = other === "restaurant" ? tApp("switchToDispatch") : tApp("switchToDriver");
  return (
    <button
      type="button"
      onClick={() => {
        if (hasOtherRole) {
          setPrefCookie(other);
          window.location.assign("/driver");
        } else {
          window.location.assign(`/driver/login?as=${other}`);
        }
      }}
      className="text-gray-400 hover:text-white"
      title={label}
      aria-label={label}
    >
      {other === "restaurant" ? <Store className="w-4 h-4" /> : <Bike className="w-4 h-4" />}
    </button>
  );
}
