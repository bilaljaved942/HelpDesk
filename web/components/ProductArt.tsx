// Simple flat illustrations for the demo store's products (no stock photos needed).

type Art = "jacket" | "boots" | "down" | "pack" | "fleece" | "tent" | "runners" | "trousers" | "socks";

export function ProductArt({ kind, color }: { kind: Art | string; color: string }) {
  const dark = "rgba(0,0,0,0.18)";
  const line = "rgba(255,255,255,0.55)";
  return (
    <svg viewBox="0 0 200 160" className="h-full w-full" role="img" aria-label={kind}>
      <ellipse cx="100" cy="146" rx="62" ry="7" fill="rgba(0,0,0,0.08)" />
      {kind === "jacket" && (
        <g>
          <path d="M70 30 L100 22 L130 30 L158 52 L150 98 L136 92 L136 140 L64 140 L64 92 L50 98 L42 52 Z" fill={color} />
          <path d="M86 26 Q100 44 114 26 L110 22 L90 22 Z" fill={dark} />
          <path d="M100 40 L100 140" stroke={line} strokeWidth="2.5" />
          <path d="M72 104 h18 M110 104 h18" stroke={dark} strokeWidth="3" strokeLinecap="round" />
          <path d="M84 20 Q100 6 116 20" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" />
        </g>
      )}
      {kind === "down" && (
        <g>
          <path d="M68 32 L100 24 L132 32 L160 56 L152 100 L138 94 L138 140 L62 140 L62 94 L48 100 L40 56 Z" fill={color} />
          {[52, 72, 92, 112].map((y) => <path key={y} d={`M63 ${y + 8} Q100 ${y + 14} 137 ${y + 8}`} stroke={dark} strokeWidth="2.5" fill="none" />)}
          <path d="M100 34 L100 140" stroke={line} strokeWidth="2.5" />
          <path d="M86 28 Q100 40 114 28" fill="none" stroke={dark} strokeWidth="6" strokeLinecap="round" />
        </g>
      )}
      {kind === "boots" && (
        <g>
          <path d="M54 40 L84 40 L86 104 L118 112 Q128 116 128 128 L128 136 L48 136 L48 112 Z" fill={color} />
          <path d="M48 128 L128 128 L128 138 L48 138 Z" fill="#2b2b2b" />
          {[52, 64, 76, 88].map((y) => <path key={y} d={`M58 ${y} L82 ${y + 4}`} stroke={line} strokeWidth="2.5" strokeLinecap="round" />)}
          <path d="M92 52 L122 52 L124 108 L152 114 Q160 118 160 128 L160 136 L88 136 L88 110 Z" fill={color} opacity="0.8" />
          <path d="M88 128 L160 128 L160 138 L88 138 Z" fill="#2b2b2b" opacity="0.85" />
        </g>
      )}
      {kind === "pack" && (
        <g>
          <rect x="62" y="34" width="76" height="106" rx="22" fill={color} />
          <path d="M80 34 Q100 14 120 34" fill="none" stroke={dark} strokeWidth="7" strokeLinecap="round" />
          <rect x="74" y="84" width="52" height="40" rx="10" fill={dark} />
          <path d="M74 62 h52" stroke={line} strokeWidth="2.5" />
          <rect x="94" y="76" width="12" height="6" rx="2" fill={line} />
        </g>
      )}
      {kind === "fleece" && (
        <g>
          <path d="M70 32 L100 26 L130 32 L156 54 L148 96 L134 90 L134 138 L66 138 L66 90 L52 96 L44 54 Z" fill={color} />
          <path d="M88 28 L100 50 L112 28" fill="none" stroke={line} strokeWidth="3" />
          <path d="M100 50 L100 76" stroke={line} strokeWidth="3" />
          <path d="M66 128 h68" stroke={dark} strokeWidth="5" />
        </g>
      )}
      {kind === "runners" && (
        <g>
          <path d="M40 112 Q44 84 72 80 L96 70 Q108 66 118 78 L132 94 Q160 98 166 116 L166 124 L40 124 Z" fill={color} />
          <path d="M38 122 L168 122 Q168 134 156 134 L46 134 Q38 134 38 122 Z" fill="#f2f2f2" stroke="rgba(0,0,0,0.15)" />
          {[84, 94, 104].map((x) => <path key={x} d={`M${x} 78 L${x + 10} 92`} stroke={line} strokeWidth="2.5" strokeLinecap="round" />)}
          <path d="M120 100 Q140 104 156 112" stroke={dark} strokeWidth="3" fill="none" />
        </g>
      )}
      {kind === "trousers" && (
        <g>
          <path d="M70 26 L130 26 L136 140 L106 140 L100 64 L94 140 L64 140 Z" fill={color} />
          <path d="M70 26 L130 26 L131 36 L69 36 Z" fill={dark} />
          <path d="M80 46 Q84 56 94 56" stroke={line} strokeWidth="2.5" fill="none" />
          <rect x="112" y="84" width="16" height="20" rx="2" fill={dark} />
        </g>
      )}
      {kind === "socks" && (
        <g>
          {[[-18, 0.75], [0, 0.9], [18, 1]].map(([dx, op], i) => (
            <g key={i} transform={`translate(${dx} 0)`} opacity={op as number}>
              <path d="M84 26 L112 26 L112 96 Q112 110 124 116 L134 122 Q142 130 132 138 L98 138 Q84 138 84 122 Z" fill={color} />
              <path d="M84 26 L112 26 L112 40 L84 40 Z" fill={dark} />
              <path d="M84 120 Q84 138 100 138 L112 138 L112 124 Q98 124 96 116 Z" fill={line} />
            </g>
          ))}
        </g>
      )}
      {kind === "tent" && (
        <g>
          <path d="M28 136 L100 40 L172 136 Z" fill={color} />
          <path d="M100 40 L100 136" stroke={dark} strokeWidth="3" />
          <path d="M84 136 L100 92 L116 136 Z" fill={dark} />
          <path d="M100 40 L100 30" stroke="#2b2b2b" strokeWidth="3" />
        </g>
      )}
    </svg>
  );
}

export type { Art };
