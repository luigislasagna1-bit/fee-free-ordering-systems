/**
 * Decorative half-and-half pizza — communicates the split-pizza builder at a
 * glance. Warm food tones are allowed here as soft "mockup" imagery (same
 * exception as the amber/orange screenshot backgrounds); the brand emerald is
 * used only for the split indicator + labels so it stays on-palette. Purely
 * presentational; can be swapped for a real builder screenshot later.
 */
export function PizzaSplitGraphic() {
  return (
    <div className="relative mx-auto max-w-sm">
      <div className="rounded-3xl border border-gray-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50/60 p-8 shadow-[0_24px_60px_-20px_rgba(16,24,40,0.18)]">
        {/* split labels */}
        <div className="flex items-center justify-between mb-4 text-xs font-bold uppercase tracking-wide">
          <span className="inline-flex items-center gap-1.5 text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500" />Left half</span>
          <span className="inline-flex items-center gap-1.5 text-emerald-700">Right half<span className="w-2 h-2 rounded-full bg-emerald-500" /></span>
        </div>

        <svg viewBox="0 0 240 240" className="w-full h-auto" role="img" aria-label="Half-and-half pizza">
          <defs>
            <clipPath id="leftHalf"><rect x="0" y="0" width="120" height="240" /></clipPath>
            <clipPath id="rightHalf"><rect x="120" y="0" width="120" height="240" /></clipPath>
          </defs>
          {/* crust */}
          <circle cx="120" cy="120" r="112" fill="#e9b873" />
          <circle cx="120" cy="120" r="100" fill="#f4d29a" />
          {/* cheese base */}
          <circle cx="120" cy="120" r="100" fill="#f7e3b0" />

          {/* LEFT half — pepperoni */}
          <g clipPath="url(#leftHalf)">
            <circle cx="120" cy="120" r="100" fill="#f6ddb0" />
            {[[70,70],[60,120],[78,168],[95,95],[88,140],[55,90]].map(([x,y],i)=>(
              <circle key={i} cx={x} cy={y} r="11" fill="#c0392b" stroke="#9c2b20" strokeWidth="1.5" />
            ))}
          </g>
          {/* RIGHT half — veggies */}
          <g clipPath="url(#rightHalf)">
            <circle cx="120" cy="120" r="100" fill="#f7e8bc" />
            {[[160,80],[185,120],[150,150],[175,170]].map(([x,y],i)=>(
              <circle key={i} cx={x} cy={y} r="10" fill="#3a8f4f" stroke="#2e7440" strokeWidth="1.5" />
            ))}
            {[[150,100],[175,95],[160,135]].map(([x,y],i)=>(
              <circle key={'m'+i} cx={x} cy={y} r="8" fill="#cdbfa3" stroke="#a8987a" strokeWidth="1.5" />
            ))}
          </g>

          {/* split divider */}
          <line x1="120" y1="14" x2="120" y2="226" stroke="#10b981" strokeWidth="4" strokeDasharray="2 8" strokeLinecap="round" />
        </svg>

        {/* placement chips */}
        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
          {["½ Left", "½ Right", "Whole", "Light · Normal · Extra"].map((c) => (
            <span key={c} className="rounded-full bg-white border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 shadow-sm">{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
