/** Read-only: every email address configured on Luigi's store, so we can tell
 *  whether any of them live on a domain we're about to re-point. */
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

async function main() {
  for (const url of urls) {
    const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
    const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
    const p = new PrismaClient({ adapter } as any);
    try {
      const r = await p.restaurant.findFirst({
        where: { slug: "luigis-lasagna-pizzeria" },
        select: {
          id: true, name: true, email: true, customDomain: true,
          notificationRecipients: { select: { email: true, isActive: true, name: true } },
          users: { select: { email: true, role: true } },
        },
      });
      if (!r) continue;
      console.log(`store: ${r.name}  liveDomain=${r.customDomain}`);
      console.log(`  restaurant.email (reply-to / footer): ${r.email ?? "(none)"}`);
      console.log(`  notification recipients:`);
      for (const n of r.notificationRecipients) console.log(`     ${n.isActive ? "ACTIVE " : "off    "} ${n.email} ${n.name ?? ""}`);
      console.log(`  staff logins:`);
      for (const u of r.users) console.log(`     ${u.role.padEnd(12)} ${u.email}`);
      const all = [r.email, ...r.notificationRecipients.map(n => n.email), ...r.users.map(u => u.email)].filter(Boolean) as string[];
      const milton = all.filter(e => /luigislasagnamilton\.ca$/i.test(e));
      console.log(`\n  >>> addresses on luigislasagnamilton.ca: ${milton.length ? milton.join(", ") : "NONE"}`);
      const domains = [...new Set(all.map(e => e.split("@")[1]?.toLowerCase()).filter(Boolean))];
      console.log(`  >>> all email domains in use: ${domains.join(", ")}`);
    } finally { await p.$disconnect(); }
  }
}
main();
