/**
 * Atmospheric hero backdrop: a cool, hazy daylight sky over soft, organic
 * distant-mountain contours and a restrained, irregular far skyline, with
 * foreground ground/trees -- deliberately understated (no monumental
 * foreground building, no equal-width rectangles that could read as a bar
 * chart) so the small "ХУУЛЬ / ТЕХНОЛОГИ / НИЙГЭМ" scale-of-justice lockup
 * near the upper right sits inside the atmosphere rather than floating as
 * a standalone logo on flat sky.
 *
 * No licensed photograph of a real building exists in this repository, and
 * none is fetched from the network (checked first -- only brand marks and
 * the QPay QR code exist under public/). This stays a flat, clearly
 * decorative vector illustration rather than an attempt at photorealism,
 * which would risk implying a real, specific place or institution that
 * doesn't exist. Cool, blue-driven "Deep Sovereign Navy" / "TORE Blue"
 * atmosphere throughout -- no warm/amber tones anywhere.
 *
 * Mountain/skyline contours use smooth curves (Q/C), not straight-line
 * polygons -- the previous version's sharp triangular peaks were the
 * specific thing that read as "abstract geometric shapes" rather than a
 * landscape. Three depth layers (far hills+skyline, mid, near) with a soft
 * haze band between them stand in for atmospheric perspective.
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
          <stop offset="0%" stopColor="#16294B" stopOpacity="0" />
          <stop offset="35%" stopColor="#16294B" />
          <stop offset="100%" stopColor="#0A1730" />
        </linearGradient>
        <radialGradient id="hs-emblem-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#D9E7FF" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#D9E7FF" stopOpacity="0" />
        </radialGradient>
        <filter id="hs-soft-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id="hs-haze-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="24" />
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
      </g>

      {/* Layer 1 (farthest): soft, low-amplitude hills with a restrained,
          irregular distant skyline riding along the same silhouette --
          rounded humps of varying width/height, never equal rectangles, so
          it reads as buildings dissolving into haze rather than a chart. */}
      <path
        d="M0,470
           Q80,458 160,466
           T340,462
           C400,448 420,436 460,434
           C500,432 500,444 540,444
           C580,444 590,432 630,430
           T760,436
           Q820,440 880,432
           C920,427 930,440 970,440
           C1010,440 1015,428 1055,426
           T1180,432
           Q1260,438 1340,428
           C1380,423 1395,434 1440,434
           Q1520,434 1600,424
           L1600,620 L0,620 Z"
        fill="#93A9CE"
        opacity="0.42"
      />

      {/* Soft haze band blending the far and mid layers together --
          atmospheric perspective instead of a hard edge between shapes. */}
      <ellipse
        cx="800"
        cy="520"
        rx="900"
        ry="60"
        fill="#C7D6EC"
        opacity="0.4"
        filter="url(#hs-haze-blur)"
      />

      {/* Layer 2 (mid): smoother, gently rolling contour -- amplitude and
          height both reduced from the earlier sharp-peaked version so the
          mountain layer no longer dominates the frame. */}
      <path
        d="M0,540
           Q120,524 240,534
           T480,528
           Q560,522 640,532
           T860,526
           Q960,520 1060,530
           T1280,524
           Q1400,518 1600,528
           L1600,660 L0,660 Z"
        fill="#7691BE"
        opacity="0.55"
      />

      {/* Layer 3 (nearest): the closest contour, still soft-curved, sitting
          just above the ground line. Lower and gentler than the previous
          version's tall triangular peaks. */}
      <path
        d="M0,600
           Q160,588 320,598
           T640,594
           Q760,588 880,596
           T1120,592
           Q1280,586 1600,598
           L1600,700 L0,700 Z"
        fill="#5E76A8"
        opacity="0.62"
      />

      {/* Foreground ground -- fades in from transparent (blending into the
          nearest mountain layer above) rather than a hard rectangle edge. */}
      <rect x="0" y="690" width="1600" height="210" fill="url(#hs-ground)" />

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
      {/* Decorative legal/tech/society lockup -- set inside a soft ambient
          glow (the same blur filter used for clouds/sun) rather than on
          flat empty sky, so it reads as part of the atmosphere. Lower
          contrast than the first attempt, which read as a standalone logo
          pasted over empty white space once the hero's light wash was
          applied on top. */}
      {/* -------------------------------------------------------------- */}
      <ellipse
        cx="1290"
        cy="170"
        rx="160"
        ry="120"
        fill="url(#hs-emblem-glow)"
        filter="url(#hs-soft-blur)"
      />
      <g transform="translate(1290,150)">
        <g
          stroke="#28426B"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.42"
        >
          <line x1="0" y1="-34" x2="0" y2="24" />
          <line x1="-38" y1="-20" x2="38" y2="-20" />
          <path d="M-38,-20 L-54,14 A18,11 0 0 0 -22,14 Z" />
          <path d="M38,-20 L22,14 A18,11 0 0 0 54,14 Z" />
          <line x1="-24" y1="30" x2="24" y2="30" />
          <line x1="0" y1="24" x2="0" y2="30" />
          <circle cx="0" cy="-34" r="4" fill="#28426B" stroke="none" />
        </g>
        <text
          x="0"
          y="76"
          textAnchor="middle"
          fill="#28426B"
          fontSize="15"
          fontWeight="700"
          letterSpacing="2.5"
          opacity="0.46"
        >
          ХУУЛЬ
        </text>
        <text
          x="0"
          y="98"
          textAnchor="middle"
          fill="#28426B"
          fontSize="15"
          fontWeight="700"
          letterSpacing="2.5"
          opacity="0.36"
        >
          ТЕХНОЛОГИ
        </text>
        <text
          x="0"
          y="120"
          textAnchor="middle"
          fill="#28426B"
          fontSize="15"
          fontWeight="700"
          letterSpacing="2.5"
          opacity="0.27"
        >
          НИЙГЭМ
        </text>
      </g>
    </svg>
  );
}
