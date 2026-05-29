import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const EMAIL = "owner@pizzapalace.com";
const NEW_PASSWORD = "Test1234!";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  const updated = await prisma.user.update({
    where: { email: EMAIL },
    data: { passwordHash },
  });
  console.log(`\nPassword reset for ${updated.email}`);
  console.log(`  Email:    ${EMAIL}`);
  console.log(`  Password: ${NEW_PASSWORD}`);
  console.log(`  Role:     ${updated.role}`);
  console.log(`  Restaurant: ${updated.restaurantId}\n`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
