/** A static stand-in for the MapLibre chart, so screens in Storybook show water, land and the boat. */
export function ChartBackdrop({ theme = 'day', route = false }: { theme?: 'day' | 'night'; route?: boolean }) {
  const night = theme === 'night';
  const land = night ? '#050000' : '#f2efe6';
  const water = night ? '#1a0000' : '#aad3df';
  const line = night ? '#b01818' : '#d6008a';
  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      aria-hidden="true"
    >
      <rect width="1000" height="1000" fill={land} />
      <path d="M-50 620 C 200 560, 300 700, 500 520 S 800 300, 1050 380" stroke={water} strokeWidth="120" fill="none" />
      <path d="M470 540 C 430 420, 520 300, 480 -50" stroke={water} strokeWidth="60" fill="none" />
      {route && (
        <path d="M250 610 C 330 640, 420 600, 500 520 S 700 360, 860 360" stroke={line} strokeWidth="8" fill="none" />
      )}
      <path d="M250 590 l12 32 l-12 -8 l-12 8 z" fill={night ? '#e01e1e' : '#111'} transform="rotate(70 250 610)" />
    </svg>
  );
}
