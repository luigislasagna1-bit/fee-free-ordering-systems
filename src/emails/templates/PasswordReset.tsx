/**
 * Password-reset email.
 *
 * Navy transactional header. Clear "you asked to reset your password"
 * preamble, big "Reset password" CTA button, link expiry note, fallback
 * "if you didn't request this" copy.
 *
 * FULLY LOCALIZED ×38 + restaurant-brandable (Fabrizio cms0gyexp #5 — the
 * body was hardcoded English under an Italian subject, and told a
 * restaurant's customer about their "Fee Free Ordering account", breaking
 * white-label). `accountName` brands the copy; restaurant contact props
 * brand the footer. Platform flows (owner/marketplace) omit them and keep
 * the platform identity.
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton } from "../components/EmailParts";

export type PasswordResetProps = {
  t: Translator;
  name?: string;
  resetUrl: string;
  /** Human duration, e.g. "1 hour" — defaults to the localized "1 hour". */
  expiresIn?: string;
  /** Whose account this is — the RESTAURANT's name for storefront customers
   *  (white-label), "Fee Free Ordering" for platform/marketplace flows. */
  accountName?: string;
  /** Restaurant footer branding (storefront customer flow only). */
  restaurantName?: string;
  restaurantUrl?: string;
  restaurantEmail?: string | null;
  restaurantPhone?: string | null;
  imprint?: string;
};

export default function PasswordReset({
  t, name, resetUrl, expiresIn, accountName = "Fee Free Ordering",
  restaurantName, restaurantUrl, restaurantEmail, restaurantPhone, imprint,
}: PasswordResetProps) {
  const expiry = expiresIn ?? t("email.passwordReset.expiryOneHour");
  return (
    <EmailLayout locale={t.locale} preview={t("email.passwordReset.preview", { brand: accountName })}>
      <EmailHeader
        variant="transactional"
        title={t("email.passwordReset.title")}
        subtitle={t("email.passwordReset.subtitle")}
      />
      <EmailBody>
        <P>
          {name
            ? t("email.passwordReset.greeting", { name })
            : t("email.passwordReset.greetingNoName")}
        </P>
        <P>
          {t("email.passwordReset.body", { account: accountName, expiresIn: expiry })}
        </P>
        <EmailButton href={resetUrl}>{t("email.passwordReset.button")}</EmailButton>
        <P size="sm" muted>
          {t("email.passwordReset.linkFallback")}<br />
          <a href={resetUrl} style={{ color: "#059669", wordBreak: "break-all" }}>{resetUrl}</a>
        </P>
        <P size="sm" muted>
          <strong>{t("email.passwordReset.ignoreHeading")}</strong>{" "}
          {t("email.passwordReset.ignoreBody")}
        </P>
      </EmailBody>
      <EmailFooter
        restaurantName={restaurantName}
        restaurantUrl={restaurantUrl}
        restaurantEmail={restaurantEmail ?? undefined}
        restaurantPhone={restaurantPhone ?? undefined}
        imprint={imprint}
        signOff={t("email.footer.signOff")}
        poweredByLabel={t("email.footer.poweredBy")}
      />
    </EmailLayout>
  );
}
