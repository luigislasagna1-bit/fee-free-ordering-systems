# Fee Free Ordering Systems

Multi-tenant restaurant ordering platform — customer ordering page, kitchen display, and admin panel for each restaurant, with no per-order fees.

**Stack:** Next.js 16 (App Router, Turbopack), Prisma 7 + `@prisma/adapter-pg`, PostgreSQL (we use Neon), NextAuth v4, Tailwind CSS 4, TypeScript, next-intl (5 languages: en/fr/es/it/pt).

---

## Quick start (fresh clone, ~10 minutes)

You'll need Node 18+ and a Postgres database. The fastest path is a free Neon project.

### 1. Install dependencies

```bash
npm install
```

### 2. Provision a Postgres database

Sign up free at **https://neon.tech**, create a project (any region, Postgres 17+), and copy the **direct connection string** (the one *without* `-pooler` in the hostname — Prisma migrations need the unpooled connection).

### 3. Set up env vars

```bash
cp .env.example .env
```

Open `.env` and at minimum fill in:

- `DATABASE_URL` — paste the Neon connection string
- `NEXTAUTH_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `ENCRYPTION_KEY` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Everything else has working placeholder defaults for local dev.

### 4. Create the schema & seed demo data

```bash
npx prisma db push        # creates all tables in your Neon database
npm run seed              # inserts Pizza Palace demo + dev accounts
```

### 5. Run the dev server

```bash
npm run dev               # http://localhost:3001
```

Sign in with:

| Role | Email | Password | Where to go |
|---|---|---|---|
| Restaurant owner | `owner@pizzapalace.com` | `restaurant123` | `/login` → `/admin` |
| Kitchen staff | `kitchen@pizzapalace.com` | `kitchen123` | `/kitchen/login` → `/kitchen` |
| Platform superadmin | `admin@feefreeordering.com` | `admin123` | `/login` → `/superadmin` |

Public customer ordering page: `http://localhost:3001/order/demo-pizza-palace`

---

## Key URLs

| Surface | URL |
|---|---|
| Marketing site | `/` |
| Customer ordering | `/order/[slug]` (e.g. `/order/demo-pizza-palace`) |
| Customer order info | `/order/[slug]/info` |
| Stripe checkout | `/order/[slug]/payment` |
| Order status tracker | `/order/[slug]/status/[orderId]` |
| Restaurant admin | `/admin` (login at `/login`) |
| Kitchen display | `/kitchen` (login at `/kitchen/login`) |
| Platform superadmin | `/superadmin` (login at `/login`) |

---

## Working with the database

Schema changes:

```bash
# Edit prisma/schema.prisma, then:
npx prisma db push            # sync schema to your DB (no migration file)
# OR for production-grade migration history:
npx prisma migrate dev --name describe-your-change
```

Inspecting data:

```bash
npx prisma studio             # opens a GUI at http://localhost:5555
```

Or open the **Neon SQL Editor** in your Neon dashboard — same DB, no install needed.

Re-seeding from scratch:

```bash
npm run seed
```

---

## Architecture cliff notes

- **Multi-tenant routing**: requests to `<sub>.<PLATFORM_DOMAIN>` or custom domains are rewritten via [src/proxy.ts](src/proxy.ts) to `/order/<slug>/*`. Each restaurant gets a default subdomain matching its slug, and can connect a custom domain via Admin → Website → Domain.
- **Print pipeline (GOLDEN — do not modify)**: receipt bytes are built by [src/lib/receipt.ts](src/lib/receipt.ts) and sent to the restaurant's printer via [PrintNode](https://www.printnode.com) cloud relay. Verified working on Star TSP143IIIW. The byte builder is platform-agnostic; the transport is HTTPS to PrintNode's API, which works identically from web, iOS, and Android.
- **Dual auth**: separate NextAuth instances for the admin panel ([src/lib/auth.ts](src/lib/auth.ts)) and the kitchen display ([src/lib/auth-kitchen.ts](src/lib/auth-kitchen.ts)) so a tablet logged in as kitchen staff and a laptop logged in as the owner don't fight over the same session cookie.
- **i18n**: 5 languages live in [src/messages/](src/messages/). The active locale is resolved from (1) `fee-free-locale` cookie → (2) the restaurant's `defaultLanguage` → (3) the browser's `Accept-Language` → (4) `en` fallback.

---

## Testing on a real phone (without deploying)

Use a Cloudflare Tunnel (free, no warning interstitial, supports WebSockets):

```bash
# In one terminal:
npm run build && npm start    # production build at http://localhost:3001

# In a second terminal:
cloudflared tunnel --url http://localhost:3001
```

Copy the printed `https://*.trycloudflare.com` URL and put it in `.env.local` as `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL`, then restart the server. Open the URL on your phone — login + PWA install + kitchen display all work as a real app.

The tunnel URL rotates each restart, so this is fine for testing but eventually you'll want a real domain.

---

## Deployment

Production needs:

1. A Postgres database (Neon, Supabase, Vercel Postgres, AWS RDS, etc.) — set `DATABASE_URL` in the host's env config
2. A Node host (Vercel, Cloudflare Pages, Railway, Render) — set the rest of the env vars there too
3. A domain (the platform domain). Set `PLATFORM_DOMAIN`, `DOMAIN_PROVIDER`, and provider credentials accordingly.

Then deploy. Run `npx prisma db push` once against the production DB to create the schema. Don't seed — let your first real restaurant sign up via the public flow.
