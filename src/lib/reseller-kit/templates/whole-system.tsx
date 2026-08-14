/**
 * "The whole system, one page" — an original recruit-a-restaurant flyer built from what the
 * product ACTUALLY does today (Luigi 2026-08-14: "make 1 more of your own design based on
 * updated information reflecting our system and offerings").
 *
 * DESIGN INTENT — why this is different from the replica flyer next to it:
 *   - Every claim is one I could point at code for. The free plan says "100 orders a month"
 *     because FREE_PLAN_MONTHLY_CAP is 100 and reservations count toward the same pool; it
 *     does not say "free forever".
 *   - It leads with the things competitors genuinely do NOT have — an AI that answers the
 *     restaurant's phone and takes orders, their own app on both stores, 38 languages,
 *     store-credit loyalty — rather than re-arguing commission, which every rival also claims.
 *   - Add-ons are named but NOT priced. Prices live per-environment in the AddOn table, carry
 *     no currency, and a white-label partner may resell at their own rate; printing ours on a
 *     partner's flyer would be wrong in at least one of those three ways.
 *   - Fully brand-agnostic: no string here names the platform, so a de-branded or Branded
 *     partner hands out collateral that is entirely theirs.
 */
import { FREE_PLAN_MONTHLY_CAP } from "@/lib/order-cap-constants";
import type { KitRenderContext, KitTemplate } from "../types";
import { Box, Canvas, Col, Row, Text, Spacer, BrandMark, CheckIcon } from "../primitives";

const PANEL = "#F6F8FB";
const LINE = "#E2E8F0";

function Tick({ ctx, color }: { ctx: KitRenderContext; color: string }) {
  return (
    <Box style={{ marginTop: ctx.geom.u(3) }}>
      <CheckIcon size={ctx.geom.u(16)} color={color} />
    </Box>
  );
}

function Pillar({
  ctx, title, items,
}: {
  ctx: KitRenderContext; title: string; items: string[];
}) {
  const g = ctx.geom;
  const c = ctx.brand.colors;
  return (
    <Col
      style={{
        flexGrow: 1, flexBasis: 0, backgroundColor: PANEL, borderRadius: g.u(14),
        border: `${Math.max(1, g.u(2))}px solid ${LINE}`, padding: g.u(18),
      }}
    >
      <Text style={{ fontSize: g.u(22), fontWeight: 800, color: c.ink, lineHeight: 1.15 }}>
        {title}
      </Text>
      <Box style={{ height: g.u(4), width: g.u(52), backgroundColor: c.primary, borderRadius: g.u(2), marginTop: g.u(8) }} />
      <Col style={{ marginTop: g.u(12), gap: g.u(8) }}>
        {items.map((item) => (
          <Row key={item} style={{ gap: g.u(9), alignItems: "flex-start" }}>
            <Tick ctx={ctx} color={c.primary} />
            <Text style={{ fontSize: g.u(15), color: c.ink, lineHeight: 1.32, maxWidth: g.u(250) }}>
              {item}
            </Text>
          </Row>
        ))}
      </Col>
    </Col>
  );
}

function render(ctx: KitRenderContext) {
  const { geom: g, brand, contact, t, rtl } = ctx;
  const c = brand.colors;

  const addOns = ["1", "2", "3", "4", "5", "6"].map((n) => t(`addons.${n}`));

  return (
    <Canvas geom={g} paper={c.paper} ink={c.ink} rtl={rtl}>
      <Col style={{ width: "100%", height: "100%", padding: g.u(40) }}>
        {/* ── Hero band ────────────────────────────────────────── */}
        <Col
          style={{
            backgroundColor: c.primary, borderRadius: g.u(18),
            padding: g.u(28),
          }}
        >
          <Row style={{ gap: g.u(14), alignItems: "center" }}>
            <BrandMark
              logoDataUri={ctx.logoDataUri}
              brandName={brand.brandName}
              size={g.u(56)}
              primary="#ffffff"
              onPrimary={c.primary}
            />
            <Text style={{ fontSize: g.u(26), fontWeight: 800, color: c.onPrimary }}>
              {brand.brandName}
            </Text>
            <Spacer />
            <Box
              style={{
                backgroundColor: c.onPrimary === "#ffffff" ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.08)",
                borderRadius: g.u(999), paddingTop: g.u(7), paddingBottom: g.u(7),
                paddingLeft: g.u(16), paddingRight: g.u(16),
              }}
            >
              <Text style={{ fontSize: g.u(16), fontWeight: 800, color: c.onPrimary }}>
                {t("badge")}
              </Text>
            </Box>
          </Row>

          <Text
            style={{
              fontSize: g.u(58), fontWeight: 800, color: c.onPrimary,
              lineHeight: 1.03, marginTop: g.u(20),
            }}
          >
            {ctx.overrides.headline?.trim() || t("headline")}
          </Text>
          <Text
            style={{
              fontSize: g.u(19), color: c.onPrimary, lineHeight: 1.4,
              marginTop: g.u(12), maxWidth: g.u(760), opacity: 0.92,
            }}
          >
            {t("subhead", { cap: String(FREE_PLAN_MONTHLY_CAP) })}
          </Text>
        </Col>

        {/* ── Three pillars ────────────────────────────────────── */}
        <Row style={{ marginTop: g.u(18), gap: g.u(14), alignItems: "stretch" }}>
          <Pillar
            ctx={ctx}
            title={t("pillars.take.title")}
            items={["1", "2", "3", "4"].map((n) => t(`pillars.take.${n}`))}
          />
          <Pillar
            ctx={ctx}
            title={t("pillars.keep.title")}
            items={["1", "2", "3", "4"].map((n) => t(`pillars.keep.${n}`))}
          />
          <Pillar
            ctx={ctx}
            title={t("pillars.grow.title")}
            items={["1", "2", "3", "4"].map((n) => t(`pillars.grow.${n}`))}
          />
        </Row>

        {/* ── Differentiator strip ─────────────────────────────── */}
        <Col
          style={{
            marginTop: g.u(18), borderRadius: g.u(14),
            border: `${Math.max(1, g.u(3))}px solid ${c.primary}`, padding: g.u(18),
          }}
        >
          <Text style={{ fontSize: g.u(20), fontWeight: 800, color: c.ink }}>
            {t("standout.title")}
          </Text>
          <Row style={{ marginTop: g.u(12), gap: g.u(12), alignItems: "stretch" }}>
            {["1", "2", "3"].map((n) => (
              <Col key={n} style={{ flexGrow: 1, flexBasis: 0 }}>
                <Text style={{ fontSize: g.u(17), fontWeight: 800, color: c.primary, lineHeight: 1.2 }}>
                  {t(`standout.${n}.title`)}
                </Text>
                <Text style={{ fontSize: g.u(14), color: c.muted, marginTop: g.u(4), lineHeight: 1.3 }}>
                  {t(`standout.${n}.body`)}
                </Text>
              </Col>
            ))}
          </Row>
        </Col>

        {/* ── Add when you need it ─────────────────────────────── */}
        <Col style={{ marginTop: g.u(18) }}>
          <Text style={{ fontSize: g.u(17), fontWeight: 800, color: c.ink }}>
            {t("addons.title")}
          </Text>
          <Row style={{ marginTop: g.u(10), gap: g.u(8), flexWrap: "wrap" }}>
            {addOns.map((name) => (
              <Box
                key={name}
                style={{
                  backgroundColor: PANEL, border: `${Math.max(1, g.u(2))}px solid ${LINE}`,
                  borderRadius: g.u(20), paddingTop: g.u(7), paddingBottom: g.u(7),
                  paddingLeft: g.u(15), paddingRight: g.u(15),
                  fontSize: g.u(14), fontWeight: 700, color: c.ink,
                }}
              >
                {name}
              </Box>
            ))}
          </Row>
        </Col>

        <Spacer />

        {/* ── CTA ──────────────────────────────────────────────── */}
        <Row
          style={{
            marginTop: g.u(18), backgroundColor: c.ink, borderRadius: g.u(16),
            padding: g.u(22), gap: g.u(20), alignItems: "center",
          }}
        >
          <Col style={{ flexGrow: 1 }}>
            <Text style={{ fontSize: g.u(28), fontWeight: 800, color: "#ffffff", lineHeight: 1.1 }}>
              {t("cta.title")}
            </Text>
            <Text style={{ fontSize: g.u(16), color: "#CBD5E1", marginTop: g.u(8), lineHeight: 1.35, maxWidth: g.u(520) }}>
              {t("cta.body")}
            </Text>
            <Col style={{ marginTop: g.u(14), gap: g.u(3) }}>
              {contact.name ? (
                <Text style={{ fontSize: g.u(17), fontWeight: 700, color: "#ffffff" }}>{contact.name}</Text>
              ) : null}
              {contact.phone ? (
                <Text style={{ fontSize: g.u(16), color: "#CBD5E1" }}>{contact.phone}</Text>
              ) : null}
              {contact.email ? (
                <Text style={{ fontSize: g.u(16), color: "#CBD5E1" }}>{contact.email}</Text>
              ) : null}
            </Col>
          </Col>

          <Col style={{ alignItems: "center", gap: g.u(7) }}>
            <Box style={{ backgroundColor: "#ffffff", borderRadius: g.u(10), padding: g.u(9) }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ctx.qrDataUri}
                alt=""
                width={g.u(150)}
                height={g.u(150)}
                style={{ width: g.u(150), height: g.u(150) }}
              />
            </Box>
            <Text style={{ fontSize: g.u(14), fontWeight: 700, color: "#ffffff" }}>{t("scanLabel")}</Text>
            <Text style={{ fontSize: g.u(13), color: "#94A3B8" }}>{ctx.qrCaption}</Text>
          </Col>
        </Row>
      </Col>
    </Canvas>
  );
}

export const wholeSystem: KitTemplate = {
  id: "whole-system",
  audience: "recruit-restaurant",
  sizes: ["a4-portrait", "letter-portrait"],
  copyKey: "wholeSystem",
  fields: ["headline", "contactName", "contactPhone", "contactEmail", "accentColor"],
  hasThirdPartyMarks: false,
  showsPlatformPricing: false,
  brandTiers: ["platform", "debranded", "branded"],
  render,
};
