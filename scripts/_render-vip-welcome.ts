/** Render-check the VIP group welcome email using Luigi's REAL group data —
 *  no sending. Proves the perk list matches what the group actually grants.
 *  npx tsx --env-file=.env.local scripts/_render-vip-welcome.ts */
import { renderEmail } from "../src/emails/render";
import CouponAssigned from "../src/emails/templates/CouponAssigned";
import { getDict } from "../src/lib/i18n-dict";
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const env = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const l of env.split(/\r?\n/)) {
  const m = l.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}
const prodUrl = urls.find((u) => /dawn-tree/.test(u)) ?? urls[0];

async function main() {
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(prodUrl);
  const adapter = isNeon ? new PrismaNeon({ connectionString: prodUrl }) : new PrismaPg({ connectionString: prodUrl });
  const p = new PrismaClient({ adapter } as any);

  const r = await p.restaurant.findFirst({
    where: { slug: "luigis-lasagna-pizzeria" },
    select: { id: true, name: true, vipMemberLabel: true, rewardsEnabled: true, rewardEarnEnabled: true, rewardLabelPlural: true, defaultLanguage: true },
  });
  if (!r) throw new Error("store not found");
  const g = await p.customerGroup.findFirst({
    where: { restaurantId: r.id, name: { contains: "VIP Pizza Club" } },
    select: {
      id: true, name: true, memberLabel: true, rewardEarnPercent: true,
      groupPromotions: { select: { promotion: { select: { name: true, isActive: true, ruleConfig: true } } } },
      members: { select: { id: true, email: true, name: true, customer: { select: { email: true, name: true, passwordHash: true } } } },
    },
  });
  if (!g) throw new Error("group not found");

  const t = await getDict(r.defaultLanguage ?? "en");
  const perkLines: string[] = [];
  if (r.rewardsEnabled && r.rewardEarnEnabled && (g.rewardEarnPercent ?? 0) > 0) {
    perkLines.push(t("email.vipGroupWelcome.perkEarnRate", {
      percent: g.rewardEarnPercent as number,
      label: r.rewardLabelPlural?.trim() || t("email.vipGroupWelcome.defaultRewardLabel"),
    }));
  }
  for (const link of g.groupPromotions) {
    const pr = link.promotion;
    if (!pr?.isActive) continue;
    const rc = (pr.ruleConfig ?? {}) as any;
    const pct = typeof rc.discountPercent === "number" ? rc.discountPercent : null;
    perkLines.push(pct != null
      ? t("email.vipGroupWelcome.perkPercent", { percent: pct, name: pr.name })
      : t("email.vipGroupWelcome.perkNamed", { name: pr.name }));
  }

  const memberLabel = g.memberLabel?.trim() || r.vipMemberLabel;
  console.log(`group      : ${g.name}`);
  console.log(`memberLabel: ${memberLabel}`);
  console.log(`members    : ${g.members.length}`);
  console.log(`PERKS the email will state:`);
  for (const l of perkLines) console.log(`   • ${l}`);
  console.log(`\nsubject: ${t("email.vipGroupWelcome.subject", { groupName: g.name, restaurantName: r.name })}`);
  console.log(`intro  : ${t("email.vipGroupWelcome.intro", { groupName: g.name, restaurantName: r.name })}`);

  for (const hasAccount of [true, false]) {
    const html = await renderEmail(CouponAssigned({
      t, customerName: "Test", restaurantName: r.name, code: "",
      discountLabel: memberLabel, termLines: perkLines,
      orderUrl: "https://www.luigislasagna.com/order/luigis-lasagna-pizzeria",
      memberSpecial: true,
      introOverride: t("email.vipGroupWelcome.intro", { groupName: g.name, restaurantName: r.name }),
      usageNote: hasAccount ? t("email.vipGroupWelcome.usageAccount") : t("email.vipGroupWelcome.usageGuest", { email: "guest@example.com" }),
      accountTip: hasAccount ? undefined : t("email.vipGroupWelcome.accountTip"),
    } as any));
    const ok = perkLines.every((l) => html.includes(l));
    console.log(`\n${hasAccount ? "ACCOUNT" : "GUEST  "} variant: ${html.length} bytes · all perks present: ${ok ? "YES" : "NO"} · account nudge: ${html.includes("Create an account") ? "yes" : "no"}`);
  }

  console.log(`\nrecipients that WOULD receive it (whole group):`);
  const seen = new Set<string>();
  for (const m of g.members) {
    const email = (m.email ?? m.customer?.email ?? "").toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    console.log(`   ${m.customer?.passwordHash ? "account" : "guest  "}  ${email}`);
  }
  await p.$disconnect();
}
main();
