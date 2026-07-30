/** DEV-ONLY: find (or create) a throwaway marketplace CustomerAccount on the
 *  local dev DB and print a signed ff_customer session token, so the /account
 *  dashboard can be verified in the browser without a login form. */
import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });
import jwt from "jsonwebtoken";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/prod/i.test(url)) throw new Error("refusing: DATABASE_URL looks like prod");
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const email = "dev-i18n-check@example.com";
  let acct = await p.customerAccount.findUnique({ where: { email } });
  if (!acct) {
    acct = await p.customerAccount.create({
      data: { email, name: "Dev I18n Check", passwordHash: "!disabled-no-login" },
    });
    console.log("created throwaway account");
  }
  const token = jwt.sign(
    { customerAccountId: acct.id, email },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: 60 * 60 },
  );
  console.log(`TOKEN=${token}`);
}
main();
