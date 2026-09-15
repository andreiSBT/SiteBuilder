/**
 * The mark: a page being built out of blocks — a hero bar across the top and
 * two cards under it, with the last one still being dropped into place.
 *
 * Three shapes only, so it still reads at 16px in a browser tab.
 */
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Sitebuilder"
    >
      <defs>
        <linearGradient id="sb-logo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#sb-logo)" />
      {/* the hero block */}
      <rect x="7" y="7.5" width="18" height="6.5" rx="2" fill="#fff" />
      {/* two cards below it */}
      <rect x="7" y="17" width="8" height="7.5" rx="2" fill="#fff" fillOpacity="0.95" />
      {/* the one still being placed, nudged up and faded */}
      <rect x="17" y="16" width="8" height="7.5" rx="2" fill="#fff" fillOpacity="0.55" />
    </svg>
  );
}
