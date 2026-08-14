/**
 * "Combine, Don't Choose" (reference design 3) — the funnel flyer.
 *
 * This is the one that actually closes: it doesn't ask a restaurant to leave the aggregators,
 * it asks them to keep the aggregators for discovery and move REPEAT orders direct. Four
 * numbered steps, then the money line on an example basket.
 */
import { EXAMPLE_ORDER_TOTAL, THIRD_PARTY_MAX_COMMISSION_PCT, aggregatorsFor } from "../comparisons";
import type { KitRenderContext, KitTemplate } from "../types";
import { Box, Canvas, Col, Row, Text, Spacer, BrandMark, QrBlock } from "../primitives";

function Step({
  ctx,
  index,
  title,
  body,
}: {
  ctx: KitRenderContext;
  index: number;
  title: string;
  body: string;
}) {
  const { geom: g, brand } = ctx;
  const c = brand.colors;
  return (
    <Col
      style={{
        flexGrow: 1,
        flexBasis: 0,
        backgroundColor: "#f8fafc",
        borderRadius: g.u(16),
        padding: g.u(20),
        border: `${Math.max(1, g.u(2))}px solid #e2e8f0`,
      }}
    >
      <Box
        style={{
          width: g.u(42),
          height: g.u(42),
          borderRadius: g.u(6),
          backgroundColor: c.primary,
          color: c.onPrimary,
          alignItems: "center",
          justifyContent: "center",
          fontSize: g.u(24),
          fontWeight: 800,
        }}
      >
        {String(index)}
      </Box>
      <Text style={{ fontSize: g.u(22), fontWeight: 800, color: c.ink, marginTop: g.u(12), lineHeight: 1.2 }}>
        {title}
      </Text>
      <Text style={{ fontSize: g.u(16), color: c.muted, marginTop: g.u(6), lineHeight: 1.3 }}>
        {body}
      </Text>
    </Col>
  );
}

function render(ctx: KitRenderContext) {
  const { geom: g, brand, contact, t, rtl } = ctx;
  const c = brand.colors;
  const apps = aggregatorsFor(brand.country).slice(0, 3).join(", ");
  const lost = Math.round((EXAMPLE_ORDER_TOTAL * THIRD_PARTY_MAX_COMMISSION_PCT) / 100);

  const steps = [
    { title: t("steps.1.title"), body: t("steps.1.body", { apps }) },
    { title: t("steps.2.title"), body: t("steps.2.body") },
    { title: t("steps.3.title"), body: t("steps.3.body") },
    { title: t("steps.4.title"), body: t("steps.4.body") },
  ];

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
          <Text style={{ fontSize: g.u(34), fontWeight: 800, color: c.ink }}>{brand.brandName}</Text>
        </Row>

        <Col style={{ marginTop: g.u(34) }}>
          <Text style={{ fontSize: g.u(78), fontWeight: 800, color: c.ink, lineHeight: 1.03 }}>
            {ctx.overrides.headline?.trim() || t("headline")}
          </Text>
          <Text style={{ fontSize: g.u(25), color: c.muted, marginTop: g.u(16), lineHeight: 1.35, maxWidth: g.u(800) }}>
            {t("subhead")}
          </Text>
        </Col>

        <Row style={{ marginTop: g.u(34), gap: g.u(12), alignItems: "stretch" }}>
          {steps.slice(0, 2).map((s, i) => (
            <Step key={s.title} ctx={ctx} index={i + 1} title={s.title} body={s.body} />
          ))}
        </Row>
        <Row style={{ marginTop: g.u(12), gap: g.u(12), alignItems: "stretch" }}>
          {steps.slice(2, 4).map((s, i) => (
            <Step key={s.title} ctx={ctx} index={i + 3} title={s.title} body={s.body} />
          ))}
        </Row>

        {/* ── The money line ───────────────────────────────────────── */}
        <Col
          style={{
            marginTop: g.u(30),
            backgroundColor: "#f0fdf4",
            border: `${Math.max(1, g.u(3))}px solid #bbf7d0`,
            borderRadius: g.u(18),
            padding: g.u(26),
          }}
        >
          <Text style={{ fontSize: g.u(24), fontWeight: 800, color: "#14532d" }}>
            {t("math.title", { total: String(EXAMPLE_ORDER_TOTAL) })}
          </Text>
          <Row style={{ marginTop: g.u(12), gap: g.u(24) }}>
            <Text style={{ fontSize: g.u(20), color: "#b91c1c", fontWeight: 700 }}>
              {t("math.viaApps", { amount: String(lost) })}
            </Text>
            <Text style={{ fontSize: g.u(20), color: "#15803d", fontWeight: 700 }}>
              {t("math.direct")}
            </Text>
          </Row>
        </Col>

        <Spacer />

        <Row style={{ gap: g.u(26), alignItems: "flex-end", marginTop: g.u(24) }}>
          <Col style={{ flexGrow: 1 }}>
            <Text style={{ fontSize: g.u(30), fontWeight: 800, color: c.ink, lineHeight: 1.15 }}>
              {t("cta.title")}
            </Text>
            {(contact.name || contact.phone || contact.email) && (
              <Col style={{ marginTop: g.u(16), gap: g.u(3) }}>
                {contact.name && (
                  <Text style={{ fontSize: g.u(20), fontWeight: 700, color: c.ink }}>{contact.name}</Text>
                )}
                {contact.phone && <Text style={{ fontSize: g.u(18), color: c.muted }}>{contact.phone}</Text>}
                {contact.email && <Text style={{ fontSize: g.u(18), color: c.muted }}>{contact.email}</Text>}
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

export const combineDontChoose: KitTemplate = {
  id: "combine-dont-choose",
  audience: "recruit-restaurant",
  sizes: ["a4-portrait", "letter-portrait"],
  copyKey: "combineDontChoose",
  fields: ["headline", "contactName", "contactPhone", "contactEmail", "accentColor"],
  hasThirdPartyMarks: true,
  showsPlatformPricing: false,
  brandTiers: ["platform", "debranded", "branded"],
  render,
};
