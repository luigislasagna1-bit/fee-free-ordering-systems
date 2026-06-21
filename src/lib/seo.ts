import type { Metadata } from "next";

/**
 * Shared metadata builder for the public marketing pages so every page gets a
 * proper <title>, description, canonical, and Open Graph / Twitter card (with
 * the shared OG image) instead of inheriting the generic layout default. The
 * homepage sets its own richer metadata + JSON-LD inline; this is for the
 * simpler marketing pages (features, pricing, faq, demo, partners…).
 * metadataBase (in layout.tsx) makes the relative `path` resolve absolutely.
 */
export function marketingMetadata(opts: { title: string; description: string; path: string }): Metadata {
  const { title, description, path } = opts;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Fee Free Ordering",
      url: path,
      images: [{ url: "/marketing/og-image.png", width: 1200, height: 630, alt: "Fee Free Ordering — 0% commission online ordering for restaurants" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/marketing/og-image.png"] },
  };
}
