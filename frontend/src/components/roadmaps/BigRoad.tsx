interface BigRoadProps {
  rounds: Array<{ result: string }>;
}

export function BigRoad({ rounds }: BigRoadProps) {
  const rows: Array<Array<string | null>> = [];
  (rounds || []).forEach((round) => {
    const cell = round.result === 'player' ? 'P' : round.result === 'banker' ? 'B' : 'T';
    const current = rows[rows.length - 1];
    if (!current || current.length >= 6) {
      rows.push([cell]);
    } else {
      current.push(cell);
    }
  });

  const palette = {
    P: 'border-blue-300 bg-blue-600 text-white shadow-sm shadow-blue-100',
    B: 'border-red-300 bg-red-600 text-white shadow-sm shadow-red-100',
    T: 'border-emerald-300 bg-emerald-600 text-white shadow-sm shadow-emerald-100',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Big Road</div>
        <div className="flex items-center gap-2 text-[10px] text-slate-600">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />P</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-600" />B</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />T</span>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {rows.flatMap((row, rowIndex) =>
          row.map((cell, cellIndex) => (
            <div
              key={`${rowIndex}-${cellIndex}`}
              className={`flex h-10 items-center justify-center rounded-md border text-[11px] font-semibold ${palette[cell as keyof typeof palette] ?? 'border-slate-200 bg-slate-100 text-slate-700'}`}
              title={cell === 'P' ? 'ผู้เล่น' : cell === 'B' ? 'เจ้ามือ' : 'เสมอ'}
            >
              {cell}
            </div>
          )),
        )}
      </div>
    </div>
  );
}
