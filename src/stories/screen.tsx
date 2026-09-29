import type { ReactNode } from 'react';

/**
 * A phone-sized screen for parts the app pins to the viewport (sheet, destination bar, toast, modal): the transform
 * makes it their containing block, so they sit at its edges instead of the page's.
 */
export function Screen({ children, height = 640 }: { children: ReactNode; height?: number }) {
  return (
    <div
      style={{ position: 'relative', height, overflow: 'hidden', transform: 'translateZ(0)', background: 'var(--bg)' }}
    >
      {children}
    </div>
  );
}
