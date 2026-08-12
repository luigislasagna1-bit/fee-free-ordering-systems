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
import { DEFAULT_LOCALE, isRtlLocale, isSupportedLocale, type Locale } from "@/lib/locales";

export type HeaderVariant = "status" | "transactional" | "digest" | "neutral";

/**
 * Physical edge the text flows FROM (`start`) and TO (`end`) for a locale.
 *
 * These exist because email has no usable logical-property support: Outlook
 * desktop renders through the Word engine, which ignores `text-align: start`,
 * `padding-inline-start` and friends, so an RTL layout has to emit REAL
 * `left`/`right` values that we mirror ourselves. `dir="rtl"` on <html> flips
 * the reading order and the visual column order of a table, but it does NOT
 * touch a hardcoded `text-align: right` or `padding-left` — those stay pinned
 * to the physical side and land on the wrong edge in Arabic and Hebrew.
 *
 * An absent/unknown locale resolves LTR, so every existing caller keeps its
 * current output byte-for-byte.
 */
export function textStart(locale?: string | null): "left" | "right" {
  return isRtlLocale(locale) ? "right" : "left";
}

export function textEnd(locale?: string | null): "left" | "right" {
  return isRtlLocale(locale) ? "left" : "right";
}

/**
 * Direction-aware one-sided spacing/border fragments, spread into a style
 * object. `side` is whatever textStart()/textEnd() resolved to.
 *
 * These return camelCase React style keys rather than building `padding-${side}`
 * inline — React only understands camelCase style properties and warns on (then
 * mishandles) hyphenated ones.
 */
export const padSide = (side: "left" | "right", value: number) =>
  side === "left" ? { paddingLeft: value } : { paddingRight: value };

export const marginSide = (side: "left" | "right", value: number) =>
  side === "left" ? { marginLeft: value } : { marginRight: value };

export const borderSide = (side: "left" | "right", value: string) =>
  side === "left" ? { borderLeft: value } : { borderRight: value };

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
  locale,
  children,
}: {
  /** First-line preview shown in Gmail / iOS Mail / etc. before the user opens. */
  preview: string;
  /**
   * Language this email's CONTENT is written in — normally `t.locale`, the
   * translator the sender already built with `getDict(params.locale)`.
   *
   * Drives `lang` + `dir` on <html>. @react-email/html defaults these to
   * `lang="en" dir="ltr"` and emits them EXPLICITLY, so leaving it unset was
   * actively harmful rather than merely absent: an explicit `dir="ltr"`
   * overrides the RTL auto-detection heuristics mail clients apply to Arabic
   * and Hebrew, and a false `lang="en"` degrades CJK font selection in Gmail,
   * screen-reader pronunciation, and Gmail's "translate this message" offer.
   *
   * Templates whose body is hardcoded English (VerifyEmail, SignupConfirmation,
   * the reseller/billing notifications) deliberately leave this unset — `lang`
   * describes the content, not the recipient's preference, so "en" is the
   * truthful answer for them.
   */
  locale?: string | null;
  children: React.ReactNode;
}) {
  const lang: Locale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const rtl = isRtlLocale(lang);
  return (
    <Html lang={lang} dir={rtl ? "rtl" : "ltr"}>
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
          // The <html dir> above only reaches clients that render our document
          // whole (Apple Mail, iOS Mail, Outlook desktop, Thunderbird). Gmail,
          // Outlook.com and Yahoo strip <html>/<head>/<body> and re-host the
          // remaining markup inside their OWN document, so that attribute never
          // arrives — which is most of our recipients. Repeating it on the
          // outermost surviving element is what actually makes Arabic and
          // Hebrew read right-to-left in webmail.
          //
          // Set ONLY for RTL: emitting dir="ltr" here would both re-create the
          // original bug one level down (an explicit LTR overrides the client's
          // own RTL heuristics) and change the rendered output for all 36 LTR
          // locales, which are currently byte-identical to before this change.
          dir={rtl ? "rtl" : undefined}
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
/** Localized strings for the prominent CASL marketing footer variant. */
export type MarketingFooterStrings = {
  /** "You're receiving this because you're a customer of {name}." */
  whyReceiving: string;
  /** "Unsubscribe" */
  unsubscribe: string;
  /** "Delete my personal data" */
  deleteData: string;
};

export function EmailFooter({
  restaurantName,
  restaurantUrl,
  restaurantEmail,
  restaurantPhone,
  imprint,
  unsubscribeUrl,
  dataDeletionUrl,
  marketing,
  marketingStrings,
  signOff = "Kind regards,",
  poweredByLabel = "Powered by",
  postalAddress,
}: {
  restaurantName?: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  /** Override of the platform line — used when sending under a whitelabel
   *  reseller (set via setEmailImprint() in src/lib/email.ts). Reseller
   *  imprints are FULL SENTENCES ("Supported by X | email") so they render
   *  VERBATIM — no "Powered by" prefix (Fabrizio cms0gyexp: "Powered by
   *  Supported by PISU MARKETING" read as a doubled prefix). Only the
   *  platform default keeps the prefix. */
  imprint?: string;
  /** Optional unsubscribe link — only shown for digest/marketing emails. */
  unsubscribeUrl?: string;
  /** CASL/GDPR "delete my personal data" self-serve link (marketing only). */
  dataDeletionUrl?: string;
  /** Render the prominent CASL marketing footer (descriptive why-received line
   *  + Unsubscribe + Delete-my-data links) instead of the tiny imprint line. */
  marketing?: boolean;
  /** Localized strings for the marketing variant (all 38 locales). */
  marketingStrings?: MarketingFooterStrings;
  /** Localized "Kind regards," — templates with a Translator pass
   *  t("email.footer.signOff"); default keeps English (cms0gyexp #4b). */
  signOff?: string;
  /** Localized "Powered by" prefix for the platform imprint line. */
  poweredByLabel?: string;
  /** Platform postal address — CAN-SPAM requires one on COMMERCIAL mail, so
   *  the marketing senders (autopilot/kickstarter) pass it; transactional
   *  emails leave it unset. */
  postalAddress?: string | null;
}) {
  return (
    <Section style={{ padding: "20px 32px 28px" }}>
      {restaurantName && (
        <>
          <div style={{ fontSize: 13, color: COLORS.text, marginBottom: 2 }}>
            {signOff}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>
            {restaurantName}
          </div>
          {/* PHONE FIRST, boxed with a handset icon (Fabrizio cms0gyexp #4
              follow-up): customers call when something goes wrong, so the
              number leads the contact block as a tappable pill. Inline
              styles + emoji only — email-client-safe (no webfonts/SVG). */}
          {restaurantPhone && (
            <div style={{ margin: "6px 0 8px" }}>
              <a
                href={`tel:${restaurantPhone.replace(/[^0-9+]/g, "")}`}
                style={{
                  display: "inline-block",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.emeraldDk,
                  textDecoration: "none",
                  backgroundColor: "#f0fdf4",
                }}
              >
                📞 {restaurantPhone}
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
          {restaurantUrl && (
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              <a href={restaurantUrl} style={{ color: COLORS.emeraldDk, textDecoration: "none" }}>
                {restaurantUrl.replace(/^https?:\/\//, "")}
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
        {/* CASL marketing footer: a PROMINENT why-received line + clear
            Unsubscribe and Delete-my-data links. Larger/darker than the tiny
            imprint line so the opt-out is actually findable (the old footer's
            muted 11px "Unsubscribe" is why a recipient said there was none). */}
        {marketing && marketingStrings && (
          <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6, marginBottom: 12 }}>
            <div>{marketingStrings.whyReceiving.replace("{name}", restaurantName ?? "")}</div>
            <div style={{ marginTop: 6 }}>
              {unsubscribeUrl && (
                <a href={unsubscribeUrl} style={{ color: COLORS.emeraldDk, textDecoration: "underline", fontWeight: 600 }}>
                  {marketingStrings.unsubscribe}
                </a>
              )}
              {unsubscribeUrl && dataDeletionUrl && <span style={{ color: COLORS.muted }}>{"  ·  "}</span>}
              {dataDeletionUrl && (
                <a href={dataDeletionUrl} style={{ color: COLORS.emeraldDk, textDecoration: "underline", fontWeight: 600 }}>
                  {marketingStrings.deleteData}
                </a>
              )}
            </div>
          </div>
        )}
        {imprint ? (
          // Custom (reseller) imprint — a full sentence, rendered verbatim.
          <span>{imprint}</span>
        ) : (
          <>
            {poweredByLabel} <strong style={{ color: COLORS.muted }}>Fee Free Ordering Systems</strong>
          </>
        )}
        {/* Minimal transactional/digest unsubscribe (non-marketing only — the
            marketing block above already renders a prominent one). */}
        {!marketing && unsubscribeUrl && (
          <>
            {" · "}
            <a href={unsubscribeUrl} style={{ color: COLORS.muted, textDecoration: "underline" }}>
              Unsubscribe
            </a>
          </>
        )}
        {postalAddress && (
          <div style={{ marginTop: 6 }}>{postalAddress}</div>
        )}
      </div>
    </Section>
  );
}

export { COLORS };
