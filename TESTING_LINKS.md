# Testing Links — Fee Free Ordering Systems

Dev server: **http://localhost:3001** (port 3001 because port 3000 is used by another process)

All URLs below verified returning HTTP 200 after clean restart.

---

## Public Pages

| URL | Description |
|-----|-------------|
| http://localhost:3001 | Marketing homepage |
| http://localhost:3001/login | Admin login |
| http://localhost:3001/signup | New restaurant signup |
| http://localhost:3001/pricing | Pricing page |
| http://localhost:3001/features | Features page |
| http://localhost:3001/faq | FAQ page |
| http://localhost:3001/demo | Demo page |

## Customer Ordering

| URL | Description |
|-----|-------------|
| http://localhost:3001/order/demo-pizza-palace | Demo restaurant ordering page (uses theme colors) |
| http://localhost:3001/order/demo-pizza-palace/info | Restaurant info page (hours, services, contact) |

## Kitchen Display

| URL | Description |
|-----|-------------|
| http://localhost:3001/kitchen | Kitchen display (requires kitchen session) |
| http://localhost:3001/kitchen/login | Kitchen staff login |

## Admin Panel

| URL | Description |
|-----|-------------|
| http://localhost:3001/admin | Dashboard with order stats |
| http://localhost:3001/admin/orders | Order management |
| http://localhost:3001/admin/menu | Menu management — categories, items, modifiers, drag-and-drop |
| http://localhost:3001/admin/promotions | Promotions (auto-apply rules, BOGO, bundles, etc.) |
| http://localhost:3001/admin/coupons | Coupon codes (simple fixed/% discount codes) |
| http://localhost:3001/admin/autopilot | Email automation |
| http://localhost:3001/admin/website | Website theme customization |
| http://localhost:3001/admin/payments/providers | Payment provider (Stripe) setup |
| http://localhost:3001/admin/customers | Customer list |
| http://localhost:3001/admin/reports | Sales reports |
| http://localhost:3001/admin/delivery | Delivery zones |
| http://localhost:3001/admin/hours | Opening hours |
| http://localhost:3001/admin/reservations | Table reservations system |
| http://localhost:3001/admin/services | Service types (Pickup, Delivery, Dine-In, etc.) |
| http://localhost:3001/admin/receipts | Receipt template editor |
| http://localhost:3001/admin/profile | Restaurant profile and branding |
| http://localhost:3001/admin/settings | Account and subscription settings |

---

## Recovery Commands

```bash
# If dev server shows Internal Server Error / Turbopack SST errors:
#   1. Stop the dev server (Ctrl+C)
#   2. Delete .next cache:
rm -rf .next
#   3. Restart:
npm run dev

# After any schema change:
npx prisma db push --accept-data-loss
npx prisma generate

# Type check:
npx tsc --noEmit

# Production build check:
npm run build
```

---

## Key Test Scenarios

### 0. Rebuild Sample Modifier Data (one-time setup)

After first login to the demo account, call this API once to create proper library modifier groups:

```bash
curl -X POST http://localhost:3001/api/admin/seed-demo \
  -H "Cookie: <paste your session cookie here>"
```

Or navigate to the ordering page first (to establish a session), then open the browser console and run:
```js
fetch('/api/admin/seed-demo', { method: 'POST' }).then(r => r.json()).then(console.log)
```

This creates Pizza Size, Crust Type, Extra Toppings, Dressing, and Drink Size groups as library groups attached at the category level.

### 1. Menu Modifier Drag & Drop (`/admin/menu`)
- Create a modifier group in the right panel (e.g. "Size" with Small/Medium/Large)
- **Drag** the group card onto a menu item row — row should highlight with orange dashed border and attach
- **Drag** the group card onto a category header — applies to all items in that category
- Attached groups appear as chips on the item/category
- Click × on a chip to remove it
- Inherited (category-level) groups show in blue; direct item groups in orange

### 2. Customer Ordering with Modifiers (`/order/demo-pizza-palace`)
- Click an item that has modifier groups attached
- Modifier groups appear inside the item modal
- Required groups (marked `*`) block "Add to Cart" until selected
- Min/max selections are enforced

### 3. Table Reservations (`/admin/reservations`)
- **Tables** tab: add tables with name, section, and capacity
- **Settings** tab: configure min notice, advance days, slot length, deposit, per-day hours
- **Reservations** tab: create a test reservation, change status (Pending → Confirmed → Seated), assign a table

### 4. Theme Colors (`/admin/website`)
- Change **Primary Color** to any hex (e.g. `#2563eb` for blue)
- Save — reload `/order/demo-pizza-palace` and `/order/demo-pizza-palace/info`
- All buttons, icons, service cards, category pills, selected states, and CTAs update to the new color

### 5. Services (`/admin/services`)
- Toggle services on/off (Pickup, Delivery, Dine-In, Catering, Take Out, Reservations)
- Expand each to set display name, description, and estimated time

### 6. Promotions & Coupons
**BOGO test** (`/admin/promotions` → New Promotion → Buy One Get One Free):
1. Set Paid group = "Pizzas" category, Free group = "Salads" category (or specific items)
2. Discount strategy = Cheapest, 100% free
3. Auto-apply = on, Active = on
4. Add a pizza and salad to cart at `/order/demo-pizza-palace`
5. The cheaper item should be discounted automatically

**Coupon test** (`/admin/coupons` → Add Coupon):
1. Create code `SAVE10` with 10% discount
2. Add items to cart, open cart drawer, enter `SAVE10` → click Apply
3. Should show "Coupon applied! -$X.XX"

**Note:** BOGO requires items include categoryId — this was fixed in this session.

### 7. Kitchen Display (`/kitchen`)
- Login with kitchen credentials
- Printer setup (gear icon) — test PrintNode API key, select printer, test print
- Orders auto-poll every 30 seconds
- Sound alert on new orders

### 8. Payments (`/admin/payments/providers`)
- Enter Stripe publishable and secret keys
- Test connection → should confirm if keys are valid
- Once configured, Stripe card payments appear on the ordering page

---

## Root Cause of Past ISEs (Fixed)

| Symptom | Root Cause | Fix Applied |
|---------|-----------|-------------|
| ISE on `/admin/profile`, `/admin/settings` | `prisma.findUnique({ where: { id: undefined } })` throws `PrismaClientValidationError` when `restaurantId` is undefined (layout and page render concurrently in Next.js App Router) | Added ternary guard: `restaurantId ? prisma.findUnique(...) : null` |
| ISE on `/kitchen` and other pages | Turbopack cache corruption — `.next` deleted while dev server was running causes SST file lookup failures | Delete `.next`, restart dev server |
| Data leak on `/admin/hours` | `findMany({ where: { restaurantId: undefined } })` returns all records | Added `restaurantId ? prisma.findMany(...) : []` guard |
| Modifier drag highlight never shows | HTML5 `dataTransfer.types` stores keys as ASCII-lowercase; `types.includes("libraryGroupId")` never matched | Changed to `types.includes("librarygroupid")` |
| "Failed to detach" modifier group | `OrderItemModifier.modifierOptionId` FK without `onDelete: SetNull` caused constraint violation when deleting modifier groups used in past orders | Made `modifierOptionId` nullable with `onDelete: SetNull`; schema migrated |
| Inherited category modifier chip showed × button | Clicking × on inherited chip deleted the category-level group for ALL items in that category | Removed `onRemove` from inherited chips; they're now read-only with an ↑ indicator |
| BOGO / category-based promos never matched cart items | Cart items sent to `apply-promos` lacked `categoryId`; `itemsMatchingGroup` always returned empty for category rules | Added `categoryId: c.id` when building `visibleCategories`, included in apply-promos payload |
| Customer-facing pages used hardcoded orange | `from-orange-600`, `bg-orange-500`, etc. throughout ordering page and info page ignored `themeSettings` | Replaced with `theme.primaryColor` inline styles; `RestaurantInfoClient` now receives and applies `themeSettings` |
| Services not consistent on info page | `RestaurantInfoClient` didn't show TakeOut/Reservations services, and estimated times came from stale boolean fields instead of `serviceSettings` JSON | Added `acceptsTakeOut`, `acceptsReservations`, `serviceSettings` to info page Prisma query; service display names/times from `serviceSettings` |
