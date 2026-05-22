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
export type BuiltInSection = "banner" | "about" | "featuredMenu" | "visit" | "map" | "social";

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
  };
  sections: {
    /** Show the banner image at the very top of the page. Disable to
     *  start with a clean color-only hero. */
    banner: boolean;
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
    },
    sections: {
      banner: true,
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
