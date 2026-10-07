interface CardMatrixProps {
  remaining: Record<string, number>;
}

const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function CardMatrix({ remaining }: CardMatrixProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="grid grid-cols-6 gap-2 p-3 text-center text-xs text-slate-600 sm:grid-cols-6">
        {ranks.map((rank) => (
          <div key={rank} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
            <div className="font-medium text-slate-500">{rank}</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{remaining[rank] ?? 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
