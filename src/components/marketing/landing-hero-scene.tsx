/**
 * Institutional visual for the right-hand hero panel: sky, a distant
 * mountain/steppe horizon, and a large stylized institutional building
 * (colonnade + a scales-of-justice emblem on the facade), composed on a
 * TALL (portrait-leaning) canvas so it reads correctly inside the hero's
 * right column instead of being cropped from a wide landscape scene.
 *
 * No licensed photograph of a real building exists in this repository, and
 * none is fetched from the network (the repo was searched first -- only
 * brand marks and the QPay QR code exist under public/). This is therefore
 * a deliberately stylized illustration, not a photograph, and it does not
 * depict or claim to depict any actual building -- it is purely decorative
 * (aria-hidden), matching the composition of the supplied reference without
 * fabricating a claim of real photography.
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
        <linearGradient id="hero-building" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F7F9FE" />
          <stop offset="100%" stopColor="#CBDAF0" />
        </linearGradient>
        <linearGradient id="hero-building-shadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8098C2" />
          <stop offset="100%" stopColor="#5A719E" />
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

      {/* Institutional building -- large, centered, grounded near the base */}
      <g transform="translate(150,330)">
        {/* wings */}
        <rect x="-40" y="260" width="150" height="410" fill="url(#hero-building-shadow)" />
        <rect x="490" y="230" width="170" height="440" fill="url(#hero-building-shadow)" />
        {/* main block */}
        <rect x="100" y="140" width="400" height="530" fill="url(#hero-building)" />
        {/* pediment */}
        <path d="M100,140 L300,20 L500,140 Z" fill="url(#hero-building)" />
        {/* columns */}
        {[130, 178, 226, 274, 322, 370, 418, 462].map((x) => (
          <rect key={x} x={x} y="175" width="18" height="460" fill="#DEE8F9" />
        ))}
        {/* steps */}
        <rect x="70" y="670" width="460" height="18" fill="#B9C9E8" />
        <rect x="48" y="688" width="504" height="18" fill="#A6B9DE" />
        {/* scales-of-justice emblem on the facade */}
        <g transform="translate(300,190)" stroke="#8098C2" strokeWidth="5" fill="none" strokeLinecap="round">
          <line x1="0" y1="0" x2="0" y2="58" />
          <line x1="-42" y1="13" x2="42" y2="13" />
          <path d="M-42,13 L-62,52 A22,15 0 0 0 -22,52 Z" />
          <path d="M42,13 L22,52 A22,15 0 0 0 62,52 Z" />
          <circle cx="0" cy="7" r="7" fill="#8098C2" stroke="none" />
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
