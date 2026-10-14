import type { DragonTigerRound } from '../../types/dragonTiger';
import { DragonTigerBeadPlate } from './DragonTigerBeadPlate';
import { DragonTigerBigRoad } from './DragonTigerBigRoad';
import { DragonTigerStatsPanel } from './DragonTigerStatsPanel';

interface DragonTigerScoreboardProps {
  rounds: DragonTigerRound[];
}

export function DragonTigerScoreboard({ rounds }: DragonTigerScoreboardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_160px]">
        <div className="space-y-2">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
            <DragonTigerBeadPlate rounds={rounds} />
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-1">
            <DragonTigerBigRoad rounds={rounds} />
          </div>
        </div>
        <DragonTigerStatsPanel rounds={rounds} />
      </div>
    </div>
  );
}