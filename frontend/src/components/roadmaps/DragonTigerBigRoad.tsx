import type { DragonTigerRound } from '../../types/dragonTiger';
import { buildBigRoadGrid } from './dragonTigerRoadUtils';

interface DragonTigerBigRoadProps {
  rounds: DragonTigerRound[];
}

export function DragonTigerBigRoad({ rounds }: DragonTigerBigRoadProps) {
  const grid = buildBigRoadGrid(rounds);

  return (
    <div className="overflow-auto rounded border border-slate-300 bg-[#f4f6f8] p-2">
      <div className="inline-block min-w-full">
        {grid.map((row, rowIndex) => (
          <div key={rowIndex} className="flex">
            {row.map((cell, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center border border-slate-200/80 bg-white"
              >
                {cell ? (
                  <span className="relative flex h-5 w-5 items-center justify-center">
                    <span
                      className={`absolute inset-0 rounded-full border-[2.5px] ${
                        cell.side === 'dragon' ? 'border-blue-600' : 'border-red-600'
                      }`}
                    />
                    {cell.natural ? <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> : null}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
