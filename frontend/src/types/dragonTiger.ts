export type DragonTigerSide = 'dragon' | 'tiger' | 'tie';

export type DragonTigerBetType = 'tiger' | 'dragon' | 'flush' | 'tie' | 'flush_tie';

export interface DragonTigerRound {
  result: DragonTigerSide;
  natural?: boolean;
  flush?: boolean;
  flushTie?: boolean;
  dragonCard?: string;
  tigerCard?: string;
}

export interface DragonTigerShoeState {
  total_cards_remaining: number;
  cards_remaining: Record<string, number>;
  probability: { dragon: number; tiger: number; tie: number };
}

export interface DragonTigerRoundStats {
  dragon: number;
  tiger: number;
  tie: number;
  total: number;
  flush: number;
  flushTie: number;
}
