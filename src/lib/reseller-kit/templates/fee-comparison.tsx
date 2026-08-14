/**
 * The benefit-grid flyer (reference design 2): nine feature tiles over a "start free" band.
 *
 * The reference laid these out as a CSS grid. Satori has no grid — `display: grid` warns and
 * silently falls back to flex — so the tiles are built as explicit flex rows of three. This
 * is the single most laborious part of porting any of these designs, and the reason the
 * template contract bans grid at the type level rather than trusting a reviewer to spot it.
 */
import { FREE_PLAN_MONTHLY_CAP } from "@/lib/order-cap-constants";
import { aggregatorsFor } from "../comparisons";
import type { KitRenderContext, KitTemplate } from "../types";
import { Box, Canvas, Col, Row, Text, Spacer, BrandMark, QrBlock } from "../primitives";

function Tile({
  ctx,
  title,
  body,
}: {
  ctx: KitRenderContext;
  title: string;
  body: string;
}) {
  const { geom: g, brand } = ctx;
  return (
    <Col
      style={{
        flexGrow: 1,
        flexBasis: 0,
        backgroundColor: "#f8fafc",
        borderRadius: g.u(14),
        padding: g.u(20),
        border: `${Math.max(1, g.u(2))}px solid #e2e8f0`,
      }}
    >
      <Text style={{ fontSize: g.u(21), fontWeight: 800, color: brand.colors.ink, lineHeight: 1.2 }}>
        {title}
      </Text>
      <Text
        style={{
          fontSize: g.u(16),
          color: brand.colors.muted,
          marginTop: g.u(6),
          lineHeight: 1.3,
        }}
      >
        {body}
      </Text>
    </Col>
  );
}

function render(ctx: KitRenderContext) {
  const { geom: g, brand, contact, t, rtl } = ctx;
  const c = brand.colors;

  const apps = aggregatorsFor(brand.country).slice(0, 3).join(" · ");

  const tiles: { title: string; body: string }[] = [
    { title: t("tiles.commission.title"), body: t("tiles.commission.body") },
    { title: t("tiles.keep.title"), body: t("tiles.keep.body") },
    { title: t("tiles.free.title"), body: t("tiles.free.body", { cap: String(FREE_PLAN_MONTHLY_CAP) }) },
    { title: t("tiles.widget.title"), body: t("tiles.widget.body") },
    { title: t("tiles.kitchen.title"), body: t("tiles.kitchen.body") },
    { title: t("tiles.database.title"), body: t("tiles.database.body") },
    { title: t("tiles.payments.title"), body: t("tiles.payments.body") },
    { title: t("tiles.printers.title"), body: t("tiles.printers.body") },
    { title: t("tiles.delivery.title"), body: t("tiles.delivery.body") },
  ];

  const rows = [tiles.slice(0, 3), tiles.slice(3, 6), tiles.slice(6, 9)];

  return (
    <Canvas geom={g} paper={c.paper} ink={c.ink} rtl={rtl}>
      <Col style={{ width: "100%", height: "100%", padding: g.u(52) }}>
        <Row style={{ gap: g.u(16) }}>
          <BrandMark
            logoDataUri={ctx.logoDataUri}
            brandName={brand.brandName}
            size={g.u(70)}
            primary={c.primary}
            onPrimary={c.onPrimary}
          />
          <Text style={{ fontSize: g.u(34), fontWeight: 800, color: c.ink }}>
            {brand.brandName}
          </Text>
        </Row>

        <Text
          style={{
            marginTop: g.u(30),
            fontSize: g.u(24),
            color: c.muted,
            lineHeight: 1.35,
            maxWidth: g.u(820),
          }}
        >
          {t("intro", { apps })}
        </Text>

        <Col style={{ marginTop: g.u(18) }}>
          <Text style={{ fontSize: g.u(70), fontWeight: 800, color: c.ink, lineHeight: 1.03 }}>
            {ctx.overrides.headline?.trim() || t("headline1")}
          </Text>
          <Text style={{ fontSize: g.u(70), fontWeight: 800, color: c.primary, lineHeight: 1.03 }}>
            {t("headline2")}
          </Text>
        </Col>

        <Col style={{ marginTop: g.u(34), gap: g.u(14) }}>
          {rows.map((row, i) => (
            <Row key={i} style={{ gap: g.u(14), alignItems: "stretch" }}>
              {row.map((tile) => (
                <Tile key={tile.title} ctx={ctx} title={tile.title} body={tile.body} />
              ))}
            </Row>
          ))}
        </Col>

        <Spacer />

        <Row style={{ gap: g.u(26), alignItems: "flex-end", marginTop: g.u(26) }}>
          <Col style={{ flexGrow: 1 }}>
            <Text style={{ fontSize: g.u(32), fontWeight: 800, color: c.ink }}>
              {t("cta.title")}
            </Text>
            <Text style={{ fontSize: g.u(20), color: c.muted, marginTop: g.u(8), lineHeight: 1.35 }}>
              {t("cta.body")}
            </Text>
            {(contact.name || contact.phone || contact.email) && (
              <Col style={{ marginTop: g.u(18), gap: g.u(3) }}>
                {contact.name && (
                  <Text style={{ fontSize: g.u(20), fontWeight: 700, color: c.ink }}>{contact.name}</Text>
                )}
                {contact.phone && (
                  <Text style={{ fontSize: g.u(18), color: c.muted }}>{contact.phone}</Text>
                )}
                {contact.email && (
                  <Text style={{ fontSize: g.u(18), color: c.muted }}>{contact.email}</Text>
                )}
              </Col>
            )}
          </Col>
          <QrBlock
            geom={g}
            qrDataUri={ctx.qrDataUri}
            caption={ctx.qrCaption}
            label={t("scanLabel")}
            size={g.u(190)}
            ink={c.ink}
            muted={c.muted}
          />
        </Row>

        <Box
          style={{
            marginTop: g.u(24),
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

export const feeComparison: KitTemplate = {
  id: "fee-comparison",
  audience: "recruit-restaurant",
  sizes: ["a4-portrait", "letter-portrait"],
  copyKey: "feeComparison",
  fields: ["headline", "contactName", "contactPhone", "contactEmail", "accentColor"],
  // Names the aggregators in the intro line (wordmarks only, never their logos).
  hasThirdPartyMarks: true,
  showsPlatformPricing: false,
  brandTiers: ["platform", "debranded", "branded"],
  render,
};
