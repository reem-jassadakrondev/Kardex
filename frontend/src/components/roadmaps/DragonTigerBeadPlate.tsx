import type { DragonTigerRound, DragonTigerSide } from '../../types/dragonTiger';
import { buildBeadPlateRows } from './dragonTigerRoadUtils';

interface DragonTigerBeadPlateProps {
  rounds: DragonTigerRound[];
}

function beadStyle(side: DragonTigerSide) {
  if (side === 'dragon') return 'bg-blue-600 text-white';
  if (side === 'tiger') return 'bg-red-600 text-white';
  return 'bg-emerald-600 text-white';
}

function beadLabel(side: DragonTigerSide) {
  if (side === 'dragon') return 'D';
  if (side === 'tiger') return 'T';
  return '和';
}

export function DragonTigerBeadPlate({ rounds }: DragonTigerBeadPlateProps) {
  const rows = buildBeadPlateRows(rounds);

  return (
    <div className="overflow-auto">
      <div className="space-y-1">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex min-h-7 gap-1">
            {row.map((side, cellIndex) => (
              <div
                key={`${rowIndex}-${cellIndex}`}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${beadStyle(side)}`}
              >
                {beadLabel(side)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}