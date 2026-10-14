import type { DragonTigerBetType, DragonTigerRound } from '../../types/dragonTiger';

export const CHIP_VALUES = [1000, 2000, 5000, 10000] as const;

export type ChipValue = (typeof CHIP_VALUES)[number];

export const BET_LABELS: Record<DragonTigerBetType, { th: string; payout: string }> = {
  tiger: { th: 'เสือ', payout: '1:1' },
  dragon: { th: 'มังกร', payout: '1:1' },
  flush: { th: 'ฟลัช', payout: '1:2' },
  tie: { th: 'เสมอ', payout: '1:8' },
  flush_tie: { th: 'ฟลัชเสมอ', payout: '1:70' },
};

export type BetSlip = Partial<Record<DragonTigerBetType, number>>;

export function totalStaked(slip: BetSlip): number {
  return Object.values(slip).reduce((sum, n) => sum + (n ?? 0), 0);
}

function betWins(type: DragonTigerBetType, round: DragonTigerRound): boolean {
  switch (type) {
    case 'tiger':
      return round.result === 'tiger';
    case 'dragon':
      return round.result === 'dragon';
    case 'tie':
      return round.result === 'tie';
    case 'flush':
      return !!round.flush && !round.flushTie;
    case 'flush_tie':
      return !!round.flushTie;
    default:
      return false;
  }
}

function payoutMultiplier(type: DragonTigerBetType): number {
  switch (type) {
    case 'tiger':
    case 'dragon':
      return 2;
    case 'tie':
      return 9;
    case 'flush':
      return 3;
    case 'flush_tie':
      return 71;
    default:
      return 0;
  }
}

/** Returns net wallet change (profit/loss) after settling all slips. */
export function settleBets(slip: BetSlip, round: DragonTigerRound): number {
  let net = 0;
  (Object.keys(slip) as DragonTigerBetType[]).forEach((type) => {
    const stake = slip[type] ?? 0;
    if (stake <= 0) return;
    if (betWins(type, round)) {
      net += stake * payoutMultiplier(type) - stake;
    } else {
      net -= stake;
    }
  });
  return net;
}
