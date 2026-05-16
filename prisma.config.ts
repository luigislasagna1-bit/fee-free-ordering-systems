import * as dotenv from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Load both .env (committed defaults) and .env.local (per-developer overrides
// like the Postgres URL). Order matters: .env.local wins where keys collide,
// matching Next.js's own env-loading behaviour.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
