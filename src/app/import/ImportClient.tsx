"use client";
import { useState, type FormEvent } from "react";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { useTranslations } from "next-intl";
import { UploadCloud, Loader2, Check } from "lucide-react";

export function ImportClient({ locale }: { locale: string }) {
  const t = useTranslations("marketing.importPage");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/import/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: source.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirect?: string; slug?: string; error?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : t("errorGeneric"));
        setBusy(false);
        return;
      }
      // Off to their LIVE storefront — the claim token rides in the redirect URL.
      window.location.href = data.redirect || (data.slug ? `/order/${data.slug}` : "/");
    } catch {
      setError(t("errorGeneric"));
      setBusy(false);
    }
  }

  const bullets = [t("b1"), t("b2"), t("b3")];

  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav currentLocale={locale} />
      <main className="flex-1 bg-gradient-to-br from-emerald-50 to-white">
        <section className="max-w-2xl mx-auto px-4 py-16 sm:py-20">
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 rounded-full px-3 py-1 mb-4">
              {t("eyebrow")}
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight mb-3">{t("title")}</h1>
            <p className="text-lg text-gray-600">{t("subtitle")}</p>
          </div>

          <form onSubmit={submit} className="bg-white rounded-2xl shadow-[0_24px_60px_-20px_rgba(16,24,40,0.18)] ring-1 ring-gray-100 p-6 sm:p-8">
            <label htmlFor="ffi-email" className="block text-sm font-semibold text-gray-800 mb-1.5">{t("emailLabel")}</label>
            <input
              id="ffi-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 mb-5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />

            <label htmlFor="ffi-source" className="block text-sm font-semibold text-gray-800 mb-1.5">{t("linkLabel")}</label>
            <textarea
              id="ffi-source"
              required
              rows={3}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t("linkPlaceholder")}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <p className="text-xs text-gray-500 mt-1.5 mb-5">{t("linkHint")}</p>

            {error && (
              <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold px-6 py-3.5 rounded-xl transition shadow-lg"
            >
              {busy ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> {t("building")}</>
              ) : (
                <><UploadCloud className="w-5 h-5" /> {t("submit")}</>
              )}
            </button>
          </form>

          <ul className="mt-8 grid sm:grid-cols-3 gap-4">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /> {b}
              </li>
            ))}
          </ul>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
