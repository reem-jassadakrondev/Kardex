import type { LucideIcon } from 'lucide-react';

interface GameCardProps {
  title: string;
  subtitle: string;
  active?: boolean;
  badge?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
}

export function GameCard({ title, subtitle, active = false, badge, actionLabel, onAction, icon: Icon }: GameCardProps) {
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm transition ${active ? 'border-slate-200 shadow-slate-200/60' : 'border-slate-200/80 bg-slate-50 text-slate-500'}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {Icon ? (
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'}`}>
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">เกม</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
          </div>
        </div>
        {badge ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-amber-700">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mb-5 text-sm text-slate-600">{subtitle}</p>
      {active ? (
        <button
          type="button"
          onClick={onAction}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          {actionLabel}
        </button>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-center text-sm font-medium text-slate-500">
          {badge || 'ไม่พร้อมใช้งาน'}
        </div>
      )}
    </div>
  );
}
