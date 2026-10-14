interface DragonTigerWinRateBarProps {
  tigerPercent: number;
  dragonPercent: number;
}

export function DragonTigerWinRateBar({ tigerPercent, dragonPercent }: DragonTigerWinRateBarProps) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-1 flex justify-between text-sm font-semibold">
        <span className="text-red-500">เสือ {tigerPercent}%</span>
        <span className="text-blue-500">มังกร {dragonPercent}%</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full border border-slate-600/40 bg-slate-800">
        <div className="bg-gradient-to-r from-red-600 to-red-500 transition-all" style={{ width: `${tigerPercent}%` }} />
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 transition-all" style={{ width: `${dragonPercent}%` }} />
      </div>
    </div>
  );
}
