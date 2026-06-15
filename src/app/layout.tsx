import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { NextIntlClientProvider } from "next-intl";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import { isRtlLocale } from "@/lib/locales";
import { SupportChat } from "@/components/SupportChat";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fee Free Ordering Systems",
  description: "Online ordering for restaurants — no per-order fees, ever.",
  // Platform default favicon (served from /public/favicon.ico). It lives here
  // — NOT as the file-convention src/app/favicon.ico — so that per-restaurant
  // routes (/order, /site) can REPLACE it with the owner's uploaded favicon via
  // their own `icons` metadata. The file convention auto-injected a second,
  // sized <link rel="icon"> that browsers preferred, so a custom favicon was
  // emitted but never won. Luigi 2026-06-05.
  icons: { icon: "/favicon.ico" },
  // We render our own translated UI via next-intl. Opt out of browser
  // auto-translation (Google Translate, Edge / Microsoft Translator, etc.) —
  // otherwise those extensions mutate the DOM after server render and cause
  // React hydration mismatches like the `_msttexthash` ones we were seeing.
  other: {
    google: "notranslate",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolve locale at the root so marketing/public pages have access to
  // translations. Admin / kitchen / order subtrees override this with their
  // own NextIntlClientProvider that resolves against the restaurant.
  const locale = await resolveLocale();
  const messages = await loadMessages(locale);
  return (
    <html lang={locale} dir={isRtlLocale(locale) ? "rtl" : "ltr"} className="h-full notranslate" translate="no">
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className={`${inter.className} h-full antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
          {/* Tawk.to support chat — globally mounted, self-hides on
              customer-facing /order/* + kitchen + superadmin + embed
              routes. Active by default with Fee Free's Tawk property; an
              env var can override. See src/components/SupportChat.tsx. */}
          <SupportChat />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
