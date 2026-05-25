/**
 * Shared email layout.
 *
 * Every Fee Free email renders inside this shell. It produces the
 * standards-compliant HTML structure email clients (Gmail, Outlook,
 * Apple Mail, iOS Mail, Yahoo) all expect — `<Html>` + `<Head>` +
 * `<Preview>` + `<Body>` + a centered container with a max-width.
 *
 * Visual rules:
 *   - White card on a light-grey background (matches GloriaFood's look)
 *   - Rounded corners, subtle drop shadow
 *   - Max-width 600px (the universally-safe email width — anything
 *     wider gets clipped in Outlook desktop)
 *   - System font stack (no @import-based webfont — most clients strip
 *     <link> tags in <head>, and Google Fonts in particular is unreliable
 *     across the board)
 *
 * The `variant` prop drives the header color:
 *   - `status`        emerald  — customer-facing status updates (order
 *                                confirmed, reservation confirmed,
 *                                friendly reminder)
 *   - `transactional` slate    — kitchen / restaurant-facing notifications,
 *                                billing invoices, password resets
 *   - `digest`        slate    — daily / monthly insights reports
 *   - `neutral`       white    — minimal pages where the header is just
 *                                the platform logo (signup, verify)
 */
import {
  Html, Head, Preview, Body, Container, Section, Img,
} from "@react-email/components";
// Logo URL is pulled from email.ts module state at render time so we
// don't have to thread the prop through every email template. See
// `setEmailLogoUrl()` / `getCurrentImprintLogoUrl()` for the setter +
// getter, and `notifications.ts` `withImprint()` for the scoping.
import { getCurrentImprintLogoUrl } from "@/lib/email";

export type HeaderVariant = "status" | "transactional" | "digest" | "neutral";

const COLORS = {
  bodyBg:      "#f6f6f6",
  cardBg:      "#ffffff",
  border:      "#e5e7eb",
  emerald:     "#10b981",
  emeraldDk:   "#059669",
  slate900:    "#0f172a",
  slate800:    "#1e293b",
  text:        "#111827",
  muted:       "#6b7280",
};

export function EmailLayout({
  preview,
  children,
}: {
  /** First-line preview shown in Gmail / iOS Mail / etc. before the user opens. */
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head>
        {/* Force light mode rendering — emails on dark-mode Gmail get the */}
        {/* colors inverted by default, which breaks our brand. */}
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: COLORS.bodyBg,
          margin: 0,
          padding: "24px 12px",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          color: COLORS.text,
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <Container
          style={{
            backgroundColor: COLORS.cardBg,
            borderRadius: 12,
            maxWidth: 600,
            margin: "0 auto",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}
        >
          {children}
        </Container>
      </Body>
    </Html>
  );
}

/**
 * Header — colored banner at the top of every email. Visual identity bar.
 * GloriaFood-inspired: emerald for "good news" status emails, slate-900 for
 * transactional/billing/digest emails. Renders the platform logo, title,
 * and optional subtitle.
 */
export function EmailHeader({
  variant,
  title,
  subtitle,
  logoUrl,
}: {
  variant: HeaderVariant;
  title: string;
  subtitle?: string;
  /** Optional logo URL. Falls back to no logo if absent (we render just text). */
  logoUrl?: string;
}) {
  const bg =
    variant === "status" ? COLORS.emerald :
    variant === "neutral" ? COLORS.cardBg :
    COLORS.slate900;
  const fg = variant === "neutral" ? COLORS.text : "#ffffff";
  const subFg = variant === "neutral" ? COLORS.muted : "rgba(255,255,255,0.85)";

  return (
    <Section
      style={{
        backgroundColor: bg,
        padding: "28px 32px",
        borderBottom: variant === "neutral" ? `1px solid ${COLORS.border}` : "none",
      }}
    >
      {logoUrl && (
        <Img
          src={logoUrl}
          alt="Fee Free Ordering"
          width="120"
          style={{
            margin: "0 0 12px",
            // On colored headers, invert dark logos to white via filter.
            // (Logo source should be a transparent PNG; this is belt-and-
            // suspenders for dark headers.)
            filter: variant === "neutral" ? "none" : "brightness(0) invert(1)",
          }}
        />
      )}
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: fg,
          lineHeight: 1.25,
          margin: 0,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: 14,
            color: subFg,
            marginTop: 6,
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      )}
    </Section>
  );
}

/**
 * Footer — restaurant signature (when present) + platform imprint.
 * GloriaFood-style: contact info in the body color, then a thin separator,
 * then the platform line in muted grey. Optional unsubscribe link.
 */
export function EmailFooter({
  restaurantName,
  restaurantUrl,
  restaurantEmail,
  restaurantPhone,
  imprint = "Fee Free Ordering Systems",
  unsubscribeUrl,
}: {
  restaurantName?: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  /** Override of the platform line — used when sending under a whitelabel
   *  reseller (set via setEmailImprint() in src/lib/email.ts). */
  imprint?: string;
  /** Optional unsubscribe link — only shown for digest/marketing emails. */
  unsubscribeUrl?: string;
}) {
  return (
    <Section style={{ padding: "20px 32px 28px" }}>
      {restaurantName && (
        <>
          <div style={{ fontSize: 13, color: COLORS.text, marginBottom: 2 }}>
            Kind regards,
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>
            {restaurantName}
          </div>
          {restaurantUrl && (
            <div style={{ fontSize: 13, marginBottom: 2 }}>
              <a href={restaurantUrl} style={{ color: COLORS.emeraldDk, textDecoration: "none" }}>
                {restaurantUrl.replace(/^https?:\/\//, "")}
              </a>
            </div>
          )}
          {restaurantEmail && (
            <div style={{ fontSize: 13, marginBottom: 2 }}>
              <a href={`mailto:${restaurantEmail}`} style={{ color: COLORS.emeraldDk, textDecoration: "none" }}>
                {restaurantEmail}
              </a>
            </div>
          )}
          {restaurantPhone && (
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              <a href={`tel:${restaurantPhone.replace(/[^0-9+]/g, "")}`} style={{ color: COLORS.emeraldDk, textDecoration: "none" }}>
                {restaurantPhone}
              </a>
            </div>
          )}
        </>
      )}
      <div
        style={{
          borderTop: `1px solid ${COLORS.border}`,
          paddingTop: 14,
          fontSize: 11,
          color: COLORS.muted,
          lineHeight: 1.5,
        }}
      >
        {/* Whitelabel reseller logo, when set. Pulled directly from
            module state in email.ts rather than threaded as a prop —
            keeps every template untouched while letting the logo
            appear in their rendered output. Sized small (~22px tall)
            so it complements the imprint line rather than dominating. */}
        {(() => {
          const logoUrl = getCurrentImprintLogoUrl();
          if (!logoUrl) return null;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              style={{
                display: "block",
                maxHeight: 22,
                maxWidth: 120,
                marginBottom: 6,
                opacity: 0.85,
              }}
            />
          );
        })()}
        Powered by <strong style={{ color: COLORS.muted }}>{imprint}</strong>
        {unsubscribeUrl && (
          <>
            {" · "}
            <a href={unsubscribeUrl} style={{ color: COLORS.muted, textDecoration: "underline" }}>
              Unsubscribe
            </a>
          </>
        )}
      </div>
    </Section>
  );
}

export { COLORS };
