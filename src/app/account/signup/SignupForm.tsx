"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", name: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/customer/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Sign-up failed");
        setSubmitting(false);
        return;
      }
      // Server already set the session cookie. Bounce to /account.
      router.push("/account");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign-up failed");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <Field
        label="Email"
        type="email"
        required
        value={form.email}
        onChange={(v) => setForm({ ...form, email: v })}
      />
      <Field
        label="Password"
        type="password"
        required
        minLength={8}
        value={form.password}
        onChange={(v) => setForm({ ...form, password: v })}
        helper="At least 8 characters."
      />
      <Field
        label="Your name"
        type="text"
        value={form.name}
        onChange={(v) => setForm({ ...form, name: v })}
        helper="Optional — shown to restaurants on your orders."
      />
      <Field
        label="Phone"
        type="tel"
        value={form.phone}
        onChange={(v) => setForm({ ...form, phone: v.replace(/[^\d+()\-.\s]/g, "") })}
        helper="Optional — restaurants use this if there's an issue with your order."
      />

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl text-sm transition flex items-center justify-center gap-2"
      >
        {submitting ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</>
        ) : (
          "Create account"
        )}
      </button>
    </form>
  );
}

function Field(props: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
        {props.label}
        {props.required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        minLength={props.minLength}
        className="mt-1 w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
      />
      {props.helper && <span className="block mt-1 text-xs text-gray-500">{props.helper}</span>}
    </label>
  );
}
