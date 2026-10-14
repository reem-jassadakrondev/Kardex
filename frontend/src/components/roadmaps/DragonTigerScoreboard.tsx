import type { DragonTigerRound } from '../../types/dragonTiger';
import { DragonTigerBeadPlate } from './DragonTigerBeadPlate';
import { DragonTigerBigRoad } from './DragonTigerBigRoad';
import { DragonTigerStatsPanel } from './DragonTigerStatsPanel';

interface DragonTigerScoreboardProps {
  rounds: DragonTigerRound[];
}

export function DragonTigerScoreboard({ rounds }: DragonTigerScoreboardProps) {
  return (
    <div className="rounded-xl border border-amber-900/50 bg-gradient-to-b from-[#6b4a32] to-[#4a3224] p-3 shadow-lg">
      <div className="grid gap-3 lg:grid-cols-[1fr_140px]">
        <div className="space-y-2">
          <div className="rounded-lg bg-[#2a1d15]/60 p-2">
            <DragonTigerBeadPlate rounds={rounds} />
          </div>
          <div className="rounded-lg bg-white/95 p-1">
            <DragonTigerBigRoad rounds={rounds} />
          </div>
        </div>
        <DragonTigerStatsPanel rounds={rounds} />
      </div>
    </div>
  );
}
