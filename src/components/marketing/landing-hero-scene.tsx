/**
 * Full-bleed atmospheric hero backdrop: sky, distant mountain horizon, and a
 * large stylized institutional building (colonnade + a scales-of-justice
 * emblem on the facade) anchored to the right side of the scene.
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
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMax slice"
      className={className}
    >
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B1F3A" />
          <stop offset="38%" stopColor="#1E4DB8" />
          <stop offset="72%" stopColor="#6FA0EE" />
          <stop offset="100%" stopColor="#EAF1FE" />
        </linearGradient>
        <radialGradient id="hero-glow" cx="78%" cy="18%" r="45%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-building" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F4F7FD" />
          <stop offset="100%" stopColor="#C7D6EE" />
        </linearGradient>
        <linearGradient id="hero-building-shadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7C93BE" />
          <stop offset="100%" stopColor="#5A719E" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="1600" height="900" fill="url(#hero-sky)" />
      <rect x="0" y="0" width="1600" height="900" fill="url(#hero-glow)" />

      {/* Distant mountain / steppe horizon */}
      <path
        d="M0,560 L120,520 L260,548 L400,505 L560,540 L720,500 L900,545 L1080,510 L1260,550 L1440,515 L1600,545 L1600,650 L0,650 Z"
        fill="#7C93BE"
        opacity="0.35"
      />
      <path
        d="M0,600 L180,570 L360,595 L540,565 L740,600 L940,568 L1140,602 L1340,572 L1600,598 L1600,700 L0,700 Z"
        fill="#5A719E"
        opacity="0.3"
      />

      {/* Institutional building -- large, right-anchored, grounded at the base */}
      <g transform="translate(780,300)">
        {/* wings */}
        <rect x="-40" y="230" width="160" height="330" fill="url(#hero-building-shadow)" />
        <rect x="480" y="200" width="180" height="360" fill="url(#hero-building-shadow)" />
        {/* main block */}
        <rect x="120" y="120" width="360" height="440" fill="url(#hero-building)" />
        {/* pediment */}
        <path d="M120,120 L300,20 L480,120 Z" fill="url(#hero-building)" />
        {/* columns */}
        {[150, 195, 240, 285, 330, 375, 420, 445].map((x) => (
          <rect key={x} x={x} y="150" width="16" height="380" fill="#DCE6F8" />
        ))}
        {/* steps */}
        <rect x="90" y="555" width="420" height="16" fill="#B9C9E8" />
        <rect x="70" y="571" width="460" height="16" fill="#A6B9DE" />
        {/* scales-of-justice emblem on the facade */}
        <g transform="translate(300,150)" stroke="#7C93BE" strokeWidth="4" fill="none" strokeLinecap="round">
          <line x1="0" y1="0" x2="0" y2="46" />
          <line x1="-34" y1="10" x2="34" y2="10" />
          <path d="M-34,10 L-50,42 A18,12 0 0 0 -18,42 Z" />
          <path d="M34,10 L18,42 A18,12 0 0 0 50,42 Z" />
          <circle cx="0" cy="6" r="5" fill="#7C93BE" stroke="none" />
        </g>
      </g>

      {/* Foreground tree silhouettes anchoring the base of the scene */}
      <g fill="#0B1F3A" opacity="0.55">
        <ellipse cx="80" cy="800" rx="70" ry="90" />
        <ellipse cx="150" cy="830" rx="90" ry="110" />
        <ellipse cx="1500" cy="790" rx="80" ry="100" />
      </g>
      <rect x="0" y="860" width="1600" height="40" fill="#0B1F3A" opacity="0.65" />
    </svg>
  );
}
