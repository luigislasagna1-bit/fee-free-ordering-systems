/**
 * Send the VIP group welcome to SPECIFIC members, by email address.
 *
 * DRY RUN BY DEFAULT — prints exactly who would receive it and the perks the
 * email will state. Pass --send to actually deliver. Sending is irreversible
 * and goes to real customers, so the confirmation step is deliberate.
 *
 *   npx tsx --env-file=.env.local scripts/_send-vip-welcome.ts a@x.com b@y.com
 *   npx tsx --env-file=.env.local scripts/_send-vip-welcome.ts a@x.com --send
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { notifyGroupWelcome } from "../src/lib/vip-notify";

const args = process.argv.slice(2);
const DO_SEND = args.includes("--send");
const targets = args.filter((a) => a.includes("@")).map((a) => a.toLowerCase());

const env = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const l of env.split(/\r?\n/)) {
  const m = l.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}
const prodUrl = urls.find((u) => /dawn-tree/.test(u)) ?? urls[0];

async function main() {
  if (!targets.length) { console.log("no target emails given"); return; }
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(prodUrl);
  const adapter = isNeon ? new PrismaNeon({ connectionString: prodUrl }) : new PrismaPg({ connectionString: prodUrl });
  const p = new PrismaClient({ adapter } as any);

  const r = await p.restaurant.findFirst({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true, name: true } });
  if (!r) throw new Error("restaurant not found");
  const g = await p.customerGroup.findFirst({
    where: { restaurantId: r.id, name: { contains: "VIP Pizza Club" } },
    select: { id: true, name: true },
  });
  if (!g) throw new Error("group not found");

  const members = await p.customerGroupMember.findMany({
    where: { groupId: g.id },
    select: { id: true, email: true, customer: { select: { email: true, passwordHash: true } } },
  });
  const matched = members.filter((m) => {
    const e = (m.email ?? m.customer?.email ?? "").toLowerCase();
    return e && targets.includes(e);
  });

  console.log(`restaurant : ${r.name}`);
  console.log(`group      : ${g.name}`);
  console.log(`requested  : ${targets.join(", ")}`);
  console.log(`matched    : ${matched.length} member row(s)`);
  for (const m of matched) {
    const e = (m.email ?? m.customer?.email ?? "").toLowerCase();
    console.log(`   ${m.customer?.passwordHash ? "account" : "guest  "}  ${e}`);
  }
  const missing = targets.filter((t) => !matched.some((m) => (m.email ?? m.customer?.email ?? "").toLowerCase() === t));
  if (missing.length) console.log(`NOT IN GROUP (skipped): ${missing.join(", ")}`);

  if (!DO_SEND) {
    console.log(`\nDRY RUN — nothing sent. Re-run with --send to deliver.`);
    await p.$disconnect();
    return;
  }
  const sent = await notifyGroupWelcome({ groupId: g.id, restaurantId: r.id, memberIds: matched.map((m) => m.id) });
  console.log(`\nSENT: ${sent} email(s)`);
  await p.$disconnect();
}
main();
