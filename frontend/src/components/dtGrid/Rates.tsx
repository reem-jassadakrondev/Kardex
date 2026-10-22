import { cellMeta } from './colors';

interface RatesProps {
  keys: string[];
  counts: Record<string, number>;
  percentages: Record<string, number>;
  size: 'lg' | 'sm';
}

/** One bar per color: % and count, the most frequent highlighted. */
export function Rates({ keys, counts, percentages, size }: RatesProps) {
  const total = keys.reduce((sum, k) => sum + (counts[k] || 0), 0);
  const top = total ? Math.max(...keys.map((k) => counts[k] || 0)) : -1;
  return (
    <ul className={size === 'sm' ? 'dtg-rates dtg-rates--sm' : 'dtg-rates'}>
      {keys.map((key) => {
        const meta = cellMeta(key);
        const pct = percentages[key] || 0;
        const count = counts[key] || 0;
        if (!meta) return null;
        return (
          <li key={key} className={count === top && top > 0 ? 'dtg-rate dtg-rate--top' : 'dtg-rate'}>
            <span className={size === 'sm' ? 'dtg-dot' : 'dtg-dot dtg-dot--lg'} style={{ backgroundColor: meta.bg, color: meta.fg }}>
              {key}
            </span>
            <span className="dtg-rate__bar">
              <span className="dtg-rate__fill" style={{ width: `${pct}%`, backgroundColor: meta.bg }} />
            </span>
            <span className="dtg-rate__pct">{pct.toFixed(1)}%</span>
            <span className="dtg-rate__count">{count.toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}
