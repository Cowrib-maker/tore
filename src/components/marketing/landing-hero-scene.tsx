/**
 * Atmospheric hero backdrop: a cool, overcast-blue daylight sky over
 * distant Mongolian mountains and foreground ground/trees -- deliberately
 * understated (no monumental foreground building, no city-block silhouette
 * that could read as an abstract bar-chart artifact) so the small
 * "ХУУЛЬ / ТЕХНОЛОГИ / НИЙГЭМ" scale-of-justice lockup near the upper right
 * reads as the composition's one institutional cue.
 *
 * No licensed photograph of a real building exists in this repository, and
 * none is fetched from the network (checked first -- only brand marks and
 * the QPay QR code exist under public/). This stays a flat, clearly
 * decorative vector illustration rather than an attempt at photorealism,
 * which would risk implying a real, specific place or institution that
 * doesn't exist. Cool, blue-driven "Deep Sovereign Navy" / "TORE Blue"
 * atmosphere throughout -- no warm/amber tones anywhere.
 *
 * The viewBox is landscape (1600x900), matching the hero container's own
 * wide/short shape.
 *
 * Purely decorative (aria-hidden), not a claim to depict any real place.
 */

export function LandingHeroScene({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      <defs>
        <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#08162F" />
          <stop offset="20%" stopColor="#123262" />
          <stop offset="38%" stopColor="#25548F" />
          <stop offset="55%" stopColor="#4E7CBA" />
          <stop offset="72%" stopColor="#87A8D4" />
          <stop offset="88%" stopColor="#CBD9EC" />
          <stop offset="100%" stopColor="#E4ECF7" />
        </linearGradient>
        <radialGradient id="hs-sun-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#EAF2FF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#EAF2FF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hs-sun-disc" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FDFEFF" />
          <stop offset="100%" stopColor="#CFE0FF" />
        </radialGradient>
        <radialGradient id="hs-tree-canopy" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#22406A" />
          <stop offset="100%" stopColor="#0B1F3A" />
        </radialGradient>
        <linearGradient id="hs-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16294B" />
          <stop offset="100%" stopColor="#0A1730" />
        </linearGradient>
        <filter id="hs-soft-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      <rect width="1600" height="900" fill="url(#hs-sky)" />

      {/* Sun -- soft halo, then a defined disc */}
      <circle cx="480" cy="110" r="220" fill="url(#hs-sun-halo)" />
      <circle cx="480" cy="110" r="220" fill="url(#hs-sun-halo)" filter="url(#hs-soft-blur)" />
      <circle cx="480" cy="110" r="34" fill="url(#hs-sun-disc)" />

      {/* Soft high clouds */}
      <g fill="#FFFFFF" filter="url(#hs-soft-blur)">
        <ellipse cx="300" cy="130" rx="150" ry="22" opacity="0.5" />
        <ellipse cx="640" cy="90" rx="120" ry="18" opacity="0.4" />
        <ellipse cx="120" cy="210" rx="100" ry="16" opacity="0.35" />
        <ellipse cx="980" cy="170" rx="110" ry="16" opacity="0.3" />
        <ellipse cx="1300" cy="140" rx="130" ry="18" opacity="0.32" />
      </g>

      {/* Distant mountain silhouettes, layered for atmospheric perspective,
          spanning the full width -- the whole hero is one continuous vista,
          not a backdrop behind a single foreground object. */}
      <path
        d="M0,500 L130,468 L300,494 L480,454 L680,488 L880,450 L1060,486 L1260,458 L1440,484 L1600,462 L1600,620 L0,620 Z"
        fill="#7C93C0"
        opacity="0.58"
      />
      <path
        d="M0,540 L190,512 L400,538 L620,506 L840,536 L1050,508 L1260,540 L1440,512 L1600,534 L1600,660 L0,660 Z"
        fill="#53699A"
        opacity="0.62"
      />

      {/* Foreground ground */}
      <rect x="0" y="770" width="1600" height="130" fill="url(#hs-ground)" />

      {/* Organic foreground tree canopies for scale */}
      <g>
        <rect x="215" y="820" width="10" height="46" fill="#0A1730" />
        <ellipse cx="220" cy="800" rx="82" ry="64" fill="url(#hs-tree-canopy)" />
        <ellipse cx="198" cy="778" rx="30" ry="20" fill="#3E5C8C" opacity="0.55" />

        <rect x="1310" y="850" width="12" height="54" fill="#0A1730" />
        <ellipse cx="1315" cy="836" rx="100" ry="76" fill="url(#hs-tree-canopy)" />
        <ellipse cx="1287" cy="808" rx="36" ry="24" fill="#3E5C8C" opacity="0.55" />

        <rect x="1460" y="830" width="9" height="42" fill="#0A1730" />
        <ellipse cx="1464" cy="812" rx="70" ry="56" fill="url(#hs-tree-canopy)" />
        <ellipse cx="1444" cy="792" rx="26" ry="17" fill="#3E5C8C" opacity="0.55" />
      </g>

      {/* Single lamp post for a sense of real scale (not repeated) */}
      <g stroke="#0B1F3A" strokeWidth="3" opacity="0.5">
        <line x1="700" y1="856" x2="700" y2="780" />
      </g>
      <circle cx="700" cy="776" r="7" fill="#CFE0FF" opacity="0.75" />

      {/* -------------------------------------------------------------- */}
      {/* Decorative legal/tech/society lockup -- the composition's one
          institutional cue, deliberately small and set upper-right rather
          than a dominant foreground building. A simple scale-of-justice
          line icon (not a claim to any real seal or emblem) above a
          three-line wordmark. */}
      {/* -------------------------------------------------------------- */}
      {/* Deep navy (not the sky's own pale blue) so the lockup survives the
          hero's light wash on top of this scene -- the earlier pale-on-pale
          version was legible in isolation but nearly invisible once
          composited under the wash. */}
      <g transform="translate(1290,150)">
        <g
          stroke="#0B1F3A"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
        >
          <line x1="0" y1="-34" x2="0" y2="24" />
          <line x1="-38" y1="-20" x2="38" y2="-20" />
          <path d="M-38,-20 L-54,14 A18,11 0 0 0 -22,14 Z" />
          <path d="M38,-20 L22,14 A18,11 0 0 0 54,14 Z" />
          <line x1="-24" y1="30" x2="24" y2="30" />
          <line x1="0" y1="24" x2="0" y2="30" />
          <circle cx="0" cy="-34" r="4" fill="#0B1F3A" stroke="none" />
        </g>
        <text
          x="0"
          y="76"
          textAnchor="middle"
          fill="#0B1F3A"
          fontSize="15"
          fontWeight="700"
          letterSpacing="2.5"
          opacity="0.6"
        >
          ХУУЛЬ
        </text>
        <text
          x="0"
          y="98"
          textAnchor="middle"
          fill="#0B1F3A"
          fontSize="15"
          fontWeight="700"
          letterSpacing="2.5"
          opacity="0.48"
        >
          ТЕХНОЛОГИ
        </text>
        <text
          x="0"
          y="120"
          textAnchor="middle"
          fill="#0B1F3A"
          fontSize="15"
          fontWeight="700"
          letterSpacing="2.5"
          opacity="0.36"
        >
          НИЙГЭМ
        </text>
      </g>
    </svg>
  );
}
