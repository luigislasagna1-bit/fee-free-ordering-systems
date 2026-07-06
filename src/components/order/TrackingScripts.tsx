"use client";
import Script from "next/script";

/**
 * Injects the RESTAURANT's own Facebook Pixel + Google Analytics (GA4) on their
 * ordering page, when they've configured the IDs on the Integrations page. The
 * restaurant is the data controller for this tracking; we only inject what they
 * set. IDs are validated server-side (digits / G-XXXXXXXXXX) before storage, so
 * interpolating them here is safe. Rendered only on the customer ordering page.
 *
 * NOTE (Luigi 2026-06-17): this loads unconditionally when configured. For EU
 * restaurants a cookie-consent gate is the recommended next step — a shared
 * consent banner would let us defer fbq/gtag until the visitor opts in. Flagged
 * for follow-up; for now the owner is responsible for disclosure/consent.
 */
export function TrackingScripts({
  facebookPixelId,
  googleAnalyticsId,
}: {
  facebookPixelId?: string | null;
  googleAnalyticsId?: string | null;
}) {
  return (
    <>
      {googleAnalyticsId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(googleAnalyticsId)});`}
          </Script>
        </>
      )}
      {facebookPixelId && (
        <Script id="fb-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(facebookPixelId)});
fbq('track', 'PageView');`}
        </Script>
      )}
    </>
  );
}
