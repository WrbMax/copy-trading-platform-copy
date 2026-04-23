/**
 * AlphaRoute Brand Logo Component — Premium Redesign v2
 *
 * Design language: Fintech-grade geometric precision
 * - Clean rounded-square base with deep space gradient
 * - Upward-trending route path with node dots (AI strategy path)
 * - Crisp gradient from deep teal to vivid emerald
 * - Subtle glow for premium depth
 */

interface AlphaRouteLogoProps {
  size?: number;
  className?: string;
}

export function AlphaRouteLogo({ size = 32, className = "" }: AlphaRouteLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="AlphaRoute"
    >
      <defs>
        <linearGradient id="ar2-bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#071c2e" />
          <stop offset="100%" stopColor="#0c2233" />
        </linearGradient>
        <linearGradient id="ar2-g1" x1="4" y1="44" x2="44" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00c896" />
          <stop offset="55%" stopColor="#00e5b0" />
          <stop offset="100%" stopColor="#5fffd8" />
        </linearGradient>
        <linearGradient id="ar2-border" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00e5b0" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#0099ff" stopOpacity="0.3" />
        </linearGradient>
        <filter id="ar2-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="ar2-dot-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Base: deep space background */}
      <rect width="48" height="48" rx="13" fill="url(#ar2-bg)" />

      {/* Subtle inner highlight at top */}
      <rect width="48" height="24" rx="13" fill="#ffffff" fillOpacity="0.025" />

      {/* Premium gradient border */}
      <rect
        x="0.8" y="0.8" width="46.4" height="46.4" rx="12.2"
        stroke="url(#ar2-border)"
        strokeWidth="1.6"
        fill="none"
      />

      {/* ── Chart route path: the core mark ── */}
      {/* Dashed baseline grid line (subtle) */}
      <line x1="8" y1="36" x2="40" y2="36" stroke="#00e5b0" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="2 3" />

      {/* Main ascending route line */}
      <path
        d="M9 35 L18 22 L27 27 L39 11"
        stroke="url(#ar2-g1)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        filter="url(#ar2-glow)"
      />

      {/* Filled area under the curve for depth */}
      <path
        d="M9 35 L18 22 L27 27 L39 11 L39 36 L9 36 Z"
        fill="url(#ar2-g1)"
        fillOpacity="0.07"
      />

      {/* Node: inflection point (the "alpha" moment) */}
      <circle cx="18" cy="22" r="3" fill="url(#ar2-g1)" filter="url(#ar2-dot-glow)" />
      <circle cx="18" cy="22" r="1.3" fill="#ffffff" fillOpacity="0.95" />

      {/* Node: secondary pivot */}
      <circle cx="27" cy="27" r="2.2" fill="url(#ar2-g1)" opacity="0.85" />
      <circle cx="27" cy="27" r="0.9" fill="#ffffff" fillOpacity="0.8" />

      {/* Terminal node: destination (top-right) */}
      <circle cx="39" cy="11" r="3.5" fill="url(#ar2-g1)" filter="url(#ar2-dot-glow)" />
      <circle cx="39" cy="11" r="1.5" fill="#ffffff" fillOpacity="0.98" />

      {/* Arrow head at terminal */}
      <path
        d="M34.5 9 L39 11 L37 15.5"
        stroke="url(#ar2-g1)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        filter="url(#ar2-glow)"
      />

      {/* Start node */}
      <circle cx="9" cy="35" r="1.8" fill="url(#ar2-g1)" opacity="0.5" />
    </svg>
  );
}

/**
 * Full brand lockup: Logo + AlphaRoute wordmark
 * Responsive: compact mode hides subtitle on mobile.
 */
interface AlphaRouteBrandProps {
  logoSize?: number;
  showSubtitle?: boolean;
  subtitle?: string;
  className?: string;
  onClick?: () => void;
  compact?: boolean;
}

export function AlphaRouteBrand({
  logoSize = 36,
  showSubtitle = false,
  subtitle,
  className = "",
  onClick,
  compact = false,
}: AlphaRouteBrandProps) {
  const fontSize = Math.max(14, Math.round(logoSize * 0.46));
  const subFontSize = Math.max(9, Math.round(logoSize * 0.24));

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-xl px-1 py-0.5 transition-all hover:opacity-90 active:scale-95 ${className}`}
      aria-label="AlphaRoute - Go to home"
      type="button"
    >
      <AlphaRouteLogo
        size={logoSize}
        className="flex-shrink-0 transition-transform group-hover:scale-105 duration-200"
      />
      <div className="flex flex-col items-start min-w-0">
        {/* Wordmark */}
        <span
          className="font-bold leading-tight tracking-tight select-none"
          style={{ fontSize }}
        >
          <span
            style={{
              background: "linear-gradient(135deg, #00e5b0 0%, #5fffd8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Alpha
          </span>
          <span className="text-foreground">Route</span>
        </span>
        {/* Subtitle — hidden on mobile when compact */}
        {showSubtitle && subtitle && (
          <span
            className={`text-muted-foreground leading-none mt-0.5 tracking-wide select-none ${
              compact ? "hidden sm:block" : ""
            }`}
            style={{ fontSize: subFontSize }}
          >
            {subtitle}
          </span>
        )}
      </div>
    </button>
  );
}
