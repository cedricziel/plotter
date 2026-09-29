import { Fragment } from 'react';
import { kindLabel, seamarkRows, symbolSpec } from '../core/seamark-symbol';
import type { Seamark } from '../core/waterway-data';
import { symbolSvg } from '../map/seamark-svg';
import type { Theme } from '../map/style';
import { t } from '../i18n';
import { seamarkKind, seamarkRowLabel } from '../i18n/texts';
import { useLanguage } from './store';

/** The compact card for a tapped seamark: what it is, its name, colours, topmark and light. */
export function SeamarkCard({ seamark, theme, onClose }: { seamark: Seamark; theme: Theme; onClose: () => void }) {
  // Kept as an element in the destination bar's store, so it follows the language itself.
  useLanguage();
  const rows = seamarkRows(seamark);
  const symbol = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(symbolSvg(symbolSpec(seamark), theme))}`;
  return (
    <div className="dest-card seamark-card">
      <div className="dest-title">
        <span className="result-ico">
          <img src={symbol} alt="" width={32} height={32} />
        </span>
        <span className="result-text">
          <b>{seamarkKind(seamark, kindLabel(seamark))}</b>
        </span>
        <button className="btn big" aria-label={t('sheet.close')} onClick={onClose}>
          ✕
        </button>
      </div>
      {rows.length > 0 && (
        <dl className="dest-info">
          {rows.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{seamarkRowLabel(k)}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}
