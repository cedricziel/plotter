import type { ReactNode } from 'react';

export const DEVICES = {
  'phone-portrait': [390, 844],
  'phone-small': [360, 740],
  'phone-landscape': [844, 390],
  'tablet-portrait': [820, 1180],
  'tablet-landscape': [1180, 820],
} as const;

export type DeviceName = keyof typeof DEVICES;

/**
 * A phone or tablet screen, standing in for the viewport: the layout's size container (`plotter`, which the CSS's
 * container queries and cq units read) and, through its transform, the containing block of everything the app pins to
 * the viewport (sheet, destination bar, toast, modal, a whole `PlotterScreen`). `fit` lets inline parts such as the
 * instrument bar set the height.
 */
export function Device({
  device = 'phone-portrait',
  fit = false,
  theme,
  children,
}: {
  device?: DeviceName;
  fit?: boolean;
  theme?: 'day' | 'night';
  children: ReactNode;
}) {
  const [width, height] = DEVICES[device];
  return (
    <div
      data-theme={theme}
      style={{
        position: 'relative',
        width,
        height: fit ? undefined : height,
        overflow: 'hidden',
        transform: 'translateZ(0)',
        container: `plotter / ${fit ? 'inline-size' : 'size'}`,
        background: 'var(--bg)',
        color: 'var(--fg)',
      }}
    >
      {children}
    </div>
  );
}
