"use client";

export type SocialPlatform =
  | "instagram" | "facebook" | "tiktok" | "x" | "youtube" | "linkedin"
  | "pinterest" | "snapchat" | "threads" | "whatsapp"
  | "yelp" | "googleBusiness" | "tripadvisor" | "website";

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  x: "X (Twitter)",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  threads: "Threads",
  whatsapp: "WhatsApp",
  yelp: "Yelp",
  googleBusiness: "Google Business",
  tripadvisor: "Tripadvisor",
  website: "Website",
};

export const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  instagram: "#E4405F",
  facebook: "#1877F2",
  tiktok: "#000000",
  x: "#000000",
  youtube: "#FF0000",
  linkedin: "#0A66C2",
  pinterest: "#BD081C",
  snapchat: "#FFFC00",
  threads: "#000000",
  whatsapp: "#25D366",
  yelp: "#D32323",
  googleBusiness: "#4285F4",
  tripadvisor: "#34E0A1",
  website: "#6B7280",
};

export const PLATFORM_PLACEHOLDERS: Record<SocialPlatform, string> = {
  instagram: "https://instagram.com/yourhandle",
  facebook: "https://facebook.com/yourpage",
  tiktok: "https://tiktok.com/@yourhandle",
  x: "https://x.com/yourhandle",
  youtube: "https://youtube.com/@yourchannel",
  linkedin: "https://linkedin.com/company/yours",
  pinterest: "https://pinterest.com/yourname",
  snapchat: "https://snapchat.com/add/yourhandle",
  threads: "https://threads.net/@yourhandle",
  whatsapp: "https://wa.me/15555555555",
  yelp: "https://yelp.com/biz/your-restaurant",
  googleBusiness: "https://g.page/your-restaurant",
  tripadvisor: "https://tripadvisor.com/...",
  website: "https://yourrestaurant.com",
};

interface SocialIconProps {
  platform: SocialPlatform;
  className?: string;
  /** When true, use the brand color as fill. When false, inherits currentColor. */
  branded?: boolean;
}

export function SocialIcon({ platform, className = "w-5 h-5", branded = true }: SocialIconProps) {
  const color = branded ? PLATFORM_COLORS[platform] : "currentColor";
  switch (platform) {
    case "instagram":
      return (
        <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden="true">
          <path d="M12 2.2c3.2 0 3.6 0 4.8.1 1.2 0 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.2.1 1.6.1 4.8s0 3.6-.1 4.8c0 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.2.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8c0-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.7.1-1.1 0-1.7.2-2.1.3-.5.2-.9.4-1.3.8-.4.4-.6.8-.8 1.3-.1.4-.3 1-.3 2.1-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c0 1.1.2 1.7.3 2.1.2.5.4.9.8 1.3.4.4.8.6 1.3.8.4.1 1 .3 2.1.3 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1 0 1.7-.2 2.1-.3.5-.2.9-.4 1.3-.8.4-.4.6-.8.8-1.3.1-.4.3-1 .3-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c0-1.1-.2-1.7-.3-2.1-.2-.5-.4-.9-.8-1.3-.4-.4-.8-.6-1.3-.8-.4-.1-1-.3-2.1-.3-1.2-.1-1.6-.1-4.7-.1zm0 3c2.7 0 5 2.3 5 5s-2.3 5-5 5-5-2.3-5-5 2.3-5 5-5zm0 8.2c1.8 0 3.2-1.4 3.2-3.2s-1.4-3.2-3.2-3.2S8.8 10.2 8.8 12s1.4 3.2 3.2 3.2zm6.4-8.4c0 .7-.5 1.2-1.2 1.2s-1.2-.5-1.2-1.2.5-1.2 1.2-1.2 1.2.5 1.2 1.2z"/>
        </svg>
      );
    case "facebook":
      return (
        <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden="true">
          <path d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7C18.3 21.1 22 17 22 12z"/>
        </svg>
      );
    case "tiktok":
      return (
        <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden="true">
          <path d="M19.6 6.3a4.8 4.8 0 0 1-3.8-1.8 4.7 4.7 0 0 1-1-2.6h-3.4v13.5a2.8 2.8 0 1 1-2-2.7v-3.5a6.4 6.4 0 0 0-1-.1 6.3 6.3 0 1 0 6.3 6.3V8.7a8 8 0 0 0 4.9 1.7V7c0-.2 0-.4 0-.7z"/>
        </svg>
      );
    case "x":
      return (
        <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      );
    case "youtube":
      return (
        <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden="true">
          <path d="M23.5 6.2c-.3-1-1.1-1.8-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6C1.6 4.4.8 5.2.5 6.2 0 8.1 0 12 0 12s0 3.9.5 5.8c.3 1 1.1 1.8 2.1 2.1 1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6c1-.3 1.8-1.1 2.1-2.1.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.2 3.6z"/>
        </svg>
      );
    case "linkedin":
      return (
        <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden="true">
          <path d="M20.45 20.45h-3.55v-5.57c0-1.33 0-3.04-1.85-3.04s-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.61 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/>
        </svg>
      );
    case "pinterest":
      return (
        <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden="true">
          <path d="M12 0C5.4 0 0 5.4 0 12c0 5.1 3.2 9.4 7.6 11.1-.1-.9-.2-2.4 0-3.4.2-.9 1.4-5.7 1.4-5.7s-.4-.7-.4-1.8c0-1.7 1-3 2.2-3 1 0 1.5.8 1.5 1.7 0 1-.7 2.6-1 4-.3 1.2.6 2.2 1.8 2.2 2.1 0 3.7-2.3 3.7-5.5 0-2.9-2.1-4.9-5-4.9-3.4 0-5.4 2.6-5.4 5.2 0 1 .4 2.1.9 2.7.1.1.1.2.1.3-.1.4-.3 1.2-.4 1.4-.1.2-.2.3-.4.2-1.5-.7-2.4-2.9-2.4-4.6 0-3.8 2.7-7.2 7.9-7.2 4.1 0 7.4 3 7.4 6.9 0 4.1-2.6 7.5-6.2 7.5-1.2 0-2.4-.6-2.8-1.4l-.7 2.9c-.3 1-1 2.4-1.5 3.2 1.1.4 2.3.5 3.5.5 6.6 0 12-5.4 12-12S18.6 0 12 0z"/>
        </svg>
      );
    case "snapchat":
      return (
        <svg className={className} viewBox="0 0 24 24" fill={color} stroke="#000" strokeWidth="0.4" aria-hidden="true">
          <path d="M12.166 22c-.6 0-1-.1-1.3-.3-.4-.3-.6-.6-.7-.7-.4-.1-1-.1-1.6-.1-.8 0-1.7-.1-2.6-1-.4-.4-.8-1.1-1.1-1.6-.7-.2-2.3-.8-2.4-1.9 0-.4.3-.7.7-.8 1.7-.7 2.7-1.8 3.2-3.1-.3-.3-.7-.7-.9-1.1-.4-.6-.5-1.2-.3-1.6.3-.6.9-.7 1.4-.6V8c-.1-2 .4-3.3 1.6-4.5C8.9 2.5 10.6 2 11.9 2c.8 0 5.4.2 5.5 5v.3l-.2 1.9c.4-.1 1.1-.1 1.4.6.2.4.1 1-.3 1.6-.3.4-.6.8-.9 1.1.5 1.3 1.5 2.4 3.2 3.1.4.1.6.4.7.8-.1 1-1.7 1.6-2.4 1.9-.3.5-.7 1.2-1.1 1.6-.9.9-1.8 1-2.6 1-.6 0-1.2 0-1.6.1-.1.1-.3.4-.7.7-.3.2-.7.3-1.2.3z"/>
        </svg>
      );
    case "threads":
      return (
        <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden="true">
          <path d="M17.6 11.5c-.1 0-.1-.1-.2-.1-.1-2.3-1.4-3.7-3.5-3.7-1.3 0-2.4.5-3 1.5l1.2.8c.5-.7 1.2-.9 1.9-.9 1.1 0 2 .6 2 2-.7-.1-1.5-.2-2.3 0-2.2.1-3.5 1.4-3.5 3.1 0 1.7 1.4 2.8 3.1 2.8 1.4 0 2.4-.6 3-1.7.4 1 1.3 1.7 2.6 1.8l.6-1.4c-.8-.1-1.4-.4-1.7-1.1.4-.4.7-.9.8-1.5.2-.5.3-1 .2-1.6zM12 21.9c-5.5 0-9.9-4.4-9.9-9.9S6.5 2 12 2s9.9 4.4 9.9 9.9-4.4 10-9.9 10zm0-18.4c-4.7 0-8.5 3.8-8.5 8.5s3.8 8.5 8.5 8.5 8.5-3.8 8.5-8.5-3.8-8.5-8.5-8.5zm1.7 11.1c-1 0-1.7-.5-1.7-1.2 0-.8 1-1.3 2.4-1.2.4 0 .8 0 1.1.1-.1 1.4-.9 2.3-1.8 2.3z"/>
        </svg>
      );
    case "whatsapp":
      return (
        <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden="true">
          <path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.2-.3.2-.5.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.6-1.4-.8-2-.2-.5-.4-.4-.6-.4-.1 0-.3 0-.5 0s-.5.1-.7.4c-.2.3-.9.9-.9 2.2 0 1.3 1 2.6 1.1 2.7.1.2 1.9 2.9 4.6 4.1.6.3 1.1.4 1.5.5.6.2 1.2.2 1.7.1.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.2-.3-.2-.5-.4zM12 22c-1.8 0-3.6-.5-5.1-1.4L2 22l1.4-4.8C2.5 15.6 2 13.8 2 12 2 6.5 6.5 2 12 2s10 4.5 10 10-4.5 10-10 10zm0-18.4C7.4 3.6 3.6 7.4 3.6 12c0 1.7.5 3.3 1.4 4.7l-.9 3.1 3.2-.8c1.3.8 2.9 1.3 4.5 1.3 4.6 0 8.4-3.8 8.4-8.4S16.6 3.6 12 3.6z"/>
        </svg>
      );
    case "yelp":
      return (
        <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden="true">
          <path d="M12.3 14.7l4.4 1c.8.2 1.2.9.9 1.7l-.3.6c-.7 1.7-1.8 3.4-2.3 3.6-.4.1-.7 0-1-.3-.3-.3-2.4-3.2-2.4-3.2-.5-.6-.5-1.4-.2-1.9.3-.6.6-1.5.9-1.5zM12.3 11.9c-.3 0-.6-.9-.9-1.5-.3-.5-.3-1.3.2-1.9 0 0 2.1-2.9 2.4-3.2.3-.3.7-.4 1-.3.5.2 1.6 1.9 2.3 3.6l.3.6c.3.8-.1 1.5-.9 1.7l-4.4 1zM10.3 13.3v6.4c0 .8-.6 1.4-1.4 1.2l-.6-.1c-1.8-.4-3.7-1.1-4-1.5-.2-.3-.2-.7-.1-1 .2-.4 1.9-2.6 2.6-3.5.4-.5 1.2-.8 1.8-.6.5.2 1.7.6 1.7 1.1zM10.3 7.5v3.2c0 .5-1.2.9-1.7 1.1-.6.2-1.4-.1-1.8-.6-.7-.9-2.4-3.1-2.6-3.5-.1-.3-.1-.7.1-1 .4-.5 2.3-1.2 4-1.6L9 5c.8-.2 1.4.4 1.4 1.2v1.3z"/>
        </svg>
      );
    case "googleBusiness":
      return (
        <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden="true">
          <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4c-.2 1.3-1 2.3-2 3v2.5h3.3c1.9-1.8 3-4.4 3-7.3zM12 22c2.7 0 5-.9 6.7-2.5l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6C4.7 19.8 8.1 22 12 22zM6.4 13.9C6.2 13.3 6.1 12.7 6.1 12s.1-1.3.3-1.9V7.5H3C2.4 8.8 2 10.3 2 12s.4 3.2 1 4.5l3.4-2.6zM12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8.1 2 4.7 4.2 3 7.5L6.4 10c.8-2.3 3-4.1 5.6-4.1z"/>
        </svg>
      );
    case "tripadvisor":
      return (
        <svg className={className} viewBox="0 0 24 24" fill={color} aria-hidden="true">
          <circle cx="7" cy="13.5" r="2.5"/>
          <circle cx="17" cy="13.5" r="2.5"/>
          <path d="M12 4.5C8 4.5 4.5 5.9 2 8.5h3.5c1.5-1 3.5-1.5 6.5-1.5s5 .5 6.5 1.5H22c-2.5-2.6-6-4-10-4zm5 5c-1.6 0-3 .9-3.7 2.2-.7-.3-1.5-.4-2.3 0C10.3 10.4 8.9 9.5 7 9.5c-2.5 0-4.5 2-4.5 4.5S4.5 18.5 7 18.5c1.4 0 2.7-.7 3.6-1.7L12 19l1.4-2.2c.9 1 2.2 1.7 3.6 1.7 2.5 0 4.5-2 4.5-4.5S19.5 9.5 17 9.5z"/>
        </svg>
      );
    case "website":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      );
  }
}
