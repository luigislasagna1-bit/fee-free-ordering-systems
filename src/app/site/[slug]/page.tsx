import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { loadHostedSite } from "@/lib/hosted-site";

/**
 * Public hosted marketing page. Reached two ways:
 *   1. <slug>.feefreeordering.com → middleware rewrites to /site/[slug]
 *   2. /site/<slug> directly (preview, no DNS needed)
 *
 * Gated on the hosted_marketing_page feature; restaurants without the
 * "Sales Optimized Website" add-on get a friendly "owner-only" page
 * pointing them at /admin/billing/add-ons.
 */
export default async function HostedSitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await loadHostedSite(slug);

  if (result.kind === "not_found") notFound();

  if (result.kind === "not_published") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900">Coming soon</h1>
          <p className="text-gray-600 mt-2">
            This restaurant hasn't launched yet. Check back shortly.
          </p>
        </div>
      </main>
    );
  }

  if (result.kind === "upgrade_required") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 p-8">
        <div className="max-w-lg text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            {result.restaurantName}
          </h1>
          <p className="text-gray-600 mt-3">
            This restaurant accepts orders directly through their existing
            website. Use their ordering link or visit them in person.
          </p>
          <div className="mt-6 text-xs text-gray-400">
            Restaurant owner? Upgrade to the Sales Optimized Website add-on to
            unlock this page.
          </div>
        </div>
      </main>
    );
  }

  const r = result.data;
  const themeColor = (r.themeSettings?.primaryColor as string) || "#ef4444";
  const orderUrl = `/order/${r.slug}`;

  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section
        className="relative text-white"
        style={{
          background: r.bannerUrl
            ? `linear-gradient(rgba(0,0,0,0.45),rgba(0,0,0,0.45)), url(${r.bannerUrl}) center/cover`
            : `linear-gradient(135deg, ${themeColor}, #1f2937)`,
        }}
      >
        <div className="max-w-5xl mx-auto px-6 py-20 md:py-28">
          {r.logoUrl && (
            <div className="mb-6">
              <Image
                src={r.logoUrl}
                alt={`${r.name} logo`}
                width={80}
                height={80}
                className="rounded-lg bg-white/10 p-2"
              />
            </div>
          )}
          <h1 className="text-4xl md:text-6xl font-extrabold">{r.name}</h1>
          {r.slogan && <p className="mt-3 text-lg md:text-xl opacity-90">{r.slogan}</p>}
          {r.cuisineType && (
            <p className="mt-2 text-sm uppercase tracking-wider opacity-75">
              {r.cuisineType}
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={orderUrl}
              className="px-6 py-3 rounded-full font-semibold shadow-lg hover:shadow-xl transition"
              style={{ background: themeColor, color: "white" }}
            >
              Order Online
            </Link>
            {r.acceptsReservations && (
              <Link
                href={`${orderUrl}?service=reservation`}
                className="px-6 py-3 rounded-full font-semibold bg-white/10 hover:bg-white/20 border border-white/30 transition"
              >
                Book a Table
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* About */}
      {r.description && (
        <section className="max-w-3xl mx-auto px-6 py-12">
          <h2 className="text-2xl font-bold text-gray-900">About</h2>
          <p className="mt-3 text-gray-700 leading-relaxed whitespace-pre-line">
            {r.description}
          </p>
        </section>
      )}

      {/* Featured menu */}
      {r.featuredItems.length > 0 && (
        <section className="bg-gray-50">
          <div className="max-w-5xl mx-auto px-6 py-14">
            <h2 className="text-2xl font-bold text-gray-900 text-center">
              Featured menu
            </h2>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {r.featuredItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden"
                >
                  {item.imageUrl && (
                    <div className="aspect-video bg-gray-100 overflow-hidden">
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        width={400}
                        height={225}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-gray-900">{item.name}</h3>
                      <span className="font-bold" style={{ color: themeColor }}>
                        ${item.price.toFixed(2)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link
                href={orderUrl}
                className="inline-block px-6 py-3 rounded-full font-semibold text-white shadow"
                style={{ background: themeColor }}
              >
                View full menu &rarr;
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Visit + Hours */}
      <section className="max-w-5xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Visit</h2>
            <div className="mt-4 space-y-2 text-gray-700">
              {r.address && (
                <p>
                  {r.address}
                  {r.city && `, ${r.city}`}
                  {r.state && `, ${r.state}`}
                  {r.zip && ` ${r.zip}`}
                </p>
              )}
              {r.phone && (
                <p>
                  <a href={`tel:${r.phone}`} className="hover:underline">
                    {r.phone}
                  </a>
                </p>
              )}
              {r.email && (
                <p>
                  <a href={`mailto:${r.email}`} className="hover:underline">
                    {r.email}
                  </a>
                </p>
              )}
            </div>
            {/* Services */}
            <div className="mt-6 flex flex-wrap gap-2">
              {r.acceptsPickup && <Pill color={themeColor}>Pickup</Pill>}
              {r.acceptsDelivery && <Pill color={themeColor}>Delivery</Pill>}
              {r.acceptsDineIn && <Pill color={themeColor}>Dine-in</Pill>}
              {r.acceptsReservations && <Pill color={themeColor}>Reservations</Pill>}
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Hours</h2>
            <ul className="mt-4 divide-y divide-gray-100 border-t border-b border-gray-100">
              {r.hours.map((h) => (
                <li key={h.dayOfWeek} className="flex justify-between py-2 text-sm">
                  <span className="font-medium text-gray-800">{dayName(h.dayOfWeek)}</span>
                  <span className="text-gray-600">
                    {h.isOpen && h.openTime && h.closeTime
                      ? `${h.openTime} – ${h.closeTime}`
                      : "Closed"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer className="bg-gray-900 text-gray-300 py-8 mt-10">
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <p>&copy; {new Date().getFullYear()} {r.name}</p>
          <p className="text-xs text-gray-500">
            Powered by Fee Free Ordering
          </p>
        </div>
      </footer>
    </main>
  );
}

function dayName(d: number) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d] || `Day ${d}`;
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="text-xs font-medium px-3 py-1 rounded-full text-white"
      style={{ background: color }}
    >
      {children}
    </span>
  );
}
