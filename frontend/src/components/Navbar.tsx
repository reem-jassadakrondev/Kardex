import { Activity } from 'lucide-react';

export function Navbar() {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 pb-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">วิเคราะห์แบบเรียลไทม์</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Kardex</h1>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 shadow-sm">
        <Activity className="h-3.5 w-3.5" />
        ออนไลน์
      </div>
    </header>
  );
}
