/**
 * "Own Your Orders. Keep Your Margin." — FAITHFUL REPLICA of Luigi's reference flyer
 * (Luigi 2026-08-14: "ensure this EXACT image is available exactly as it looks here, but with
 * a different qr code (to match reseller)").
 *
 * So: this template reproduces that artwork as closely as satori allows, and the ONLY thing
 * that varies per partner is the QR code (plus the small caption under it) which points at
 * their own /signup?ref= link instead of the platform one.
 *
 * DELIBERATE DIFFERENCES FROM THE REST OF THE KIT, all because "exact" was the requirement:
 *   - It is platform-branded by design — the wordmark, the Canadian support line, the named
 *     reference to Luigi's Lasagna & Pizzeria and the add-on prices are all part of the
 *     artwork. The other templates in this kit are brand-agnostic and swap to a partner's own
 *     identity; this one intentionally does not.
 *   - Prices are the figures printed on the reference artwork rather than a live AddOn lookup.
 *     The catalog still carries `monthlyPriceCents: 0` placeholders for several of these slugs
 *     ("superadmin sets real price later"), so reading live values here would print $0.00.
 *     They live in ONE constant below so they can be checked and changed in one place.
 *
 * The reference layout is a card grid; satori has no CSS grid, so every column and row here is
 * explicit flex. That is the bulk of this file.
 */
import type { KitRenderContext, KitTemplate } from "../types";
import { Box, Canvas, Col, Row, Text, Spacer, CheckIcon, StarIcon, MenuIcon } from "../primitives";

/* ── Palette sampled from the reference artwork ─────────────────────────────────────────── */
const NAVY = "#0B2B5C";
const NAVY_DEEP = "#0A2145";
const GREEN = "#159A3C";
const GREEN_DARK = "#0E7A31";
const BLUE = "#123B73";
const RED = "#D91F26";
const INK = "#0F172A";
const MUTED = "#475569";
const PANEL = "#F5F8FC";
const LINE = "#DCE5EF";

/**
 * The prices exactly as printed on the reference artwork. NOT read from the AddOn catalog on
 * purpose — see the header note. Change them here and every copy of this flyer follows.
 */
const PRICE_ROWS: { label: string; price: string }[] = [
  { label: "Hosted Website", price: "$19.99/mo" },
  { label: "Online Payments", price: "$39.99/mo" },
  { label: "Multi-Location", price: "$49.99/mo per child site" },
];

/** The Fee Free "F" motion mark, inlined as SVG so there is no network fetch mid-render. */
function markDataUri(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">` +
    `<g fill="#159A3C">` +
    `<rect x="0" y="14" width="34" height="11" rx="5.5"/>` +
    `<rect x="6" y="34" width="28" height="11" rx="5.5"/>` +
    `<rect x="0" y="54" width="34" height="11" rx="5.5"/>` +
    `<path d="M44 6h62c4 0 6 3 5 6l-2 9c-1 3-3 5-6 5H70l-3 14h30c4 0 6 3 5 6l-2 9c-1 3-3 5-6 5H62l-6 30c-1 3-3 5-6 5H36c-4 0-6-3-5-6L44 6z"/>` +
    `</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Canadian flag roundel used beside the support line. */
function flagDataUri(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="31" fill="#fff" stroke="#D91F26" stroke-width="2"/>` +
    `<path d="M2 32a30 30 0 0 1 14-25v50A30 30 0 0 1 2 32z" fill="#D91F26"/>` +
    `<path d="M62 32a30 30 0 0 0-14-25v50a30 30 0 0 0 14-25z" fill="#D91F26"/>` +
    `<path d="M32 14l4 8 7-3-2 8 5 1-7 6 1 4-8-1v6h-2v-6l-8 1 1-4-7-6 5-1-2-8 7 3z" fill="#D91F26"/>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/* ── Small building blocks ──────────────────────────────────────────────────────────────── */

function Tick({ g, color = GREEN }: { g: KitRenderContext["geom"]; color?: string }) {
  return <CheckIcon size={g.u(17)} color={color} />;
}

function BulletRow({ ctx, text }: { ctx: KitRenderContext; text: string }) {
  const g = ctx.geom;
  return (
    <Row style={{ gap: g.u(9), alignItems: "flex-start", marginBottom: g.u(12) }}>
      <Box style={{ marginTop: g.u(2) }}><Tick g={g} /></Box>
      <Text style={{ fontSize: g.u(15), color: INK, lineHeight: 1.32, maxWidth: g.u(258) }}>{text}</Text>
    </Row>
  );
}

function IncludedRow({ ctx, text }: { ctx: KitRenderContext; text: string }) {
  const g = ctx.geom;
  return (
    <Row style={{ gap: g.u(9), alignItems: "flex-start", marginBottom: g.u(11) }}>
      <Box
        style={{
          width: g.u(15), height: g.u(15), borderRadius: g.u(3),
          backgroundColor: BLUE, flexShrink: 0, marginTop: g.u(2),
        }}
      />
      <Text style={{ fontSize: g.u(14), color: INK, lineHeight: 1.32, maxWidth: g.u(252) }}>{text}</Text>
    </Row>
  );
}

/** One of the eight green/outline badges in the middle strip. */
function Badge({
  ctx, title, sub, solid,
}: {
  ctx: KitRenderContext; title: string; sub?: string; solid: boolean;
}) {
  const g = ctx.geom;
  return (
    <Col
      style={{
        flexGrow: 1, flexBasis: 0,
        backgroundColor: solid ? GREEN : "#ffffff",
        border: solid ? `${Math.max(1, g.u(2))}px solid ${GREEN}` : `${Math.max(1, g.u(2))}px solid ${LINE}`,
        borderRadius: g.u(8),
        paddingTop: g.u(9), paddingBottom: g.u(9), paddingLeft: g.u(9), paddingRight: g.u(9),
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontSize: g.u(14), fontWeight: 800, lineHeight: 1.1,
          color: solid ? "#ffffff" : INK,
        }}
      >
        {title}
      </Text>
      {sub ? (
        <Text
          style={{
            fontSize: g.u(11), fontWeight: 700, lineHeight: 1.1, marginTop: g.u(2),
            color: solid ? "#ffffff" : MUTED,
          }}
        >
          {sub}
        </Text>
      ) : null}
    </Col>
  );
}

/** Column header bar (green or blue) used by the three panels. */
function PanelHeader({ ctx, text, color }: { ctx: KitRenderContext; text: string; color: string }) {
  const g = ctx.geom;
  return (
    <Box
      style={{
        backgroundColor: color, borderTopLeftRadius: g.u(9), borderTopRightRadius: g.u(9),
        paddingTop: g.u(8), paddingBottom: g.u(8),
        alignItems: "center", justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: g.u(16), fontWeight: 800, color: "#ffffff" }}>{text}</Text>
    </Box>
  );
}

/** The phone mockup: green header, two menu rows, a checkout bar. */
function PhoneMock({ ctx }: { ctx: KitRenderContext }) {
  const g = ctx.geom;
  const t = ctx.t;
  const item = (name: string, price: string, tint: string) => (
    <Row key={name} style={{ gap: g.u(9), marginBottom: g.u(8), alignItems: "center" }}>
      <Box style={{ width: g.u(40), height: g.u(34), borderRadius: g.u(6), backgroundColor: tint, flexShrink: 0 }} />
      <Col style={{ flexGrow: 1 }}>
        <Text style={{ fontSize: g.u(14), fontWeight: 700, color: INK }}>{name}</Text>
        <Text style={{ fontSize: g.u(12.5), color: MUTED }}>{price}</Text>
      </Col>
      <Box
        style={{
          width: g.u(26), height: g.u(26), borderRadius: g.u(6), backgroundColor: GREEN,
          color: "#ffffff", alignItems: "center", justifyContent: "center",
          fontSize: g.u(17), fontWeight: 800, flexShrink: 0,
        }}
      >
        +
      </Box>
    </Row>
  );

  return (
    <Col
      style={{
        width: g.u(360),
        backgroundColor: "#ffffff",
        borderRadius: g.u(14),
        border: `${Math.max(1, g.u(2))}px solid ${LINE}`,
        padding: g.u(10),
      }}
    >
      <Row
        style={{
          backgroundColor: GREEN, borderRadius: g.u(9),
          paddingTop: g.u(9), paddingBottom: g.u(9), paddingLeft: g.u(11), paddingRight: g.u(11),
          gap: g.u(9), marginBottom: g.u(10),
        }}
      >
        <MenuIcon size={g.u(15)} />
        <Text style={{ fontSize: g.u(15), fontWeight: 800, color: "#ffffff", flexGrow: 1 }}>
          {t("phone.storeName")}
        </Text>
        <Text style={{ fontSize: g.u(13), fontWeight: 800, color: "#ffffff" }}>{t("phone.cart")}</Text>
      </Row>

      {item(t("phone.item1"), "$14.00", "#F3C98B")}
      {item(t("phone.item2"), "$8.50", "#A7D08C")}

      <Row
        style={{
          backgroundColor: GREEN, borderRadius: g.u(8),
          paddingTop: g.u(9), paddingBottom: g.u(9), paddingLeft: g.u(11), paddingRight: g.u(11),
          marginTop: g.u(2),
        }}
      >
        <Text style={{ fontSize: g.u(15), fontWeight: 800, color: "#ffffff", flexGrow: 1 }}>
          {t("phone.checkout")}
        </Text>
        <Text style={{ fontSize: g.u(15), fontWeight: 800, color: "#ffffff" }}>$22.50</Text>
      </Row>
    </Col>
  );
}

/* ── The flyer ──────────────────────────────────────────────────────────────────────────── */

function render(ctx: KitRenderContext) {
  const { geom: g, t, rtl } = ctx;

  return (
    <Canvas geom={g} paper="#FFFFFF" ink={INK} rtl={rtl}>
      <Col style={{ width: "100%", height: "100%", paddingTop: g.u(20), paddingLeft: g.u(26), paddingRight: g.u(26), paddingBottom: 0 }}>
        {/* ── Masthead ─────────────────────────────────────────── */}
        <Row style={{ justifyContent: "center", gap: g.u(14), alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markDataUri()} alt="" width={g.u(96)} height={g.u(80)} style={{ width: g.u(96), height: g.u(80) }} />
          <Text style={{ fontSize: g.u(58), fontWeight: 800, color: NAVY, lineHeight: 1 }}>
            {t("brandName")}
          </Text>
          <Text style={{ fontSize: g.u(18), fontWeight: 700, color: NAVY, marginTop: g.u(-24) }}>™</Text>
        </Row>
        <Row style={{ justifyContent: "center", marginTop: g.u(4) }}>
          <Text style={{ fontSize: g.u(17), color: MUTED }}>{t("tagline")}</Text>
        </Row>
        <Row style={{ justifyContent: "center", marginTop: g.u(7), gap: g.u(5) }}>
          <Text style={{ fontSize: g.u(14), color: NAVY }}>{t("credit")}</Text>
        </Row>

        {/* ── Hero: headline + comparison | phone + support ────── */}
        <Row style={{ marginTop: g.u(22), gap: g.u(16), alignItems: "flex-start" }}>
          <Col style={{ flexGrow: 1, flexBasis: 0 }}>
            <Text style={{ fontSize: g.u(50), fontWeight: 800, color: NAVY_DEEP, lineHeight: 1.04 }}>
              {ctx.overrides.headline?.trim() || t("headline1")}
            </Text>
            <Text style={{ fontSize: g.u(50), fontWeight: 800, color: GREEN, lineHeight: 1.04 }}>
              {t("headline2")}
            </Text>
            <Text style={{ fontSize: g.u(16), color: INK, marginTop: g.u(10), lineHeight: 1.35, maxWidth: g.u(430) }}>
              {t("subhead")}
            </Text>

            <Row style={{ marginTop: g.u(14), gap: g.u(8), alignItems: "center" }}>
              <Col
                style={{
                  flexGrow: 1, flexBasis: 0, backgroundColor: PANEL, borderRadius: g.u(10),
                  border: `${Math.max(1, g.u(2))}px solid ${LINE}`,
                  paddingTop: g.u(10), paddingBottom: g.u(10), paddingLeft: g.u(10), paddingRight: g.u(10),
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: g.u(13), fontWeight: 700, color: INK }}>{t("compare.apps")}</Text>
                <Row style={{ gap: g.u(4), alignItems: "baseline", marginTop: g.u(3) }}>
                  <Text style={{ fontSize: g.u(15), fontWeight: 700, color: RED }}>{t("compare.upToWord")}</Text>
                  <Text style={{ fontSize: g.u(26), fontWeight: 800, color: RED }}>30%</Text>
                </Row>
                <Text style={{ fontSize: g.u(12), color: MUTED }}>{t("commission")}</Text>
              </Col>

              <Box
                style={{
                  width: g.u(30), height: g.u(30), borderRadius: g.u(15), backgroundColor: NAVY_DEEP,
                  color: "#ffffff", alignItems: "center", justifyContent: "center",
                  fontSize: g.u(12), fontWeight: 800, flexShrink: 0,
                }}
              >
                {t("compare.vs")}
              </Box>

              <Col
                style={{
                  flexGrow: 1, flexBasis: 0, backgroundColor: "#F1FBF3", borderRadius: g.u(10),
                  border: `${Math.max(1, g.u(2))}px solid #BFE7CA`,
                  paddingTop: g.u(10), paddingBottom: g.u(10), paddingLeft: g.u(10), paddingRight: g.u(10),
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: g.u(13), fontWeight: 700, color: GREEN_DARK }}>{t("compare.direct")}</Text>
                <Text style={{ fontSize: g.u(26), fontWeight: 800, color: GREEN, marginTop: g.u(3) }}>0%</Text>
                <Text style={{ fontSize: g.u(12), color: GREEN_DARK }}>{t("commission")}</Text>
              </Col>
            </Row>
          </Col>

          <Col style={{ gap: g.u(10), alignItems: "flex-end" }}>
            <PhoneMock ctx={ctx} />
            <Row
              style={{
                width: g.u(360), gap: g.u(10), alignItems: "center",
                border: `${Math.max(1, g.u(3))}px solid ${NAVY}`, borderRadius: g.u(12),
                paddingTop: g.u(10), paddingBottom: g.u(10), paddingLeft: g.u(12), paddingRight: g.u(12),
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={flagDataUri()} alt="" width={g.u(38)} height={g.u(38)} style={{ width: g.u(38), height: g.u(38) }} />
              <Col>
                <Text style={{ fontSize: g.u(16), fontWeight: 800, color: NAVY }}>{t("support.title")}</Text>
                <Text style={{ fontSize: g.u(13), color: MUTED }}>{t("support.body")}</Text>
              </Col>
            </Row>
          </Col>
        </Row>

        {/* ── Badge strip ──────────────────────────────────────── */}
        <Row style={{ marginTop: g.u(26), gap: g.u(7), alignItems: "stretch" }}>
          <Badge ctx={ctx} title={t("badges.profit")} sub={t("badges.profitSub")} solid={false} />
          <Badge ctx={ctx} title={t("badges.customers")} sub={t("badges.customersSub")} solid={false} />
          <Badge ctx={ctx} title={t("badges.brand")} sub={t("badges.brandSub")} solid={false} />
          <Badge ctx={ctx} title={t("badges.control")} solid={false} />
          <Badge ctx={ctx} title={t("badges.zero")} sub={t("badges.zeroSub")} solid />
          <Badge ctx={ctx} title={t("badges.noContract")} sub={t("badges.noContractSub")} solid />
          <Badge ctx={ctx} title={t("badges.noCard")} sub={t("badges.noCardSub")} solid />
          <Badge ctx={ctx} title={t("badges.cancel")} sub={t("badges.cancelSub")} solid />
        </Row>

        {/* ── Three panels ─────────────────────────────────────── */}
        {/* flexGrow makes the three panels absorb the leftover page height instead of
            leaving a dead band above the CTA — the reference artwork has no such gap. */}
        <Row style={{ marginTop: g.u(26), gap: g.u(10), alignItems: "stretch" }}>
          {/* Why */}
          <Col style={{ flexGrow: 1, flexBasis: 0 }}>
            <Col style={{ border: `${Math.max(1, g.u(2))}px solid ${GREEN}`, borderRadius: g.u(10) }}>
              <PanelHeader ctx={ctx} text={t("why.title")} color={GREEN} />
              <Col style={{ padding: g.u(17) }}>
                {["1", "2", "3", "4", "5"].map((n) => (
                  <BulletRow key={n} ctx={ctx} text={t(`why.${n}`)} />
                ))}
              </Col>
            </Col>
            <Row
              style={{
                marginTop: g.u(14), gap: g.u(9), alignItems: "center",
                border: `${Math.max(1, g.u(2))}px solid ${GREEN}`, borderRadius: g.u(10),
                paddingTop: g.u(11), paddingBottom: g.u(11), paddingLeft: g.u(12), paddingRight: g.u(12),
              }}
            >
              <Box
                style={{
                  width: g.u(30), height: g.u(30), borderRadius: g.u(8), backgroundColor: "#A4C639",
                  flexShrink: 0,
                }}
              />
              <Text style={{ fontSize: g.u(14), fontWeight: 700, color: INK, lineHeight: 1.25, maxWidth: g.u(230) }}>
                {t("android")}
              </Text>
            </Row>
          </Col>

          {/* What's included */}
          <Col style={{ flexGrow: 1, flexBasis: 0, border: `${Math.max(1, g.u(2))}px solid ${BLUE}`, borderRadius: g.u(10) }}>
            <PanelHeader ctx={ctx} text={t("included.title")} color={BLUE} />
            <Col style={{ padding: g.u(17) }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((n) => (
                <IncludedRow key={n} ctx={ctx} text={t(`included.${n}`)} />
              ))}
            </Col>
          </Col>

          {/* Cost */}
          <Col style={{ flexGrow: 1, flexBasis: 0, border: `${Math.max(1, g.u(2))}px solid ${GREEN}`, borderRadius: g.u(10) }}>
            <PanelHeader ctx={ctx} text={t("cost.title")} color={GREEN} />
            <Col style={{ padding: g.u(17) }}>
              <Row style={{ alignItems: "baseline", gap: g.u(7) }}>
                <Text style={{ fontSize: g.u(15), fontWeight: 700, color: INK }}>{t("cost.core")}</Text>
                <Spacer />
                <Text style={{ fontSize: g.u(42), fontWeight: 800, color: GREEN, lineHeight: 1 }}>$0</Text>
              </Row>
              <Text style={{ fontSize: g.u(13.5), color: MUTED, marginTop: g.u(8), lineHeight: 1.32 }}>
                {t("cost.note")}
              </Text>
              <Col style={{ marginTop: g.u(14), gap: g.u(10) }}>
                {PRICE_ROWS.map((row) => (
                  <Row key={row.label} style={{ gap: g.u(6), alignItems: "baseline" }}>
                    <Text style={{ fontSize: g.u(14), color: INK }}>{row.label}</Text>
                    <Spacer />
                    <Text style={{ fontSize: g.u(14), fontWeight: 800, color: INK }}>{row.price}</Text>
                  </Row>
                ))}
              </Col>
              <Text style={{ fontSize: g.u(13.5), color: MUTED, marginTop: g.u(12), lineHeight: 1.32 }}>
                {t("cost.addons")}
              </Text>
              <Spacer />
              <Text style={{ fontSize: g.u(13.5), fontWeight: 700, color: GREEN_DARK, marginTop: g.u(10), lineHeight: 1.32 }}>
                {t("cost.noUpfront")}
              </Text>
            </Col>
          </Col>
        </Row>

        <Spacer />

        {/* ── Green CTA band — the ONLY part that changes per partner ── */}
        <Col
          style={{
            marginTop: g.u(12), backgroundColor: GREEN_DARK, borderRadius: g.u(12),
            paddingTop: g.u(14), paddingBottom: g.u(14), paddingLeft: g.u(18), paddingRight: g.u(18),
          }}
        >
          <Row style={{ gap: g.u(16), alignItems: "center" }}>
            <Col style={{ flexGrow: 1 }}>
              <Text style={{ fontSize: g.u(34), fontWeight: 800, color: "#ffffff", lineHeight: 1.05 }}>
                {t("cta.title")}
              </Text>
              <Col style={{ marginTop: g.u(8), gap: g.u(4) }}>
                <Text style={{ fontSize: g.u(17), color: "#ffffff" }}>{ctx.qrCaption}</Text>
                {ctx.contact.email ? (
                  <Text style={{ fontSize: g.u(17), color: "#ffffff" }}>{ctx.contact.email}</Text>
                ) : null}
                {ctx.contact.phone ? (
                  <Text style={{ fontSize: g.u(17), color: "#ffffff" }}>{ctx.contact.phone}</Text>
                ) : null}
                {ctx.contact.name ? (
                  <Text style={{ fontSize: g.u(15), color: "#DCF3E2" }}>{ctx.contact.name}</Text>
                ) : null}
              </Col>
            </Col>

            <Col style={{ alignItems: "center", gap: g.u(6) }}>
              <Text style={{ fontSize: g.u(14), fontWeight: 700, color: "#ffffff" }}>{t("cta.scan")}</Text>
              <Box style={{ backgroundColor: "#ffffff", borderRadius: g.u(8), padding: g.u(7) }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ctx.qrDataUri}
                  alt=""
                  width={g.u(108)}
                  height={g.u(108)}
                  style={{ width: g.u(108), height: g.u(108) }}
                />
              </Box>
            </Col>
          </Row>
        </Col>

        {/* ── Navy footer strip ────────────────────────────────── */}
        <Row
          style={{
            marginTop: g.u(8), marginBottom: g.u(14), backgroundColor: NAVY,
            borderRadius: g.u(8), paddingTop: g.u(9), paddingBottom: g.u(9),
            justifyContent: "center", gap: g.u(7), alignItems: "center",
          }}
        >
          <StarIcon size={g.u(17)} />
          <Text style={{ fontSize: g.u(17), fontWeight: 800, color: "#ffffff" }}>{t("footer")}</Text>
        </Row>
      </Col>
    </Canvas>
  );
}

export const flagshipOnepager: KitTemplate = {
  id: "flagship-onepager",
  audience: "recruit-restaurant",
  // Letter first: the reference artwork is 1104x1426, i.e. a US-Letter aspect (1:1.29),
  // not A4 (1:1.414).
  sizes: ["letter-portrait", "a4-portrait"],
  copyKey: "flagshipOnepager",
  fields: ["headline", "contactName", "contactPhone", "contactEmail"],
  hasThirdPartyMarks: true,
  showsPlatformPricing: false,
  // Platform-branded by design — see the header note. Offered to every tier because Luigi
  // asked for this exact artwork to be available, with only the QR personalised.
  brandTiers: ["platform", "debranded", "branded"],
  render,
};
