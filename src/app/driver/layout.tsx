import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { resolveStaffLocale, loadMessages } from "@/lib/i18n-server";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { DriverSessionProvider } from "./DriverSessionProvider";

// PWA metadata scoped to /driver — installing from the browser pins an icon
// that opens straight into the driver app. Its own manifest/cookie keep it
// independent of the kitchen and admin surfaces.
export const metadata: Metadata = {
  title: "Fee Free Driver",
  manifest: "/manifest-driver.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Driver",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#064E3B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  // Drivers pick their own language; default English (they're not tied to a
  // single restaurant's defaultLanguage the way kitchen staff are).
  const locale = await resolveStaffLocale(null);
  const messages = await loadMessages(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ServiceWorkerRegister />
      <DriverSessionProvider>{children}</DriverSessionProvider>
    </NextIntlClientProvider>
  );
}
