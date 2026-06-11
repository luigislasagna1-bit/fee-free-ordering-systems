/**
 * Tiny dependency-free SVG bar chart for a smart link's daily scans (Luigi
 * 2026-06-11). Mirrors the lightweight inline-SVG approach the visits report
 * uses — no chart library.
 */
export function ScansChart({ daily }: { daily: { label: string; count: number }[] }) {
  const max = Math.max(1, ...daily.map((d) => d.count));
  const W = 640;
  const H = 160;
  const padX = 8;
  const padTop = 14;
  const padBottom = 22;
  const n = Math.max(1, daily.length);
  const bw = (W - padX * 2) / n;
  const plotH = H - padTop - padBottom;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily scans">
      {/* baseline */}
      <line x1={padX} y1={H - padBottom} x2={W - padX} y2={H - padBottom} stroke="#e5e7eb" strokeWidth={1} />
      {daily.map((d, i) => {
        const h = (d.count / max) * plotH;
        const x = padX + i * bw;
        const y = H - padBottom - h;
        return (
          <g key={i}>
            <rect x={x + 1} y={y} width={Math.max(1, bw - 2)} height={h} rx={2} fill="#10b981" />
            {d.count > 0 && i % 1 === 0 && bw > 16 && (
              <text x={x + bw / 2} y={y - 3} textAnchor="middle" fontSize={9} fill="#6b7280">{d.count}</text>
            )}
            {/* sparse day labels: first, middle, last */}
            {(i === 0 || i === n - 1 || i === Math.floor(n / 2)) && (
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="#9ca3af">{d.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
