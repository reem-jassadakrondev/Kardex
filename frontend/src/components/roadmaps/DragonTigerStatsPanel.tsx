import type { DragonTigerRound } from '../../types/dragonTiger';
import { computeRoundStats } from './dragonTigerRoadUtils';

interface DragonTigerStatsPanelProps {
  rounds: DragonTigerRound[];
}

const summaryRows = [
  { key: 'dragon' as const, label: 'มังกร', dotClass: 'bg-blue-500', textClass: 'text-blue-600' },
  { key: 'tiger' as const, label: 'เสือ', dotClass: 'bg-red-500', textClass: 'text-red-600' },
  { key: 'tie' as const, label: 'เสมอ', dotClass: 'bg-emerald-500', textClass: 'text-emerald-600' },
  { key: 'total' as const, label: 'ทั้งหมด', dotClass: 'bg-slate-400', textClass: 'text-slate-800' },
];

export function DragonTigerStatsPanel({ rounds }: DragonTigerStatsPanelProps) {
  const counts = computeRoundStats(rounds);

  return (
    <div className="min-w-[120px] rounded-lg border border-amber-900/30 bg-[#3d2a1f]/90 px-3 py-2 text-sm text-amber-50">
      <div className="mb-2 text-[10px] uppercase tracking-widest text-amber-200/80">สถิติรอบ</div>
      <ul className="space-y-1.5">
        {summaryRows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${row.dotClass}`} aria-hidden />
              <span className={row.textClass}>{row.label}</span>
            </span>
            <span className="font-semibold tabular-nums text-white">{counts[row.key]}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-amber-900/40 pt-2 text-[11px] text-amber-100/90">
        <div className="flex justify-between">
          <span>ฟลัช</span>
          <span className="tabular-nums">{counts.flush}</span>
        </div>
        <div className="flex justify-between">
          <span>ฟลัชเสมอ</span>
          <span className="tabular-nums">{counts.flushTie}</span>
        </div>
      </div>
    </div>
  );
}
