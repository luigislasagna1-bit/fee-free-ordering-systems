"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Branded-app push preference toggle (Luigi 2026-08-02). Renders ONLY when
 * the signed-in customer has at least one registered app device — web-only
 * customers never see push controls they can't use. Order-status pushes
 * default ON (the OS permission prompt was the consent); marketing stays a
 * separate pref AND still requires marketingConsent at send time.
 */
export function PushPrefsToggle({ slug }: { slug: string }) {
  const t = useTranslations("customer.profile");
  const [state, setState] = useState<{ orderUpdates: boolean; devices: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch(`/api/restaurants/${slug}/account/push/prefs`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.prefs && d.devices > 0) setState({ orderUpdates: d.prefs.orderUpdates, devices: d.devices });
      })
      .catch(() => {});
  }, [slug]);

  if (!state) return null;

  const toggle = async () => {
    setSaving(true);
    const next = !state.orderUpdates;
    setState((s) => (s ? { ...s, orderUpdates: next } : s));
    try {
      const res = await fetch(`/api/restaurants/${slug}/account/push/prefs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderUpdates: next }),
      });
      // fetch only rejects on network errors — a 401 (expired session) or
      // 500 resolves normally, so without this check the checkbox stayed
      // flipped while the server-side pref never changed: a customer who
      // thought they'd opted out kept getting pushes.
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setState((s) => (s ? { ...s, orderUpdates: !next } : s)); // revert on failure
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer mt-2">
      <input type="checkbox" className="mt-0.5" checked={state.orderUpdates} onChange={toggle} disabled={saving} />
      <span className="flex items-center gap-1">
        <Bell className="w-3 h-3 text-gray-400" />
        {t("pushOrderUpdatesLabel")}
      </span>
    </label>
  );
}
