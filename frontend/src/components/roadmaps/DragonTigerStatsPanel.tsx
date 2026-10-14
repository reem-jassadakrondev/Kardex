import type { DragonTigerRound } from '../../types/dragonTiger';
import { computeRoundStats } from './dragonTigerRoadUtils';

interface DragonTigerStatsPanelProps {
  rounds: DragonTigerRound[];
}

const summaryRows = [
  { key: 'dragon' as const, label: 'มังกร', dotClass: 'bg-blue-600', textClass: 'text-blue-700' },
  { key: 'tiger' as const, label: 'เสือ', dotClass: 'bg-red-600', textClass: 'text-red-700' },
  { key: 'tie' as const, label: 'เสมอ', dotClass: 'bg-emerald-600', textClass: 'text-emerald-700' },
  { key: 'total' as const, label: 'ทั้งหมด', dotClass: 'bg-zinc-500', textClass: 'text-zinc-800' },
];

export function DragonTigerStatsPanel({ rounds }: DragonTigerStatsPanelProps) {
  const counts = computeRoundStats(rounds);

  return (
    <div className="min-w-[140px] rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-zinc-900">
      <div className="mb-3 text-xs font-medium tracking-wide text-zinc-500">สถิติรอบ</div>
      <ul className="space-y-2.5">
        {summaryRows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${row.dotClass}`} aria-hidden />
              <span className={`text-base font-medium ${row.textClass}`}>{row.label}</span>
            </span>
            <span className="text-lg font-bold tabular-nums text-zinc-900">{counts[row.key]}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-1.5 border-t border-zinc-200 pt-3 text-sm text-amber-700">
        <div className="flex justify-between font-medium">
          <span>ฟลัช</span>
          <span className="tabular-nums text-zinc-900">{counts.flush}</span>
        </div>
        <div className="flex justify-between font-medium">
          <span>ฟลัชเสมอ</span>
          <span className="tabular-nums text-zinc-900">{counts.flushTie}</span>
        </div>
      </div>
    </div>
  );
}