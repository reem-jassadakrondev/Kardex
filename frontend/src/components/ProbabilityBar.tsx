import type { Probabilities } from '../types/baccarat';

interface ProbabilityBarProps {
  probabilities: Probabilities;
}

export function ProbabilityBar({ probabilities }: ProbabilityBarProps) {
  const items = [
    { key: 'P', label: 'ผู้เล่น', value: probabilities.player, color: 'bg-blue-600' },
    { key: 'B', label: 'เจ้ามือ', value: probabilities.banker, color: 'bg-red-600' },
    { key: 'T', label: 'เสมอ', value: probabilities.tie, color: 'bg-emerald-600' },
  ];

  return (
    <div className="space-y-4">
      <div className="mb-3 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
        <span>สัญลักษณ์ผล</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />P</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-600" />B</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />T</span>
        </div>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200">
        {items.map((item) => (
          <div
            key={item.key}
            className={`${item.color} h-full`}
            style={{ width: `${item.value}%` }}
            title={`${item.key} (${item.label}): ${item.value}%`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs text-slate-600">
        {items.map((item) => (
          <div key={item.key} className="rounded-xl border border-slate-200 bg-stone-50 p-2 text-center">
            <div className="mb-1 flex items-center justify-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
              <span className="font-semibold text-slate-700">{item.key}</span>
              <span>{item.label}</span>
            </div>
            <strong className="text-sm text-slate-900">{item.value.toFixed(1)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
