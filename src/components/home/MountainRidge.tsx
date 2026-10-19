/**
 * Decorative Himachal mountain-ridge silhouette for the home hero. Sits behind
 * the hero photo as a fallback if the image fails to load (or before it paints).
 * Purely presentational: hidden from assistive technology.
 * Gradient ids are unique because the hero renders once per page.
 */
export function MountainRidge({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 320"
      preserveAspectRatio="xMidYMax slice"
      className={className}
    >
      <defs>
        <linearGradient id="home-ridge-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a7cc4" stopOpacity="0.38" />
          <stop offset="1" stopColor="#123e70" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="home-ridge-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b2f57" />
          <stop offset="1" stopColor="#061e39" />
        </linearGradient>
        <radialGradient id="home-ridge-glow" cx="0.78" cy="0.25" r="0.35">
          <stop offset="0" stopColor="#ffc629" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffc629" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1440" height="320" fill="url(#home-ridge-glow)" />
      {/* Far range with light snow caps */}
      <path
        fill="url(#home-ridge-far)"
        d="M0 215 L80 170 L150 196 L240 128 L320 172 L410 104 L500 160 L585 132 L670 182 L770 112 L860 150 L955 96 L1045 146 L1135 118 L1225 164 L1320 110 L1440 150 V320 H0 Z"
      />
      <path
        fill="#ffffff"
        fillOpacity="0.16"
        d="M410 104 L392 118 L404 121 L412 114 L421 122 L431 117 Z M955 96 L936 111 L948 114 L957 106 L966 115 L977 110 Z M1320 110 L1302 124 L1314 126 L1322 119 L1331 127 L1342 122 Z M240 128 L224 141 L235 143 L242 137 L250 144 L259 140 Z"
      />
      {/* Middle range */}
      <path
        fill="#0f3561"
        fillOpacity="0.72"
        d="M0 252 L105 206 L195 238 L300 182 L398 228 L505 190 L612 242 L718 196 L818 234 L930 178 L1040 224 L1150 190 L1262 234 L1362 200 L1440 220 V320 H0 Z"
      />
      {/* Near ridge */}
      <path
        fill="url(#home-ridge-near)"
        d="M0 292 L130 258 L255 282 L382 248 L520 286 L660 256 L800 292 L940 262 L1080 290 L1222 264 L1340 286 L1440 272 V320 H0 Z"
      />
    </svg>
  );
}
