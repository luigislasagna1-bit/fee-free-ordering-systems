"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

export function ApplyClient() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("");
  const [applicationNotes, setApplicationNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partners/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, companyName, website, country, applicationNotes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not submit application");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Could not submit application");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="flex justify-center mb-4">
          <CheckCircle2 className="w-12 h-12 text-green-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Application received</h2>
        <p className="text-sm text-gray-600 mb-4">
          We'll review your application within 1–2 business days and email you the result. You can also{" "}
          <a href="/login" className="text-orange-600 font-semibold underline">log in</a> to check your status.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Apply to join</h2>
      <p className="text-xs text-gray-500 -mt-3">All fields except where noted are required.</p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Your name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
          />
        </Field>
      </div>
      <Field label="Password">
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
        />
        <p className="text-[11px] text-gray-400 mt-1">At least 8 characters.</p>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Company / agency (optional)">
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
          />
        </Field>
        <Field label="Country (optional)">
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
          />
        </Field>
      </div>
      <Field label="Website (optional)">
        <input
          type="url"
          placeholder="https://"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
        />
      </Field>
      <Field label="Tell us about yourself (optional)">
        <textarea
          value={applicationNotes}
          onChange={(e) => setApplicationNotes(e.target.value)}
          rows={4}
          placeholder="How do you plan to bring restaurants to Fee Free Ordering? What's your sales channel?"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
        />
      </Field>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm px-5 py-3 rounded-lg transition disabled:opacity-50"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Submit application
      </button>
      <p className="text-[11px] text-gray-400 text-center">
        Already a partner? <a href="/login" className="text-orange-600 font-semibold">Log in</a>
      </p>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
