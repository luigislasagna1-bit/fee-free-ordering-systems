/**
 * "Own Your Orders. Keep Your Margin." — the flagship recruit-a-restaurant flyer.
 *
 * BRAND-AGNOSTIC BY CONSTRUCTION. Because a de-branded partner's collateral must carry zero
 * platform marks, no string here names the product: every reference goes through
 * {brandName}, which resolves to the partner's own company on the de-branded and branded
 * tiers. The headline itself is deliberately brand-free, so it ships identically on all three.
 *
 * CLAIMS ARE SOURCED, NOT TYPED:
 *   - the free-plan line reads FREE_PLAN_MONTHLY_CAP, so it can never drift from the cap the
 *     product actually enforces. The reference flyer said "free forever", which is not what
 *     the code does — the free plan stops at 100 orders a month, reservations included.
 *   - the "up to 30%" figure is the THIRD-PARTY apps' take rate (not our reseller commission,
 *     which tops out at 15%), and lives in one dated constants file so it can be checked.
 *   - prices are NOT printed by default. See catalog.ts.
 */
import { FREE_PLAN_MONTHLY_CAP } from "@/lib/order-cap-constants";
import { THIRD_PARTY_MAX_COMMISSION_PCT } from "../comparisons";
import { geomFor } from "../sizes";
import { KIT_SIZES } from "../sizes";
import type { KitRenderContext, KitTemplate } from "../types";
import { Box, Canvas, Chip, Col, Row, Text, Spacer, BrandMark, QrBlock } from "../primitives";

function render(ctx: KitRenderContext) {
  const { geom: g, brand, contact, t, rtl } = ctx;
  const c = brand.colors;
  const headline = ctx.overrides.headline?.trim();

  const chips = [
    t("chips.keepEverything"),
    t("chips.ownCustomers"),
    t("chips.noContract"),
    t("chips.cancelAnytime"),
  ];

  return (
    <Canvas geom={g} paper={c.paper} ink={c.ink} rtl={rtl}>
      <Col style={{ width: "100%", height: "100%", padding: g.u(56) }}>
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <Row style={{ gap: g.u(18) }}>
          <BrandMark
            logoDataUri={ctx.logoDataUri}
            brandName={brand.brandName}
            size={g.u(84)}
            primary={c.primary}
            onPrimary={c.onPrimary}
          />
          <Col>
            <Text style={{ fontSize: g.u(38), fontWeight: 800, color: c.ink, lineHeight: 1.1 }}>
              {brand.brandName}
            </Text>
            <Text style={{ fontSize: g.u(19), color: c.muted, marginTop: g.u(4) }}>
              {t("tagline")}
            </Text>
          </Col>
        </Row>

        {/* ── Headline ─────────────────────────────────────────────── */}
        <Col style={{ marginTop: g.u(38) }}>
          <Text style={{ fontSize: g.u(74), fontWeight: 800, lineHeight: 1.02, color: c.ink }}>
            {headline || t("headline1")}
          </Text>
          {!headline && (
            <Text style={{ fontSize: g.u(74), fontWeight: 800, lineHeight: 1.02, color: c.primary }}>
              {t("headline2")}
            </Text>
          )}
        </Col>

        <Text
          style={{
            marginTop: g.u(20),
            fontSize: g.u(23),
            lineHeight: 1.35,
            color: c.muted,
            maxWidth: g.u(760),
          }}
        >
          {ctx.overrides.subhead?.trim() || t("subhead")}
        </Text>

        {/* ── The number that sells it ─────────────────────────────── */}
        <Row style={{ marginTop: g.u(28), gap: g.u(18), alignItems: "stretch" }}>
          <Col
            style={{
              flexGrow: 1,
              backgroundColor: "#fef2f2",
              borderRadius: g.u(16),
              padding: g.u(20),
              border: `${Math.max(1, g.u(3))}px solid #fecaca`,
            }}
          >
            <Text style={{ fontSize: g.u(20), fontWeight: 700, color: "#b91c1c" }}>
              {t("compare.thirdPartyLabel")}
            </Text>
            <Text style={{ fontSize: g.u(54), fontWeight: 800, color: "#dc2626", lineHeight: 1.1 }}>
              {t("compare.upTo", { pct: String(THIRD_PARTY_MAX_COMMISSION_PCT) })}
            </Text>
            <Text style={{ fontSize: g.u(19), color: "#b91c1c" }}>{t("compare.commission")}</Text>
          </Col>
          <Col
            style={{
              flexGrow: 1,
              backgroundColor: "#f0fdf4",
              borderRadius: g.u(16),
              padding: g.u(20),
              border: `${Math.max(1, g.u(3))}px solid #bbf7d0`,
            }}
          >
            <Text style={{ fontSize: g.u(20), fontWeight: 700, color: "#15803d" }}>
              {t("compare.directLabel")}
            </Text>
            <Text style={{ fontSize: g.u(54), fontWeight: 800, color: "#16a34a", lineHeight: 1.1 }}>
              {t("compare.zero")}
            </Text>
            <Text style={{ fontSize: g.u(19), color: "#15803d" }}>{t("compare.commission")}</Text>
          </Col>
        </Row>

        {/* ── Feature chips ────────────────────────────────────────── */}
        <Row style={{ marginTop: g.u(20), gap: g.u(9), flexWrap: "wrap" }}>
          {chips.map((label) => (
            <Chip key={label} geom={g} text={label} bg="#f1f5f9" fg={c.ink} />
          ))}
        </Row>

        {/* ── What's included ──────────────────────────────────────── */}
        <Col style={{ marginTop: g.u(24) }}>
          <Text style={{ fontSize: g.u(24), fontWeight: 800, color: c.ink }}>
            {t("included.title")}
          </Text>
          <Col style={{ marginTop: g.u(10), gap: g.u(6) }}>
            {["1", "2", "3", "4", "5", "6"].map((n) => (
              <Row key={n} style={{ gap: g.u(12), alignItems: "flex-start" }}>
                <Box
                  style={{
                    width: g.u(11),
                    height: g.u(11),
                    borderRadius: g.u(6),
                    backgroundColor: c.primary,
                    marginTop: g.u(8),
                  }}
                />
                <Text style={{ fontSize: g.u(18), color: c.ink, lineHeight: 1.3, maxWidth: g.u(830) }}>
                  {t(`included.${n}`)}
                </Text>
              </Row>
            ))}
          </Col>
        </Col>

        {/* Pricing rows only appear when the partner opted in AND the gate passed. */}
        {ctx.priceRows.length > 0 && (
          <Col style={{ marginTop: g.u(26), gap: g.u(6) }}>
            {ctx.priceRows.map((row) => (
              <Row key={row.label} style={{ gap: g.u(10) }}>
                <Text style={{ fontSize: g.u(19), color: c.muted }}>{row.label}</Text>
                <Spacer />
                <Text style={{ fontSize: g.u(19), fontWeight: 700, color: c.ink }}>{row.price}</Text>
              </Row>
            ))}
          </Col>
        )}

        <Spacer />

        {/* ── Call to action ───────────────────────────────────────── */}
        <Row style={{ gap: g.u(28), alignItems: "flex-end" }}>
          <Col style={{ flexGrow: 1 }}>
            <Text style={{ fontSize: g.u(34), fontWeight: 800, color: c.ink, lineHeight: 1.15 }}>
              {t("cta.title")}
            </Text>
            <Text
              style={{
                fontSize: g.u(21),
                color: c.muted,
                marginTop: g.u(8),
                lineHeight: 1.35,
                maxWidth: g.u(520),
              }}
            >
              {t("freePlan", { cap: String(FREE_PLAN_MONTHLY_CAP) })}
            </Text>

            {(contact.name || contact.phone || contact.email) && (
              <Col style={{ marginTop: g.u(22), gap: g.u(3) }}>
                {contact.name && (
                  <Text style={{ fontSize: g.u(21), fontWeight: 700, color: c.ink }}>
                    {contact.name}
                  </Text>
                )}
                {contact.phone && (
                  <Text style={{ fontSize: g.u(19), color: c.muted }}>{contact.phone}</Text>
                )}
                {contact.email && (
                  <Text style={{ fontSize: g.u(19), color: c.muted }}>{contact.email}</Text>
                )}
              </Col>
            )}
          </Col>

          <QrBlock
            geom={g}
            qrDataUri={ctx.qrDataUri}
            caption={ctx.qrCaption}
            label={t("scanLabel")}
            size={g.u(210)}
            ink={c.ink}
            muted={c.muted}
          />
        </Row>

        {/* Bottom rule in the brand colour — cheap, and it makes a de-branded flyer feel owned. */}
        <Box
          style={{
            marginTop: g.u(28),
            height: g.u(8),
            width: "100%",
            backgroundColor: c.primary,
            borderRadius: g.u(6),
          }}
        />
      </Col>
    </Canvas>
  );
}

export const ownYourOrders: KitTemplate = {
  id: "own-your-orders",
  audience: "recruit-restaurant",
  sizes: ["a4-portrait", "letter-portrait"],
  copyKey: "ownYourOrders",
  fields: [
    "headline", "subhead",
    "contactName", "contactPhone", "contactEmail",
    "accentColor", "showPricing",
  ],
  hasThirdPartyMarks: false,
  showsPlatformPricing: true,
  brandTiers: ["platform", "debranded", "branded"],
  render,
};

/** Convenience for tests/spikes that want the default geometry. */
export const ownYourOrdersGeom = () => geomFor(KIT_SIZES["a4-portrait"]);
