/**
 * Institutional visual for the public hero: a golden-hour sky over distant
 * Mongolian mountains and a low city silhouette, with a monumental
 * stone-and-glass institutional building in the foreground -- a grand
 * entrance (steps, pilasters, a pediment with a small carved justice
 * emblem) supporting a tapered modern glass tower above it.
 *
 * No licensed photograph of a real building exists in this repository, and
 * none is fetched from the network (checked first -- only brand marks and
 * the QPay QR code exist under public/, confirmed again for this rebuild).
 * This is a deliberately higher-fidelity illustration than earlier
 * attempts, built to read as architecture rather than as an abstract
 * pattern:
 *  - the tower's glass is a genuine grid of individual windows (both
 *    horizontal AND vertical divisions -- floors and bays), never a single
 *    repeated row of thin vertical or wide horizontal elements, so it
 *    cannot read as bars or as flat translucent blocks;
 *  - stone (base, pilasters, pediment, cornice) and glass (tower face) are
 *    visually distinct materials, not one flat surface;
 *  - the justice emblem is a small carved medallion set into the pediment
 *    tympanum, not a giant free-floating icon;
 *  - sky, sun glow, soft clouds, layered mountains, a faint city skyline
 *    and a diagonal glass sun-glint build real atmospheric depth instead
 *    of a flat gradient field.
 *
 * The viewBox is landscape (1600x900), matching the actual wide/short
 * shape of the hero container, with the building's full height sitting
 * near the vertical center of the canvas -- with a portrait canvas
 * (the previous attempt), preserveAspectRatio="slice" against a wide
 * container cropped out almost the entire building (only sky remained
 * visible), which is why the entrance/base disappeared in QA. Landscape
 * geometry keeps the whole building in frame at every breakpoint.
 *
 * Purely decorative (aria-hidden), not a claim to depict any real place.
 */

const TOWER_GRID_COLUMNS = 6;
const TOWER_GRID_ROWS = 13;
const TOWER_GRID_X0 = 56;
const TOWER_GRID_X1 = 366;
const TOWER_GRID_Y0 = 58;
const TOWER_GRID_Y1 = 528;
const WINDOW_WIDTH = 36;
const WINDOW_HEIGHT = 24;

const TOWER_WINDOWS = Array.from(
  { length: TOWER_GRID_COLUMNS * TOWER_GRID_ROWS },
  (_, index) => {
    const row = Math.floor(index / TOWER_GRID_COLUMNS);
    const col = index % TOWER_GRID_COLUMNS;
    const cellWidth = (TOWER_GRID_X1 - TOWER_GRID_X0) / TOWER_GRID_COLUMNS;
    const cellHeight = (TOWER_GRID_Y1 - TOWER_GRID_Y0) / TOWER_GRID_ROWS;
    const x = TOWER_GRID_X0 + col * cellWidth + (cellWidth - WINDOW_WIDTH) / 2;
    const y = TOWER_GRID_Y0 + row * cellHeight + (cellHeight - WINDOW_HEIGHT) / 2;
    // Deterministic, non-repeating shade pattern -- some panes catch the
    // evening light (warm, brighter), most sit in cool glass shadow, a few
    // read as darker interior floors. Never uniform, never striped.
    const shade = (row * 3 + col * 5) % 7;
    const fill = shade < 2 ? "#FFF3D6" : shade < 5 ? "#CBDDF4" : "#3C4E76";
    const opacity = shade < 2 ? 0.65 : shade < 5 ? 0.32 : 0.22;
    return { key: index, x, y, fill, opacity };
  },
);

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
          <stop offset="100%" stopColor="#EDE4CE" />
        </linearGradient>
        <radialGradient id="hs-sun-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF6DF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FFF6DF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hs-sun-disc" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFDF4" />
          <stop offset="100%" stopColor="#FFE8AE" />
        </radialGradient>
        <linearGradient id="hs-tower-face" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#EFF4FC" />
          <stop offset="55%" stopColor="#D2DFF2" />
          <stop offset="100%" stopColor="#9FB3D6" />
        </linearGradient>
        <linearGradient id="hs-tower-shadow-face" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7488B4" />
          <stop offset="100%" stopColor="#4E608C" />
        </linearGradient>
        <linearGradient id="hs-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E7E1D2" />
          <stop offset="100%" stopColor="#C4BCA6" />
        </linearGradient>
        <linearGradient id="hs-stone-shadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B6AD93" />
          <stop offset="100%" stopColor="#948A6E" />
        </linearGradient>
        <linearGradient id="hs-entrance-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#33456E" />
          <stop offset="100%" stopColor="#18233D" />
        </linearGradient>
        <radialGradient id="hs-emblem" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#E7D6A0" />
          <stop offset="100%" stopColor="#9C7B34" />
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

      {/* Sun -- soft halo, then a defined disc -- positioned clear of the
          building's silhouette (the tower group sits at x>=1024) so the
          disc itself is never painted over by the tower drawn later; the
          halo may bleed behind it, which reads as atmospheric glow rather
          than hiding the sun outright. */}
      <circle cx="860" cy="95" r="220" fill="url(#hs-sun-halo)" />
      <circle cx="860" cy="95" r="220" fill="url(#hs-sun-halo)" filter="url(#hs-soft-blur)" />
      <circle cx="860" cy="95" r="34" fill="url(#hs-sun-disc)" />

      {/* Soft high clouds */}
      <g fill="#FFFFFF" filter="url(#hs-soft-blur)">
        <ellipse cx="300" cy="130" rx="150" ry="22" opacity="0.5" />
        <ellipse cx="640" cy="90" rx="120" ry="18" opacity="0.4" />
        <ellipse cx="120" cy="210" rx="100" ry="16" opacity="0.35" />
        <ellipse cx="980" cy="170" rx="110" ry="16" opacity="0.3" />
      </g>

      {/* Distant mountain silhouettes, layered for atmospheric perspective */}
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

      {/* Faint distant city silhouette beside the institutional building */}
      <g fill="#233A63" opacity="0.55">
        <rect x="520" y="606" width="30" height="74" />
        <rect x="562" y="580" width="34" height="100" />
        <rect x="606" y="626" width="24" height="54" />
        <rect x="642" y="596" width="30" height="84" />
        <rect x="686" y="614" width="26" height="66" />
        <rect x="748" y="632" width="28" height="48" />
      </g>

      {/* Foreground ground, drawn before the building so the tower's own
          steps sit cleanly on top of it and only the sides remain visible. */}
      <rect x="0" y="770" width="1600" height="130" fill="url(#hs-ground)" />

      {/* ---------------------------------------------------------------- */}
      {/* Institutional building: stone entrance + glass tower -- scaled up
          (wider more than taller) so it reads as a monumental structure
          filling the right portion of the frame, not a small silhouette
          adrift in empty sky. */}
      {/* ---------------------------------------------------------------- */}
      <g transform="translate(1080,10) scale(1.25,1.1)">
        {/* entrance steps, widest at the bottom */}
        <rect x="-96" y="742" width="592" height="14" fill="url(#hs-stone-shadow)" />
        <rect x="-72" y="728" width="544" height="14" fill="url(#hs-stone)" />
        <rect x="-48" y="714" width="496" height="14" fill="url(#hs-stone-shadow)" />

        {/* base plinth */}
        <rect x="-24" y="656" width="448" height="58" fill="url(#hs-stone)" />

        {/* pilasters flanking the entrance -- exactly two, not a repeated
            colonnade, read clearly as architectural supports either side
            of a doorway rather than as bars. */}
        <rect x="96" y="470" width="34" height="186" fill="url(#hs-stone)" />
        <rect x="270" y="470" width="34" height="186" fill="url(#hs-stone)" />

        {/* recessed entrance glass doors between the pilasters */}
        <rect x="140" y="500" width="120" height="156" fill="url(#hs-entrance-glass)" />
        <rect x="196" y="500" width="8" height="156" fill="#0E1830" opacity="0.6" />

        {/* pediment above the entrance */}
        <path d="M76,470 L324,470 L200,398 Z" fill="url(#hs-stone)" />
        <path d="M76,470 L324,470 L316,478 L84,478 Z" fill="url(#hs-stone-shadow)" />

        {/* carved justice emblem set into the pediment tympanum -- small,
            contained, not a dominant free-floating icon. */}
        <circle cx="200" cy="446" r="26" fill="url(#hs-emblem)" />
        <g
          transform="translate(200,446)"
          stroke="#5B441C"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        >
          <line x1="0" y1="-12" x2="0" y2="11" />
          <line x1="-14" y1="-5" x2="14" y2="-5" />
          <path d="M-14,-5 L-20,9 A9,6 0 0 0 -8,9 Z" />
          <path d="M14,-5 L8,9 A9,6 0 0 0 20,9 Z" />
          <circle cx="0" cy="-8" r="2.6" fill="#5B441C" stroke="none" />
        </g>

        {/* cornice ledge, wider than the tower, separating base from tower */}
        <rect x="10" y="392" width="380" height="16" fill="url(#hs-stone)" />
        <rect x="10" y="404" width="380" height="6" fill="url(#hs-stone-shadow)" />

        {/* tower shadow return face (right side, depth) */}
        <path d="M368,392 L382,20 L410,34 L396,392 Z" fill="url(#hs-tower-shadow-face)" />

        {/* main tower mass, gently tapered, rising from the cornice */}
        <path d="M32,392 L46,20 L366,20 L368,392 Z" fill="url(#hs-tower-face)" />

        {/* window grid -- real floors x real bays, never a stripe */}
        {TOWER_WINDOWS.map((w) => (
          <rect
            key={w.key}
            x={w.x}
            y={w.y}
            width={WINDOW_WIDTH}
            height={WINDOW_HEIGHT}
            fill={w.fill}
            opacity={w.opacity}
          />
        ))}

        {/* diagonal sun-glint across the glass -- subtle, photographic */}
        <polygon points="70,60 150,60 300,392 220,392" fill="#FFFFFF" opacity="0.1" />

        {/* rooftop parapet cap */}
        <rect x="40" y="10" width="320" height="14" fill="url(#hs-stone)" />
        <line x1="200" y1="10" x2="200" y2="-26" stroke="#B6AD93" strokeWidth="3" />
        <circle cx="200" cy="-30" r="4" fill="#B6AD93" />
      </g>

      {/* Organic foreground tree canopies for scale and warmth -- kept
          clear of the building's footprint (world x 1096-1544). Each has
          a trunk and a lighter rim-lit highlight so they read as trees
          rather than dark blobs. */}
      <g>
        <rect x="415" y="820" width="10" height="46" fill="#0A1730" />
        <ellipse cx="420" cy="800" rx="82" ry="64" fill="url(#hs-tree-canopy)" />
        <ellipse cx="398" cy="778" rx="30" ry="20" fill="#3E5C8C" opacity="0.55" />

        <rect x="485" y="850" width="12" height="54" fill="#0A1730" />
        <ellipse cx="490" cy="836" rx="100" ry="76" fill="url(#hs-tree-canopy)" />
        <ellipse cx="462" cy="808" rx="36" ry="24" fill="#3E5C8C" opacity="0.55" />

        <rect x="816" y="830" width="9" height="42" fill="#0A1730" />
        <ellipse cx="820" cy="812" rx="70" ry="56" fill="url(#hs-tree-canopy)" />
        <ellipse cx="800" cy="792" rx="26" ry="17" fill="#3E5C8C" opacity="0.55" />
      </g>

      {/* Single lamp post for a sense of real scale (not repeated) */}
      <g stroke="#0B1F3A" strokeWidth="3" opacity="0.55">
        <line x1="700" y1="856" x2="700" y2="780" />
      </g>
      <circle cx="700" cy="776" r="7" fill="#FFE8AE" opacity="0.8" />
    </svg>
  );
}
