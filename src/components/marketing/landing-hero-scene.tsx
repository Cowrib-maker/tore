/**
 * Institutional visual for the right-hand hero panel: sky, a distant
 * mountain/steppe horizon, and a modern glass-and-stone institutional
 * tower with a scales-of-justice medallion set into its facade.
 *
 * Earlier version used a row of thin repeated vertical bars (a colonnade)
 * that, once scaled up, read as prison bars / a cell / metal grilles --
 * the wrong metaphor entirely for a legal-tech product. This version
 * deliberately avoids ANY repeated thin vertical elements: the tower is a
 * solid tapered mass with a few WIDE horizontal glass bands (curtain-wall
 * architecture, the way a modern courthouse or ministry building actually
 * reads), and the justice symbol is a single contained medallion rather
 * than free-floating linework.
 *
 * No licensed photograph of a real building exists in this repository, and
 * none is fetched from the network (the repo was searched first -- only
 * brand marks and the QPay QR code exist under public/). This remains a
 * deliberately stylized illustration, not a photograph, and does not
 * depict or claim to depict any actual building -- purely decorative
 * (aria-hidden).
 */
export function LandingHeroScene({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 900 1100"
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B1F3A" />
          <stop offset="34%" stopColor="#1E4DB8" />
          <stop offset="68%" stopColor="#6FA0EE" />
          <stop offset="100%" stopColor="#DCE9FC" />
        </linearGradient>
        <radialGradient id="hero-glow" cx="72%" cy="14%" r="42%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tower-face" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#EAF0FB" />
          <stop offset="55%" stopColor="#CBDAF0" />
          <stop offset="100%" stopColor="#9FB6DC" />
        </linearGradient>
        <linearGradient id="tower-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8098C2" />
          <stop offset="100%" stopColor="#5A719E" />
        </linearGradient>
        <linearGradient id="glass-band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.08" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="900" height="1100" fill="url(#hero-sky)" />
      <rect x="0" y="0" width="900" height="1100" fill="url(#hero-glow)" />

      {/* Distant mountain / steppe horizon */}
      <path
        d="M0,760 L90,725 L200,748 L320,712 L460,742 L600,705 L720,745 L830,715 L900,738 L900,830 L0,830 Z"
        fill="#7C93BE"
        opacity="0.32"
      />
      <path
        d="M0,800 L110,775 L230,798 L360,768 L520,802 L660,770 L790,804 L900,778 L900,880 L0,880 Z"
        fill="#5A719E"
        opacity="0.28"
      />

      {/* Institutional tower -- one solid mass, wide horizontal glass bands,
          no repeated thin vertical elements anywhere. */}
      <g transform="translate(190,260)">
        {/* low annex wing, grounds the tower against the skyline */}
        <rect x="-70" y="480" width="180" height="330" fill="url(#tower-side)" />
        <rect x="410" y="440" width="200" height="370" fill="url(#tower-side)" />

        {/* main tower mass, gently tapered */}
        <path
          d="M40,810 L20,120 L300,20 L580,120 L560,810 Z"
          fill="url(#tower-face)"
        />
        {/* shaded return face for depth */}
        <path d="M560,810 L580,120 L620,140 L600,810 Z" fill="url(#tower-side)" />

        {/* wide horizontal glass bands (curtain-wall floors) */}
        {[170, 260, 350, 440, 530, 620, 710].map((y) => (
          <rect key={y} x="55" y={y} width="480" height="46" fill="url(#glass-band)" />
        ))}

        {/* base plinth / steps */}
        <rect x="10" y="800" width="600" height="20" fill="#B9C9E8" />
        <rect x="-15" y="820" width="650" height="18" fill="#A6B9DE" />

        {/* scales-of-justice medallion set into the facade as one contained emblem */}
        <circle cx="300" cy="330" r="74" fill="#F4F8FE" opacity="0.9" />
        <circle cx="300" cy="330" r="74" fill="none" stroke="#8098C2" strokeWidth="4" />
        <g transform="translate(300,330)" stroke="#5A719E" strokeWidth="5" fill="none" strokeLinecap="round">
          <line x1="0" y1="-28" x2="0" y2="26" />
          <line x1="-34" y1="-12" x2="34" y2="-12" />
          <path d="M-34,-12 L-50,20 A18,12 0 0 0 -18,20 Z" />
          <path d="M34,-12 L18,20 A18,12 0 0 0 50,20 Z" />
          <circle cx="0" cy="-18" r="6" fill="#5A719E" stroke="none" />
        </g>
      </g>

      {/* Foreground tree silhouettes anchoring the base of the scene */}
      <g fill="#0B1F3A" opacity="0.5">
        <ellipse cx="60" cy="1010" rx="65" ry="85" />
        <ellipse cx="130" cy="1040" rx="85" ry="105" />
        <ellipse cx="820" cy="1000" rx="75" ry="95" />
      </g>
      <rect x="0" y="1060" width="900" height="40" fill="#0B1F3A" opacity="0.6" />
    </svg>
  );
}
