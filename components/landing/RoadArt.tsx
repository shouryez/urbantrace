/** Drawn stand-ins for road photos on the landing page, used until real before and after photos exist. */

type RoadArtProps = { fixed?: boolean; className?: string };

/** Top-down asphalt with a lane line and a pothole, or the same spot patched. */
export function RoadArt({ fixed = false, className = "" }: RoadArtProps) {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <pattern id="aggregate" width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="3" r="0.9" fill="#3a404a" />
          <circle cx="8" cy="9" r="0.7" fill="#232830" />
          <circle cx="10" cy="2" r="0.5" fill="#454c57" />
        </pattern>
      </defs>
      <rect width="400" height="300" fill="#2B3038" />
      <rect width="400" height="300" fill="url(#aggregate)" />
      {/* lane line */}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={24 + i * 110} y="40" width="64" height="8" rx="2" fill="#F1F3F2" opacity="0.55" />
      ))}
      {fixed ? (
        <>
          {/* fresh patch: a darker, clean edged rectangle */}
          <rect x="118" y="120" width="170" height="118" rx="6" fill="#1D2127" />
          <rect x="118" y="120" width="170" height="118" rx="6" fill="url(#aggregate)" opacity="0.5" />
          <rect x="118" y="120" width="170" height="118" rx="6" fill="none" stroke="#15181C" strokeWidth="3" />
        </>
      ) : (
        <>
          {/* broken edge, the hole, and standing water */}
          <path
            d="M132 168 L150 138 L184 128 L214 136 L246 126 L272 146 L280 176 L268 206 L236 224 L196 228 L160 218 L138 198 Z"
            fill="#15181C"
            stroke="#454c57"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="M160 186 C 176 168, 220 166, 248 180 C 252 196, 222 210, 190 208 C 168 206, 156 198, 160 186 Z" fill="#5E6773" opacity="0.55" />
          <path d="M282 160 L312 150 M276 200 L304 214 M140 140 L116 128" stroke="#15181C" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** Dark street grid for the hero and the Forty to one map. */
export function StreetGrid({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width="800" height="600" fill="#15181C" />
      <g stroke="#2B3038" strokeLinecap="round" fill="none">
        {[60, 170, 300, 410, 520].map((y) => (
          <path key={`h${y}`} d={`M-20 ${y} L820 ${y + 30}`} strokeWidth="10" />
        ))}
        {[90, 240, 380, 560, 700].map((x) => (
          <path key={`v${x}`} d={`M${x} -20 L${x - 40} 620`} strokeWidth="10" />
        ))}
        <path d="M-20 560 C 200 420, 420 380, 820 120" strokeWidth="18" />
        <path d="M120 -20 C 180 200, 320 300, 360 620" strokeWidth="6" />
      </g>
      <g fill="#1D2127">
        <rect x="430" y="200" width="90" height="60" rx="8" />
        <rect x="120" y="330" width="70" height="50" rx="8" />
        <rect x="600" y="420" width="80" height="70" rx="8" />
      </g>
    </svg>
  );
}
