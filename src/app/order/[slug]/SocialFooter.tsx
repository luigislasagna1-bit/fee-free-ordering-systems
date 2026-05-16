"use client";
import { useTranslations } from "next-intl";
import { SocialIcon, type SocialPlatform } from "../../../components/SocialIcons";

type LinkMap = Partial<Record<SocialPlatform, string>>;

const PLATFORMS: SocialPlatform[] = [
  "instagram", "facebook", "tiktok", "x", "youtube", "linkedin",
  "pinterest", "snapchat", "threads", "whatsapp",
  "yelp", "googleBusiness", "tripadvisor", "website",
];

function parseLinks(raw: string | null | undefined): LinkMap {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    const out: LinkMap = {};
    for (const k of PLATFORMS) {
      const v = obj?.[k];
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function SocialFooter({ socialLinks, primaryColor }: { socialLinks: string | null | undefined; primaryColor: string }) {
  const t = useTranslations("ordering");
  const links = parseLinks(socialLinks);
  const entries = PLATFORMS.filter((p) => links[p]);
  if (entries.length === 0) return null;

  return (
    <div className="mt-10 pt-8 border-t border-gray-100">
      <h3 className="text-center text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">
        {t("followUs")}
      </h3>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {entries.map((p) => (
          <a
            key={p}
            href={links[p]}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={p}
            title={p}
            className="w-11 h-11 rounded-full flex items-center justify-center bg-gray-50 border border-gray-200 hover:scale-110 transition shadow-sm"
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 2px ${primaryColor}33`; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
          >
            <SocialIcon platform={p} className="w-5 h-5" />
          </a>
        ))}
      </div>
    </div>
  );
}
