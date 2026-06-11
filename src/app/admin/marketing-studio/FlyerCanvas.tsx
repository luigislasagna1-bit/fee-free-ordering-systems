/**
 * Presentational flyer (Luigi 2026-06-10). Pure component — used both in the
 * editor preview (qrSrc = the QR API URL) and the print page (qrSrc = an inlined
 * data-URI so it paints before the print dialog). Sizing uses container-query
 * units (cqw) so the same markup scales from a small preview to a full A4 page.
 */
import { flyerTheme, resolveFlyerBg } from "@/lib/marketing-templates";

export function FlyerCanvas({
  templateId,
  restaurantName,
  logoUrl,
  address,
  phone,
  website,
  footerText,
  headline,
  offerText,
  qrSrc,
  primaryColor,
  scanLabel,
  rounded = false,
}: {
  templateId: string;
  restaurantName: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  footerText?: string | null;
  headline: string;
  offerText: string;
  qrSrc: string;
  primaryColor: string;
  scanLabel: string;
  rounded?: boolean;
}) {
  const theme = flyerTheme(templateId);
  const bg = resolveFlyerBg(theme, primaryColor);

  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "210 / 297",
        containerType: "inline-size",
        background: bg,
        color: theme.fg,
        overflow: "hidden",
        borderRadius: rounded ? 12 : 0,
        // Keep brand colours when printing.
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      <div style={{ height: "100%", padding: "9cqw 8cqw", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", boxSizing: "border-box" }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" style={{ width: "22cqw", height: "22cqw", objectFit: "cover", borderRadius: "50%", marginBottom: "3cqw" }} />
        ) : null}

        <div style={{ fontSize: "5.5cqw", fontWeight: 700, letterSpacing: "0.02em" }}>{restaurantName}</div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "3cqw" }}>
          <div style={{ fontSize: "11cqw", fontWeight: 800, lineHeight: 1.05 }}>{headline}</div>
          {offerText ? <div style={{ fontSize: "4.5cqw", color: theme.muted, lineHeight: 1.3 }}>{offerText}</div> : null}
        </div>

        <div style={{ background: "#ffffff", borderRadius: "5cqw", padding: "5cqw 5cqw 4cqw", display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "2cqw" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt="QR" style={{ width: "34cqw", height: "34cqw", display: "block" }} />
          <div style={{ fontSize: "3.8cqw", fontWeight: 700, color: "#0f172a" }}>{scanLabel}</div>
        </div>

        {/* Extra free-text line under the QR (e.g. "Mention this flyer for…"). */}
        {footerText ? (
          <div style={{ marginTop: "4cqw", fontSize: "4cqw", fontWeight: 600, lineHeight: 1.25 }}>{footerText}</div>
        ) : null}

        {/* Contact footer — phone · website on one line, address beneath. */}
        {(phone || website || address) && (
          <div style={{ marginTop: footerText ? "2.5cqw" : "4cqw", fontSize: "3.2cqw", color: theme.muted, lineHeight: 1.45 }}>
            {(phone || website) && <div>{[phone, website].filter(Boolean).join("  ·  ")}</div>}
            {address ? <div>{address}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}
