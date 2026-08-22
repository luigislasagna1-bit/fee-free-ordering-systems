/**
 * Route-level skeleton for /admin/phone-ordering (+ nested caller/call pages
 * until they define their own). The Overview blocks on four parallel queries
 * before the first pixel; this keeps the shell visible and the layout stable
 * instead of a blank page. No strings — nothing to translate.
 */
export default function PhoneOrderingLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-10 animate-pulse" aria-busy="true">
      <div className="h-7 w-28 rounded-lg bg-gray-200" />
      <div className="h-14 rounded-xl bg-gray-100" />
      <div className="flex gap-4 border-b border-gray-200 pb-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-5 w-20 rounded bg-gray-100" />
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-4 w-48 rounded bg-gray-100" />
        <div className="h-9 w-80 rounded-lg bg-gray-200" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-100" />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-48 rounded-xl bg-gray-100" />
        ))}
      </div>
    </div>
  );
}
