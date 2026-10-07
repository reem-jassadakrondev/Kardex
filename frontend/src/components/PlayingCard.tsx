interface PlayingCardProps {
  card: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

const suitMap: Record<string, { symbol: string; color: string }> = {
  H: { symbol: '♥', color: 'text-red-600' },
  D: { symbol: '♦', color: 'text-red-600' },
  S: { symbol: '♠', color: 'text-slate-900' },
  C: { symbol: '♣', color: 'text-slate-900' },
};

export function PlayingCard({ card, selected = false, onClick, disabled = false }: PlayingCardProps) {
  const suit = card.slice(0, 1);
  const rank = card.slice(1);
  const suitMeta = suitMap[suit] ?? { symbol: '', color: 'text-slate-900' };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'relative flex h-20 w-14 flex-col items-center justify-between rounded-xl border p-1.5 shadow-sm transition-all duration-150',
        selected
          ? 'border-amber-300 bg-slate-900 text-white shadow-md ring-2 ring-amber-200/80'
          : 'border-slate-200 bg-white text-slate-900 hover:-translate-y-0.5 hover:border-slate-300',
        disabled ? 'cursor-default opacity-50' : 'cursor-pointer',
      ].join(' ')}
      aria-label={`ไพ่ ${card}`}
    >
      {selected ? (
        <span className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-300 text-[8px] font-bold text-slate-900">
          ✓
        </span>
      ) : null}
      <span className={`self-start text-[10px] font-bold ${selected ? 'text-white' : suitMeta.color}`}>{rank}</span>
      <span className={`text-xl font-black ${selected ? 'text-white' : suitMeta.color}`}>{suitMeta.symbol}</span>
      <span className={`self-end rotate-180 text-[10px] font-bold ${selected ? 'text-white' : suitMeta.color}`}>{rank}</span>
    </button>
  );
}
