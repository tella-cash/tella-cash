import { USAGE_SCENES, type UsageScene } from "@/lib/data/usage";

/**
 * EverydayUsageSection
 *
 * Four scenarios where upay slots into daily life. Each card has a custom
 * SVG vignette at the top showing the setting, a "Sent ₦X to Y" mini-receipt
 * tag, and a paragraph describing the moment.
 *
 * We render the scene art inline because each scene gets its own composition
 * and there's no benefit to abstracting them — they're meant to feel hand-drawn.
 */
export function EverydayUsageSection() {
  return (
    <section id="use-cases" className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-end justify-between gap-6 md:flex-row md:items-end">
          <h2 className="max-w-2xl font-display text-4xl font-medium leading-[1.05] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
            Where UPAY fits in <em className="not-italic text-upay-700">everyday life.</em>
          </h2>
          <p className="max-w-sm text-ink-700 md:text-right">
            USDC doesn't spend itself. Here's how Nigerians are turning their
            crypto into Naira for the moments that matter.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {USAGE_SCENES.map((scene) => (
            <UsageCard key={scene.id} scene={scene} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Single scenario card. Wraps the scene-specific SVG art with a consistent
 * frame: rounded corners, scene label, sent-receipt tag.
 */
function UsageCard({ scene }: { scene: UsageScene }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl bg-cream-100 ring-1 ring-upay-900/5">
      <div className="relative aspect-[4/5] overflow-hidden">
        <SceneArt variant={scene.scene} />

        {/* Mini receipt overlay */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-cream-50/95 px-3 py-1.5 text-xs shadow-soft backdrop-blur-sm">
          <span className="text-upay-700">↙</span>
          <span className="font-medium text-ink-900">Received {scene.amount}</span>
          <span className="text-ink-500">via {scene.recipient}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-lg font-medium text-ink-900">
          {scene.title}
        </h3>
        <p className="mt-1.5 text-sm text-ink-700">{scene.description}</p>
      </div>
    </article>
  );
}

/**
 * Per-scene illustration. Stylized, flat, high-contrast — built from layered
 * blocks of brand-palette color so each tile reads as part of one set rather
 * than four random photos.
 */
function SceneArt({ variant }: { variant: UsageScene["scene"] }) {
  switch (variant) {
    case "street-food":
      return <StreetFoodArt />;
    case "market":
      return <MarketArt />;
    case "split-bill":
      return <SplitBillArt />;
    case "barber":
      return <BarberArt />;
  }
}

/* ------------------------------------------------------------------ */
/* Scene art — each is a full-bleed SVG composition                   */
/* ------------------------------------------------------------------ */

function StreetFoodArt() {
  return (
    <svg viewBox="0 0 200 250" className="h-full w-full" aria-hidden="true">
      <rect width="200" height="250" fill="var(--color-upay-100)" />
      {/* Sun */}
      <circle cx="155" cy="55" r="28" fill="var(--color-accent-300)" />
      {/* Awning */}
      <path d="M20 90 Q100 60 180 90 L180 110 L20 110 Z" fill="var(--color-upay-700)" />
      <path
        d="M20 100 L40 115 L60 100 L80 115 L100 100 L120 115 L140 100 L160 115 L180 100"
        stroke="var(--color-cream-50)"
        strokeWidth="3"
        fill="none"
      />
      {/* Pot */}
      <ellipse cx="100" cy="170" rx="55" ry="12" fill="var(--color-upay-900)" />
      <path
        d="M48 170 Q48 215 68 220 L132 220 Q152 215 152 170 Z"
        fill="var(--color-ink-900)"
      />
      {/* Steam */}
      <path
        d="M80 145 q-5 -10 5 -18 q-5 -10 5 -18"
        stroke="var(--color-cream-50)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />
      <path
        d="M105 140 q-5 -12 5 -22 q-5 -10 5 -18"
        stroke="var(--color-cream-50)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
      <path
        d="M125 145 q-5 -10 5 -18"
        stroke="var(--color-cream-50)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
    </svg>
  );
}

function MarketArt() {
  return (
    <svg viewBox="0 0 200 250" className="h-full w-full" aria-hidden="true">
      <rect width="200" height="250" fill="var(--color-cream-100)" />
      {/* Rolling baskets */}
      <ellipse cx="50" cy="200" rx="40" ry="12" fill="var(--color-upay-700)" />
      <ellipse cx="50" cy="195" rx="40" ry="12" fill="var(--color-accent-400)" />
      <ellipse cx="150" cy="210" rx="42" ry="12" fill="var(--color-upay-800)" />
      <ellipse cx="150" cy="205" rx="42" ry="12" fill="var(--color-upay-300)" />
      {/* Tomatoes / produce stack */}
      <circle cx="40" cy="180" r="8" fill="var(--color-accent-500)" />
      <circle cx="55" cy="178" r="9" fill="var(--color-accent-500)" />
      <circle cx="68" cy="183" r="7" fill="var(--color-accent-400)" />
      <circle cx="48" cy="170" r="7" fill="var(--color-accent-400)" />
      {/* Greens */}
      <path d="M130 195 q5 -25 20 -25 q15 0 20 25 Z" fill="var(--color-upay-600)" />
      <path d="M155 195 q5 -20 18 -20 q12 0 16 20 Z" fill="var(--color-upay-700)" />
      {/* Sky tint */}
      <rect width="200" height="100" fill="var(--color-upay-100)" opacity="0.6" />
      <circle cx="40" cy="50" r="22" fill="var(--color-cream-50)" opacity="0.6" />
      <circle cx="80" cy="60" r="18" fill="var(--color-cream-50)" opacity="0.5" />
    </svg>
  );
}

function SplitBillArt() {
  return (
    <svg viewBox="0 0 200 250" className="h-full w-full" aria-hidden="true">
      <rect width="200" height="250" fill="var(--color-upay-50)" />
      {/* Table */}
      <ellipse cx="100" cy="200" rx="80" ry="20" fill="var(--color-upay-200)" />
      {/* Receipt */}
      <rect
        x="60"
        y="80"
        width="80"
        height="120"
        fill="var(--color-cream-50)"
        rx="4"
      />
      <path
        d="M60 200 L70 195 L80 200 L90 195 L100 200 L110 195 L120 200 L130 195 L140 200 L140 80 L60 80 Z"
        fill="var(--color-cream-50)"
      />
      <line x1="68" y1="100" x2="132" y2="100" stroke="var(--color-ink-900)" strokeWidth="2" />
      <line x1="68" y1="115" x2="120" y2="115" stroke="var(--color-ink-300)" strokeWidth="1.5" />
      <line x1="68" y1="125" x2="125" y2="125" stroke="var(--color-ink-300)" strokeWidth="1.5" />
      <line x1="68" y1="135" x2="115" y2="135" stroke="var(--color-ink-300)" strokeWidth="1.5" />
      <line x1="68" y1="155" x2="132" y2="155" stroke="var(--color-upay-700)" strokeWidth="2" />
      <text
        x="100"
        y="180"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontSize="18"
        fontWeight="600"
        fill="var(--color-upay-800)"
      >
        ₦30k
      </text>
      {/* Three forks/heads */}
      <circle cx="35" cy="60" r="14" fill="var(--color-upay-700)" />
      <circle cx="100" cy="45" r="14" fill="var(--color-accent-500)" />
      <circle cx="165" cy="60" r="14" fill="var(--color-upay-500)" />
    </svg>
  );
}

function BarberArt() {
  return (
    <svg viewBox="0 0 200 250" className="h-full w-full" aria-hidden="true">
      <rect width="200" height="250" fill="var(--color-upay-200)" />
      {/* Mirror frame */}
      <rect x="40" y="30" width="120" height="140" rx="8" fill="var(--color-cream-50)" />
      <rect x="48" y="38" width="104" height="124" rx="4" fill="var(--color-upay-700)" />
      {/* Person silhouette */}
      <circle cx="100" cy="110" r="32" fill="var(--color-ink-900)" />
      <path d="M70 165 Q100 135 130 165 L130 200 L70 200 Z" fill="var(--color-ink-900)" />
      {/* Barber pole */}
      <rect x="170" y="80" width="14" height="100" rx="4" fill="var(--color-cream-50)" />
      <path
        d="M170 95 L184 95 M170 110 L184 110 M170 125 L184 125 M170 140 L184 140 M170 155 L184 155"
        stroke="var(--color-upay-700)"
        strokeWidth="6"
      />
      {/* Floor */}
      <rect y="200" width="200" height="50" fill="var(--color-upay-300)" />
    </svg>
  );
}
