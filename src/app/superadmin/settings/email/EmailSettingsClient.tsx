"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  Mail, Eye, EyeOff, ExternalLink, AlertTriangle, CheckCircle2, Loader2, Trash2, Send,
} from "lucide-react";

interface Initial {
  hasResendKey: boolean;
  savedKeyPreview: string | null;
  decryptOk: boolean;
  emailFrom: string;
  updatedAt: string | Date | null;
  envFallbackPresent: boolean;
  encryptionKeyConfigured: boolean;
}

export function EmailSettingsClient({ initial }: { initial: Initial }) {
  const [hasKey, setHasKey] = useState(initial.hasResendKey);
  const [savedKeyPreview, setSavedKeyPreview] = useState(initial.savedKeyPreview);
  const [decryptOk, setDecryptOk] = useState(initial.decryptOk);
  const [apiKey, setApiKey] = useState("");
  const [emailFrom, setEmailFrom] = useState(initial.emailFrom);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);

  const save = async () => {
    if (!initial.encryptionKeyConfigured && apiKey) {
      toast.error("ENCRYPTION_KEY is not set on the server. It's required to encrypt the API key at rest. Set it in your environment first.");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { emailFrom };
      if (apiKey) body.resendApiKey = apiKey;
      const res = await fetch("/api/superadmin/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      toast.success("Email settings saved");
      if (apiKey) setHasKey(true);
      setApiKey("");
      // Refresh the masked preview so the user can see what's now stored
      try {
        const r = await fetch("/api/superadmin/email-settings");
        if (r.ok) {
          const fresh = await r.json();
          setSavedKeyPreview(fresh.savedKeyPreview ?? null);
          setDecryptOk(!!fresh.decryptOk);
          setHasKey(!!fresh.hasResendKey);
        }
      } catch {}
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
    setSaving(false);
  };

  const clearKey = async () => {
    if (!confirm("Remove the saved Resend API key? Emails will stop sending until you save a new one.")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearKey: true }),
      });
      if (!res.ok) throw new Error("Failed");
      setHasKey(false);
      setSavedKeyPreview(null);
      setDecryptOk(true);
      toast.success("API key removed");
    } catch {
      toast.error("Failed to remove key");
    }
    setSaving(false);
  };

  const sendTest = async () => {
    if (!testEmail) return;
    setTesting(true);
    try {
      const res = await fetch("/api/superadmin/email-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      toast.success(`Test email sent to ${testEmail}`);
    } catch (e: any) {
      toast.error(e.message || "Send failed");
    }
    setTesting(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Mail className="w-6 h-6 text-orange-500" /> Email Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Platform-wide email transport. One API key is shared across every restaurant on the platform —
          customers and restaurant owners all receive mail through this account.
        </p>
      </div>

      {/* Status badge */}
      <div className={`rounded-2xl p-4 border ${hasKey ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-start gap-3">
          {hasKey ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          )}
          <div>
            <p className={`text-sm font-bold ${hasKey ? "text-emerald-800" : "text-amber-800"}`}>
              {hasKey ? "Email transport active" : "Email transport not configured"}
            </p>
            <p className={`text-xs mt-0.5 ${hasKey ? "text-emerald-700" : "text-amber-700"}`}>
              {hasKey
                ? "Resend is connected. All system emails are being sent."
                : initial.envFallbackPresent
                  ? "No saved API key, but a RESEND_API_KEY env var is set — it's being used as a fallback. Save a key here to switch to in-app management."
                  : "Without an API key, every system email is logged to the server console only (no real delivery)."}
            </p>
            {initial.updatedAt && (
              <p className="text-[11px] text-gray-500 mt-1">
                Last updated: {new Date(initial.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Encryption key warning */}
      {!initial.encryptionKeyConfigured && (
        <div className="rounded-2xl p-4 border border-red-200 bg-red-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-800">ENCRYPTION_KEY env var is not set</p>
              <p className="text-xs mt-0.5 text-red-700">
                Without it, we can't safely store your API key at rest. Generate one with:
              </p>
              <code className="block mt-1 text-[11px] bg-red-100 rounded px-2 py-1 font-mono text-red-900">
                node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
              </code>
              <p className="text-xs mt-1 text-red-700">
                Put the output into <code className="font-mono bg-red-100 px-1 rounded">ENCRYPTION_KEY=</code> in your <code className="font-mono bg-red-100 px-1 rounded">.env</code> file and restart the server.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="font-bold text-gray-900">How to set up Resend</h2>
        <p className="text-sm text-gray-500">
          Resend is the email-sending service we use. They have a generous free tier (3,000 emails/month)
          and don't require a credit card to start.
        </p>
        <ol className="space-y-2.5 text-sm text-gray-700 list-decimal pl-5">
          <li>
            Sign up at{" "}
            <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
              resend.com <ExternalLink className="w-3 h-3" />
            </a>
            . Use your platform email so billing notices land in the right inbox.
          </li>
          <li>
            (Recommended) Add and verify a sending domain so emails come from{" "}
            <code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">noreply@yourdomain.com</code>
            {" "}instead of the shared default. Resend walks you through the DNS records.
          </li>
          <li>
            Open <strong>API Keys</strong> in the Resend dashboard → <strong>Create API Key</strong>.
            Name it &quot;Fee Free Ordering production&quot;, permission <strong>Sending access</strong>.
          </li>
          <li>
            Copy the key (starts with <code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">re_</code>) and paste it below.
            The key is shown <strong>only once</strong> in the Resend dashboard.
          </li>
          <li>
            Set the <strong>From</strong> address to a verified sender. Default is{" "}
            <code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">onboarding@resend.dev</code>
            {" "}which works for testing without a verified domain (but goes to spam more often).
          </li>
          <li>Save, then send a test email below to confirm it works.</li>
        </ol>
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Resend API Key {hasKey && <span className="text-xs font-normal text-emerald-600">· saved</span>}
          </label>
          {/* Decoy input to defeat aggressive browser autofill that ignores autoComplete="off" */}
          <input type="password" name="prevent_autofill" autoComplete="new-password" tabIndex={-1} aria-hidden="true" style={{ display: "none" }} />
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={hasKey ? "Saved — paste a new key to replace" : "re_..."}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              name="resend_api_key_input"
              data-1p-ignore="true"
              data-lpignore="true"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm font-mono focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowKey(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-700"
              title={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {hasKey && (
            <p className="text-xs mt-1">
              {decryptOk ? (
                <span className="text-emerald-600">
                  ✓ Saved key: <span className="font-mono">{savedKeyPreview}</span>
                </span>
              ) : (
                <span className="text-red-600">
                  ⚠ Saved key cannot be decrypted — ENCRYPTION_KEY likely changed since the key was saved. Paste your Resend key again below and save.
                </span>
              )}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Stored encrypted with AES-256-GCM. Never logged or shown in full after save.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">From address</label>
          <input
            type="text"
            value={emailFrom}
            onChange={e => setEmailFrom(e.target.value)}
            placeholder="Fee Free Ordering <hello@yourdomain.com>"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            Must be a verified domain on your Resend account (or the default{" "}
            <code className="font-mono">onboarding@resend.dev</code>).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 rounded-xl transition disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save settings
          </button>
          {hasKey && (
            <button
              onClick={clearKey}
              disabled={saving}
              className="text-sm font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Remove saved key
            </button>
          )}
        </div>
      </div>

      {/* Test send */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="font-bold text-gray-900">Send a test email</h2>
        <p className="text-xs text-gray-500">
          Sends a small test message using the currently saved key + From address. Check your inbox (and spam).
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="your@email.com"
            className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
          />
          <button
            onClick={sendTest}
            disabled={testing || !testEmail || !hasKey}
            className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50 inline-flex items-center gap-2"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send test
          </button>
        </div>

        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
          <strong>Resend free tier note:</strong> Until you verify a sending domain, Resend's sandbox mode
          will only deliver mail to the email address that owns your Resend account. Sending to any
          other address now returns a clear error in this UI (it used to silently succeed). To send to
          real customers, verify a domain in{" "}
          <a href="https://resend.com/domains" target="_blank" rel="noopener" className="underline">
            resend.com/domains
          </a>{" "}
          and set the From address above to that domain (e.g. <code className="font-mono">noreply@yourdomain.com</code>).
        </div>
      </div>
    </div>
  );
}
