"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, UserCog, UserPlus, Mail, ShieldCheck, Eye, Ban, RotateCcw } from "lucide-react";

/**
 * Platform team management UI (superadmin-only page). English by convention —
 * the whole /superadmin area is the internal operator tool, untranslated.
 * All safety rails are SERVER-enforced (team API); this UI just mirrors them.
 */

type Member = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  invitePending: boolean;
};

const ROLE_META: Record<string, { label: string; hint: string }> = {
  superadmin: { label: "Superadmin", hint: "Full access — settings, billing, payouts, team" },
  platform_support: { label: "Support", hint: "View restaurants, resellers and reports. No secrets, money, or team changes" },
};

export function TeamClient({ initialMembers, selfId }: { initialMembers: Member[]; selfId: string }) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"platform_support" | "superadmin">("platform_support");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/superadmin/team");
      const data = await res.json();
      if (Array.isArray(data?.members)) setMembers(data.members);
    } catch { /* keep current list */ }
    router.refresh();
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch("/api/superadmin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined, role }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error || "Invite failed"); return; }
      toast.success(
        data.inviteEmailed
          ? `Invite sent to ${email.trim()}`
          : "Account created, but the email failed — use Resend invite.",
      );
      setEmail(""); setName("");
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "Invite failed");
    } finally {
      setInviting(false);
    }
  }

  async function patchMember(id: string, body: Record<string, unknown>, okMsg: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/superadmin/team/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error || "Change failed"); return; }
      toast.success(okMsg);
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "Change failed");
    } finally {
      setBusyId(null);
    }
  }

  async function resendInvite(id: string, to: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/superadmin/team/${id}/resend-invite`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error || "Resend failed"); return; }
      toast.success(`Invite re-sent to ${to}`);
    } catch (err: any) {
      toast.error(err?.message || "Resend failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UserCog className="w-6 h-6 text-emerald-600" /> Platform team
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Invite people who help run Fee Free Ordering. Invitees set their own password via an
          emailed link — passwords never pass through this screen. Every change here is recorded
          in the audit log.
        </p>
      </div>

      {/* Invite */}
      <form onSubmit={invite} className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-emerald-600" /> Invite a team member
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Name (optional)</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm"
            />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {(Object.keys(ROLE_META) as Array<keyof typeof ROLE_META>).map((r) => (
            <button
              key={r} type="button" onClick={() => setRole(r as any)}
              className={`text-left rounded-xl border-2 p-4 transition ${role === r ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
            >
              <div className="flex items-center gap-2 font-bold text-sm text-gray-900">
                {r === "superadmin" ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <Eye className="w-4 h-4 text-blue-500" />}
                {ROLE_META[r].label}
              </div>
              <p className="text-xs text-gray-600 mt-1 leading-snug">{ROLE_META[r].hint}</p>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="submit" disabled={inviting}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-sm shadow transition flex items-center gap-2"
          >
            {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>

      {/* Members */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="px-5 py-3">Member</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const self = m.id === selfId;
              const busy = busyId === m.id;
              return (
                <tr key={m.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-semibold text-gray-900">{m.name || m.email}</div>
                    {m.name && <div className="text-xs text-gray-500">{m.email}</div>}
                    {self && <span className="text-[10px] font-bold text-emerald-600 uppercase">You</span>}
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={m.role}
                      disabled={self || busy}
                      onChange={(e) => patchMember(m.id, { role: e.target.value }, "Role updated")}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      title={self ? "You can't change your own role" : ROLE_META[m.role]?.hint}
                    >
                      <option value="superadmin">Superadmin</option>
                      <option value="platform_support">Support</option>
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    {!m.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600"><Ban className="w-3.5 h-3.5" /> Deactivated</span>
                    ) : m.invitePending ? (
                      <span className="text-xs font-bold text-amber-600">Invite pending</span>
                    ) : (
                      <span className="text-xs font-bold text-emerald-600">Active</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                    {m.isActive && m.invitePending && (
                      <button
                        type="button" disabled={busy}
                        onClick={() => resendInvite(m.id, m.email)}
                        className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                      >
                        Resend invite
                      </button>
                    )}
                    {!self && (m.isActive ? (
                      <button
                        type="button" disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Deactivate ${m.email}? They will no longer be able to sign in.`)) {
                            patchMember(m.id, { isActive: false }, "Account deactivated");
                          }
                        }}
                        className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button" disabled={busy}
                        onClick={() => patchMember(m.id, { isActive: true }, "Account reactivated")}
                        className="text-xs font-semibold text-emerald-600 hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" /> Reactivate
                      </button>
                    ))}
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin inline text-gray-400" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        Rails enforced by the server: you can't change your own role or deactivate yourself, and the
        last active superadmin can never be demoted or deactivated. Support accounts can view
        restaurants, resellers and reports, but cannot open platform settings, move money, or
        manage this team.
      </p>
    </div>
  );
}
