interface BeadPlateProps {
  rounds: Array<{ result: string }>;
}

export function BeadPlate({ rounds }: BeadPlateProps) {
  const rows: Array<Array<string>> = Array.from({ length: 6 }, () => []);
  rounds.forEach((round, index) => {
    const mark = round.result === 'player' ? 'P' : round.result === 'banker' ? 'B' : 'T';
    rows[index % 6].push(mark);
  });

  const palette = {
    P: 'border-blue-300 bg-blue-600 text-white',
    B: 'border-red-300 bg-red-600 text-white',
    T: 'border-emerald-300 bg-emerald-600 text-white',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Bead Plate</div>
        <div className="text-[10px] text-slate-600">P / B / T</div>
      </div>
      <div className="space-y-2">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex min-h-10 gap-2">
            {row.map((cell, cellIndex) => (
              <div
                key={`${rowIndex}-${cellIndex}`}
                className={`flex h-9 w-9 items-center justify-center rounded-md border text-[11px] font-semibold ${palette[cell as keyof typeof palette] ?? 'border-slate-200 bg-slate-100 text-slate-700'}`}
                title={cell === 'P' ? 'ผู้เล่น' : cell === 'B' ? 'เจ้ามือ' : 'เสมอ'}
              >
                {cell}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
