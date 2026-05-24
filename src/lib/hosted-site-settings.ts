/**
 * Schema for the hosted-site customization JSON stored on
 * Restaurant.hostedSiteSettings. The renderer at /site/[slug] merges
 * these settings with restaurant data — settings are LAYOUT + COPY only,
 * they NEVER replace menu items, hours, or address.
 *
 * Defaults mirror what a freshly-published restaurant sees out of the
 * box. The admin editor reads → edits → writes this shape.
 */

/** Built-in section identifiers used both for visibility toggles and
 *  for positioning custom sections relative to them. */
export type BuiltInSection =
  | "banner"
  | "serviceSummary"
  | "specialOffers"
  | "about"
  | "featuredMenu"
  | "visit"
  | "map"
  | "social";

export interface CustomSection {
  /** Stable id so the admin UI can edit/reorder/delete. Generated client-side
   *  (timestamp + random) when the section is first created. */
  id: string;
  /** Section heading rendered as an H2 on the public page. */
  title: string;
  /** Plain-text body. Newlines preserved with `white-space: pre-line`.
   *  Markdown / HTML deliberately NOT supported in v1 — XSS surface and
   *  most owners don't need it. */
  body: string;
  /** Where to insert this section relative to the built-ins. The renderer
   *  inserts custom sections AFTER the named built-in. */
  position: BuiltInSection;
}

export interface HostedSiteSettings {
  header: {
    /** When true, show the uploaded logo (overlapping the banner+hero). */
    showLogo: boolean;
    /** When true, show the cuisine type label under the title. */
    showCuisineLabel: boolean;
    /** Override the page title shown in the hero. Empty/null → use
     *  Restaurant.name (the default). */
    customTitle: string | null;
    /** Override the slogan/subtitle shown under the title. Empty/null →
     *  use Restaurant.slogan. */
    customSlogan: string | null;
    /** Render the banner image as a FULL-SCREEN hero (image fills the
     *  viewport, dark overlay underneath the title), GloriaFood-style.
     *  When false, the banner shows as a contained strip above a colored
     *  hero block — the layout we settled on for logo-style banners.
     *  Default true as of 2026-05-24 revamp; food-photography banners
     *  are by far the most common case and look dramatically better
     *  full-bleed. Restaurants with logo-only banners can flip this off. */
    fullScreenHero: boolean;
    /** Sticky top nav (logo on the left, section anchor links in the
     *  middle, "Order Online" CTA on the right). Always visible as the
     *  user scrolls. Matches GloriaFood's top-bar pattern that Luigi
     *  flagged during UAT as missing. */
    stickyNav: boolean;
    /** Darkening overlay on the full-screen hero photo, 0..1. Lower =
     *  food photo shows through more clearly. 0.4 is the GloriaFood
     *  default and balances legibility against letting the photo do
     *  its job. 0 = no overlay (use only with very dark photos);
     *  0.7 = strong overlay (use when title contrast really matters). */
    heroOverlayOpacity: number;
  };
  sections: {
    /** Show the banner image at the very top of the page. Disable to
     *  start with a clean color-only hero. */
    banner: boolean;
    /** Show the prominent service-summary card right under the hero —
     *  "We offer Takeout & Food Delivery" + a big centered "See MENU
     *  & Order" button. Mirrors GloriaFood's pattern; gives customers
     *  a clear, impossible-to-miss CTA without having to scroll past
     *  the hero. */
    serviceSummary: boolean;
    /** Show a "Special Offers" grid of currently-active promotions.
     *  Pulls from the Promotion model (auto-apply, within startsAt/
     *  endsAt window, isActive=true). Hidden when no active promos
     *  match. Each card shows name + description + a CTA to the
     *  order page (no code needed since these are auto-apply). */
    specialOffers: boolean;
    /** Show the About section pulled from Restaurant.description. */
    about: boolean;
    /** Show the Featured Menu grid (auto-pulled from isFeatured items). */
    featuredMenu: boolean;
    /** Show the Visit block (address + phone + email + service pills). */
    visit: boolean;
    /** Show the embedded Google Maps iframe. Requires an address. */
    map: boolean;
    /** Show social-link pills (built from Restaurant.socialLinks). */
    social: boolean;
  };
  cta: {
    /** Primary call-to-action (the order button). */
    primary: {
      /** Button label. Defaults to "Order Online". */
      label: string;
      /** Where the button goes. Defaults to /order/<slug>. Restaurants
       *  generally shouldn't change this, but they can if they want to
       *  link to e.g. a third-party reservation page. */
      href: string | null;
      /** When false, the primary CTA isn't rendered. (Rare — the order
       *  button is the point of the page — but some restaurants might
       *  want phone-only ordering during a launch period.) */
      enabled: boolean;
    };
    /** Secondary call-to-action — defaults to Book a Table when the
     *  restaurant accepts reservations. */
    secondary: {
      enabled: boolean;
      label: string;
      href: string | null;
    };
  };
  customSections: CustomSection[];
}

/** Defaults used when a restaurant hasn't customized anything yet, OR
 *  when the JSON is unparseable / partial. */
export function defaultHostedSiteSettings(): HostedSiteSettings {
  return {
    header: {
      showLogo: true,
      showCuisineLabel: true,
      customTitle: null,
      customSlogan: null,
      fullScreenHero: true,
      stickyNav: true,
      heroOverlayOpacity: 0.4,
    },
    sections: {
      banner: true,
      serviceSummary: true,
      specialOffers: true,
      about: true,
      featuredMenu: true,
      visit: true,
      map: true,
      social: true,
    },
    cta: {
      primary: { label: "Order Online", href: null, enabled: true },
      secondary: { label: "Book a Table", href: null, enabled: true },
    },
    customSections: [],
  };
}

/**
 * Parse the raw JSON string from the DB into a fully-typed settings
 * object. Tolerates malformed / partial input — any missing field
 * falls back to the default. The merge happens at every level, so an
 * owner who set `{ header: { showLogo: false } }` still gets the rest
 * of the defaults filled in.
 *
 * v1 also validates the customSections array shape: only objects with
 * `id`/`title`/`body`/`position` (all strings) survive parsing.
 */
export function parseHostedSiteSettings(raw: string | null | undefined): HostedSiteSettings {
  const defaults = defaultHostedSiteSettings();
  if (!raw) return defaults;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
  const p = parsed as Partial<HostedSiteSettings>;
  return {
    header: {
      ...defaults.header,
      ...(p.header && typeof p.header === "object" ? p.header : {}),
    },
    sections: {
      ...defaults.sections,
      ...(p.sections && typeof p.sections === "object" ? p.sections : {}),
    },
    cta: {
      primary: {
        ...defaults.cta.primary,
        ...(p.cta?.primary && typeof p.cta.primary === "object" ? p.cta.primary : {}),
      },
      secondary: {
        ...defaults.cta.secondary,
        ...(p.cta?.secondary && typeof p.cta.secondary === "object" ? p.cta.secondary : {}),
      },
    },
    customSections: Array.isArray(p.customSections)
      ? p.customSections
          .filter(
            (s): s is CustomSection =>
              !!s &&
              typeof s === "object" &&
              typeof (s as any).id === "string" &&
              typeof (s as any).title === "string" &&
              typeof (s as any).body === "string" &&
              typeof (s as any).position === "string"
          )
          .slice(0, 2) // hard cap at 2 custom sections in v1
      : [],
  };
}

/** Hard caps the renderer + API enforce. Owners hitting these limits
 *  see a "remove a section first" error in the admin UI. */
export const MAX_CUSTOM_SECTIONS = 2;
export const MAX_CUSTOM_SECTION_TITLE_LEN = 80;
export const MAX_CUSTOM_SECTION_BODY_LEN = 4000;
export const MAX_CTA_LABEL_LEN = 40;
