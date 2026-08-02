"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Smartphone, ArrowRight, ArrowLeft, Check, Upload, Loader2, ExternalLink,
  Apple, Play, CircleAlert, Clock, Store, ShieldCheck, Rocket,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { HelpTip } from "@/components/HelpTip";
import {
  validateDraft, approvalBlockers, APP_NAME_MAX, SHORT_DESC_MAX, FULL_DESC_MAX,
} from "@/lib/branded-app/validate";
import {
  statusLabelKey, ownerOfNextAction, type BrandedAppStatus,
} from "@/lib/branded-app/status";

/**
 * Branded Mobile App — owner wizard + status view (Luigi 2026-08-02).
 * One client serves three states: unentitled upsell → 5-stage wizard →
 * post-approval status timeline. Progress persists server-side on the
 * project row (PATCH per field-blur / stage move), so leaving and returning
 * loses nothing. GloriaFood-simple on purpose; every non-obvious control
 * carries a HelpTip (standing rule).
 */

type PlatformRow = {
  id: string; platform: "android" | "ios"; status: BrandedAppStatus;
  packageName: string | null; storeUrl: string | null;
  checklist: Record<string, { done: boolean }> | null;
  accessVerifiedAt: string | null; liveAt: string | null;
};
type EventRow = {
  id: string; platform: string | null; type: string; messageKey: string | null;
  params: Record<string, string | number> | null; detail: string | null; createdAt: string;
};
type Project = {
  id: string; appName: string | null; shortDescription: string | null;
  fullDescription: string | null; appIconUrl: string | null; splashIconUrl: string | null;
  useWebsiteBranding: boolean; primaryColorHex: string | null;
  supportEmail: string | null; privacyPolicyUrl: string | null;
  platformsRequested: string; approvedAt: string | null; approvedConfigVersion: number;
  platforms: PlatformRow[]; events?: EventRow[];
};
type RestaurantInfo = {
  name: string; email: string | null; customDomain: string | null;
  subdomain: string | null; logoUrl: string | null; slogan: string | null;
};

const STAGES = ["overview", "platforms", "identity", "accounts", "review"] as const;
type Stage = (typeof STAGES)[number];

export default function MobileAppClient() {
  const t = useTranslations("admin.brandedApp");
  const [loading, setLoading] = useState(true);
  const [entitled, setEntitled] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [stage, setStage] = useState<Stage>("overview");
  const [saving, setSaving] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingAfterSubmit, setEditingAfterSubmit] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/mobile-app/project");
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setEntitled(!!data.entitled);
    setProject(data.project ?? null);
    setRestaurant(data.restaurant ?? null);
    setEvents(data.project?.events ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const patch = useCallback(async (fields: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/mobile-app/project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.errors?.[0] ? t(`fieldError_${data.errors[0].code}`) : t("saveFailed"));
        return false;
      }
      const data = await res.json();
      setProject((p) => (p ? { ...p, ...data.project, platforms: data.project.platforms } : data.project));
      return true;
    } finally {
      setSaving(false);
    }
  }, [t]);

  const start = useCallback(async () => {
    setSaving(true);
    const res = await fetch("/api/admin/mobile-app/project", { method: "POST" });
    setSaving(false);
    if (res.ok) { await refresh(); setStage("overview"); }
  }, [refresh]);

  const uploadIcon = useCallback(async (file: File) => {
    setUploadingIcon(true);
    setError(null);
    try {
      const { upload } = await import("@vercel/blob/client");
      const blob = await upload(`branded-apps/${Date.now()}-icon.png`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/mobile-app/upload-url",
        contentType: "image/png",
      });
      await patch({ appIconUrl: blob.url });
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setUploadingIcon(false);
    }
  }, [patch, t]);

  const approve = useCallback(async () => {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/mobile-app/approve", { method: "POST" });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.blockers?.length ? t("approveBlocked") : t("saveFailed"));
      return;
    }
    setEditingAfterSubmit(false);
    await refresh();
  }, [refresh, t]);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  // ── Unentitled: upsell panel ──────────────────────────────────────────────
  if (!entitled) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 space-y-4">
        <p className="text-gray-700 leading-relaxed">{t("upsellBody")}</p>
        <ul className="space-y-2 text-sm text-gray-600">
          {["upsellPoint1", "upsellPoint2", "upsellPoint3", "upsellPoint4"].map((k) => (
            <li key={k} className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />{t(k)}
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500">{t("storeFeesNote")}</p>
        <Link href="/admin/billing/add-ons" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-800">
          {t("goToAddOns")} <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  // ── Entitled, no project yet: start hero ─────────────────────────────────
  if (!project) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center">
          <Smartphone className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">{t("startTitle")}</h2>
        <p className="text-sm text-gray-600 max-w-md mx-auto">{t("startBody")}</p>
        <button onClick={start} disabled={saving}
          className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
          {saving ? t("working") : t("startCta")}
        </button>
      </div>
    );
  }

  const anyBeyondDraft = project.platforms.some((p) => p.status !== "draft");

  // ── Post-approval: status view (with an escape hatch back into the wizard) ─
  if (anyBeyondDraft && !editingAfterSubmit) {
    return (
      <StatusView
        t={t}
        project={project}
        events={events}
        onEdit={() => { setEditingAfterSubmit(true); setStage("identity"); }}
      />
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────────────
  const stageIdx = STAGES.indexOf(stage);
  const draftErrors = validateDraft({
    appName: project.appName, shortDescription: project.shortDescription,
    fullDescription: project.fullDescription, supportEmail: project.supportEmail,
    privacyPolicyUrl: project.privacyPolicyUrl, primaryColorHex: project.primaryColorHex,
  });
  const blockers = approvalBlockers({
    appName: project.appName, shortDescription: project.shortDescription,
    fullDescription: project.fullDescription, supportEmail: project.supportEmail,
    privacyPolicyUrl: project.privacyPolicyUrl, appIconUrl: project.appIconUrl,
  });
  const err = (field: string) => draftErrors.find((e) => e.field === field);

  const wantAndroid = project.platformsRequested !== "ios";
  const wantIos = project.platformsRequested !== "android";

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STAGES.map((s, i) => (
          <button key={s} onClick={() => setStage(s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              s === stage ? "bg-emerald-500 text-white" : i < stageIdx ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
            <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
              {i < stageIdx ? <Check className="w-3 h-3" /> : i + 1}
            </span>
            {t(`stage_${s}`)}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">{error}</div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 space-y-5">
        {stage === "overview" && (
          <div className="space-y-4">
            <h2 className="font-bold text-gray-900">{t("overviewTitle")}</h2>
            <p className="text-sm text-gray-600">{t("overviewBody")}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <InfoCard icon={<Rocket className="w-4 h-4" />} title={t("weHandleTitle")} body={t("weHandleBody")} />
              <InfoCard icon={<Store className="w-4 h-4" />} title={t("youHandleTitle")} body={t("youHandleBody")} />
              <InfoCard icon={<Clock className="w-4 h-4" />} title={t("timelineTitle")} body={t("timelineBody")} />
              <InfoCard icon={<ShieldCheck className="w-4 h-4" />} title={t("feesTitle")} body={t("feesBody")} />
            </div>
            <p className="text-xs text-gray-500">{t("storeApprovalDisclaimer")}</p>
          </div>
        )}

        {stage === "platforms" && (
          <div className="space-y-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              {t("platformsTitle")}
              <HelpTip text={t("platformsHelp")} />
            </h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {(["both", "android", "ios"] as const).map((opt) => (
                <button key={opt}
                  onClick={() => void patch({ platformsRequested: opt })}
                  className={`p-4 rounded-xl border-2 text-left transition ${project.platformsRequested === opt ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {opt !== "ios" && <Play className="w-4 h-4 text-gray-700" />}
                    {opt !== "android" && <Apple className="w-4 h-4 text-gray-700" />}
                  </div>
                  <div className="text-sm font-semibold text-gray-800">{t(`platformOpt_${opt}`)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{t(`platformOpt_${opt}_hint`)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === "identity" && (
          <IdentityStage
            t={t} project={project} restaurant={restaurant} saving={saving}
            uploadingIcon={uploadingIcon} err={err} patch={patch} uploadIcon={uploadIcon}
          />
        )}

        {stage === "accounts" && (
          <div className="space-y-6">
            {wantAndroid && (
              <AccountChecklist
                t={t} platform="android" project={project} patch={patch}
                steps={["playAccount", "playVerify", "playInvite"]}
                title={t("googleChecklistTitle")} icon={<Play className="w-4 h-4" />}
                intro={t("googleChecklistIntro")}
                link="https://play.google.com/console/signup"
              />
            )}
            {wantIos && (
              <AccountChecklist
                t={t} platform="ios" project={project} patch={patch}
                steps={["appleDuns", "appleEnroll", "appleInvite", "appleAgreements", "appleAppRecord"]}
                title={t("appleChecklistTitle")} icon={<Apple className="w-4 h-4" />}
                intro={t("appleChecklistIntro")}
                link="https://developer.apple.com/programs/enroll/"
              />
            )}
            <p className="text-xs text-gray-500 flex items-start gap-1.5">
              <CircleAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {t("checklistVerifyNote")}
            </p>
          </div>
        )}

        {stage === "review" && (
          <div className="space-y-4">
            <h2 className="font-bold text-gray-900">{t("reviewTitle")}</h2>
            {blockers.length > 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
                <div className="text-sm font-semibold text-amber-800">{t("reviewIncomplete")}</div>
                {blockers.map((b, i) => (
                  <div key={i} className="text-xs text-amber-700">• {t(`field_${b.field}`)}</div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <SummaryRow label={t("field_appName")} value={project.appName} />
                <SummaryRow label={t("field_shortDescription")} value={project.shortDescription} />
                <SummaryRow label={t("field_supportEmail")} value={project.supportEmail} />
                <SummaryRow label={t("field_privacyPolicyUrl")} value={project.privacyPolicyUrl} />
                <SummaryRow label={t("platformsTitle")} value={t(`platformOpt_${project.platformsRequested}`)} />
                {project.appIconUrl && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-gray-500 w-40">{t("field_appIconUrl")}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={project.appIconUrl} alt="" className="w-14 h-14 rounded-xl border border-gray-200 object-cover" />
                  </div>
                )}
                <p className="text-xs text-gray-500">{t("approveExplainer")}</p>
                <button onClick={approve} disabled={saving}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                  {saving ? t("working") : project.approvedAt ? t("reApproveCta") : t("approveCta")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Prev / next */}
      <div className="flex justify-between">
        <button onClick={() => setStage(STAGES[Math.max(0, stageIdx - 1)])} disabled={stageIdx === 0}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40">
          <ArrowLeft className="w-4 h-4" /> {t("back")}
        </button>
        {stageIdx < STAGES.length - 1 && (
          <button onClick={() => setStage(STAGES[stageIdx + 1])}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-800">
            {t("next")} <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Stage 3: identity + branding ─────────────────────────────────────────────
function IdentityStage({ t, project, restaurant, saving, uploadingIcon, err, patch, uploadIcon }: {
  t: ReturnType<typeof useTranslations>;
  project: Project; restaurant: RestaurantInfo | null; saving: boolean; uploadingIcon: boolean;
  err: (f: string) => { code: string } | undefined;
  patch: (f: Record<string, unknown>) => Promise<boolean>;
  uploadIcon: (f: File) => Promise<void>;
}) {
  // Local state so typing is instant; server save on blur.
  const [f, setF] = useState({
    appName: project.appName ?? restaurant?.name?.slice(0, APP_NAME_MAX) ?? "",
    shortDescription: project.shortDescription ?? "",
    fullDescription: project.fullDescription ?? "",
    supportEmail: project.supportEmail ?? restaurant?.email ?? "",
    privacyPolicyUrl: project.privacyPolicyUrl ?? "",
    primaryColorHex: project.primaryColorHex ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const save = (k: keyof typeof f) => () => { void patch({ [k]: f[k] }); };

  // Store-copy suggestion from REAL restaurant data (never identical across
  // restaurants — store repetitive-content policy). Owner edits before approval.
  const suggest = () => {
    const name = restaurant?.name ?? "";
    const slogan = restaurant?.slogan ? ` ${restaurant.slogan}.` : "";
    const short = t("suggestShort", { name });
    const full = t("suggestFull", { name }) + slogan;
    setF((p) => ({ ...p, shortDescription: p.shortDescription || short.slice(0, SHORT_DESC_MAX), fullDescription: p.fullDescription || full }));
    void patch({ shortDescription: short.slice(0, SHORT_DESC_MAX), fullDescription: full });
  };

  const field = (k: keyof typeof f, label: string, opts?: { max?: number; textarea?: boolean; help?: string; placeholder?: string }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {opts?.help && <HelpTip text={opts.help} />}
        {opts?.max && <span className="ml-2 text-[11px] text-gray-400">{f[k].length}/{opts.max}</span>}
      </label>
      {opts?.textarea ? (
        <textarea rows={4} className={`w-full border rounded-lg px-3 py-2 text-sm ${err(k) ? "border-red-300" : "border-gray-300"}`}
          value={f[k]} onChange={set(k)} onBlur={save(k)} placeholder={opts?.placeholder} />
      ) : (
        <input className={`w-full border rounded-lg px-3 py-2 text-sm ${err(k) ? "border-red-300" : "border-gray-300"}`}
          value={f[k]} onChange={set(k)} onBlur={save(k)} placeholder={opts?.placeholder} />
      )}
      {err(k) && <div className="text-xs text-red-600 mt-0.5">{t(`fieldError_${err(k)!.code}`)}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-gray-900">{t("identityTitle")}</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {field("appName", t("field_appName"), { max: APP_NAME_MAX, help: t("appNameHelp") })}
        {field("supportEmail", t("field_supportEmail"), { help: t("supportEmailHelp") })}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{t("storeCopyTitle")}</span>
        <button onClick={suggest} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800">{t("suggestCta")}</button>
      </div>
      {field("shortDescription", t("field_shortDescription"), { max: SHORT_DESC_MAX, help: t("shortDescHelp") })}
      {field("fullDescription", t("field_fullDescription"), { max: FULL_DESC_MAX, textarea: true })}
      {field("privacyPolicyUrl", t("field_privacyPolicyUrl"), { help: t("privacyHelp"), placeholder: "https://…" })}

      {/* Icon upload + live previews */}
      <div className="grid sm:grid-cols-2 gap-4 items-start">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("field_appIconUrl")} <HelpTip text={t("iconHelp")} />
          </label>
          <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition ${project.appIconUrl ? "border-emerald-200 bg-emerald-50/40" : "border-gray-300 hover:border-gray-400"}`}>
            {uploadingIcon ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : <Upload className="w-5 h-5 text-gray-400" />}
            <span className="text-xs text-gray-500">{project.appIconUrl ? t("iconReplace") : t("iconUploadCta")}</span>
            <input type="file" accept="image/png" className="hidden"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadIcon(file); e.target.value = ""; }} />
          </label>
        </div>
        <PhonePreview t={t} name={f.appName} iconUrl={project.appIconUrl} color={f.primaryColorHex || "#10b981"} slogan={restaurant?.slogan} />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-emerald-500"
          checked={project.useWebsiteBranding}
          onChange={(e) => void patch({ useWebsiteBranding: e.target.checked })} />
        <span className="text-sm text-gray-700">{t("useWebsiteBranding")}</span>
        <HelpTip text={t("useWebsiteBrandingHelp")} />
      </label>
      {!project.useWebsiteBranding &&
        field("primaryColorHex", t("field_primaryColorHex"), { help: t("colorHelp"), placeholder: "#10b981" })}
      {saving && <div className="text-[11px] text-gray-400">{t("saving")}</div>}
    </div>
  );
}

/** Simple phone mock: home-screen icon + splash side by side. */
function PhonePreview({ t, name, iconUrl, color, slogan }: {
  t: ReturnType<typeof useTranslations>;
  name: string; iconUrl: string | null; color: string; slogan?: string | null;
}) {
  return (
    <div className="flex gap-3 justify-center">
      <div className="w-28 rounded-[1.4rem] border-4 border-gray-800 bg-gray-100 p-2 pt-4">
        <div className="text-[7px] text-gray-400 text-center mb-2">{t("previewHome")}</div>
        <div className="w-12 h-12 mx-auto rounded-xl border border-gray-200 bg-white overflow-hidden flex items-center justify-center">
          {iconUrl
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={iconUrl} alt="" className="w-full h-full object-cover" />
            : <Smartphone className="w-5 h-5 text-gray-300" />}
        </div>
        <div className="text-[8px] text-gray-700 text-center mt-1 truncate">{name || "…"}</div>
      </div>
      <div className="w-28 rounded-[1.4rem] border-4 border-gray-800 overflow-hidden flex flex-col items-center justify-center gap-2 p-3"
        style={{ backgroundColor: color }}>
        <div className="text-[7px] text-white/70">{t("previewSplash")}</div>
        <div className="w-10 h-10 rounded-lg bg-white/90 overflow-hidden flex items-center justify-center">
          {iconUrl
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={iconUrl} alt="" className="w-full h-full object-cover" />
            : <Smartphone className="w-4 h-4 text-gray-400" />}
        </div>
        {slogan && <div className="text-[7px] text-white text-center leading-tight">{slogan}</div>}
      </div>
    </div>
  );
}

// ── Stage 4: developer-account checklist ─────────────────────────────────────
function AccountChecklist({ t, platform, project, patch, steps, title, icon, intro, link }: {
  t: ReturnType<typeof useTranslations>;
  platform: "android" | "ios"; project: Project;
  patch: (f: Record<string, unknown>) => Promise<boolean>;
  steps: string[]; title: string; icon: React.ReactNode; intro: string; link: string;
}) {
  const row = project.platforms.find((p) => p.platform === platform);
  const checklist = (row?.checklist ?? {}) as Record<string, { done?: boolean }>;
  const toggle = (step: string) => {
    const next: Record<string, { done: boolean }> = {};
    for (const s of steps) next[s] = { done: s === step ? !checklist[s]?.done : !!checklist[s]?.done };
    void patch({ checklist: { [platform]: next } });
  };
  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        <a href={link} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800">
          {t("officialGuide")} <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <p className="text-xs text-gray-500">{intro}</p>
      <div className="space-y-2">
        {steps.map((s) => (
          <label key={s} className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 mt-0.5 accent-emerald-500"
              checked={!!checklist[s]?.done} onChange={() => toggle(s)} />
            <span className="text-sm text-gray-700">
              {t(`step_${s}`)} <HelpTip text={t(`step_${s}_help`)} />
            </span>
          </label>
        ))}
      </div>
      {row?.accessVerifiedAt && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <ShieldCheck className="w-3.5 h-3.5" /> {t("accessVerified")}
        </div>
      )}
    </div>
  );
}

// ── Status view (post-approval) ──────────────────────────────────────────────
function StatusView({ t, project, events, onEdit }: {
  t: ReturnType<typeof useTranslations>;
  project: Project; events: EventRow[]; onEdit: () => void;
}) {
  const wantAndroid = project.platformsRequested !== "ios";
  const wantIos = project.platformsRequested !== "android";
  const rows = project.platforms.filter((p) =>
    (p.platform === "android" && wantAndroid) || (p.platform === "ios" && wantIos));

  const ownerLabel: Record<string, string> = {
    restaurant: t("ownerYou"), platform: t("ownerUs"), store: t("ownerStore"), none: t("ownerNone"),
  };

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const owner = ownerOfNextAction(row.status);
        return (
          <div key={row.id} className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2">
              {row.platform === "ios" ? <Apple className="w-5 h-5 text-gray-700" /> : <Play className="w-5 h-5 text-gray-700" />}
              <h3 className="font-bold text-gray-900">{row.platform === "ios" ? t("platformIos") : t("platformAndroid")}</h3>
              <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full ${
                row.status === "live" ? "bg-emerald-100 text-emerald-700"
                : row.status === "needs_owner" ? "bg-amber-100 text-amber-700"
                : "bg-gray-100 text-gray-600"}`}>
                {t(`status.${statusLabelKey(row.status)}`)}
              </span>
            </div>
            <div className="text-sm text-gray-600">{t(`statusBody.${statusLabelKey(row.status)}`)}</div>
            <div className="text-xs text-gray-500">
              <span className="font-semibold">{t("nextActionBy")}:</span> {ownerLabel[owner]}
            </div>
            {row.status === "live" && row.storeUrl && (
              <a href={row.storeUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-800">
                {t("viewInStore")} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        );
      })}

      {/* Timeline */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-3">{t("timelineHeading")}</h3>
        {events.length === 0 ? (
          <p className="text-xs text-gray-400">{t("timelineEmpty")}</p>
        ) : (
          <div className="space-y-2.5">
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-2.5 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-gray-700">
                    {e.messageKey ? t(`events.${e.messageKey}`, (e.params ?? {}) as Record<string, string | number>) : e.type}
                    {e.platform && <span className="ml-1.5 text-[10px] uppercase font-bold text-gray-400">{e.platform}</span>}
                  </div>
                  {e.detail && <div className="text-xs text-gray-500 italic mt-0.5">{t("storeSaid")}: “{e.detail}”</div>}
                  <div className="text-[11px] text-gray-400">{new Date(e.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={onEdit} className="text-sm text-gray-600 hover:text-gray-900 underline">
        {t("editSetup")}
      </button>
    </div>
  );
}

function InfoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-1">{icon}{title}</div>
      <p className="text-xs text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-semibold text-gray-500 w-40 flex-shrink-0 mt-0.5">{label}</span>
      <span className="text-sm text-gray-800 min-w-0 break-words">{value ?? "—"}</span>
    </div>
  );
}
