export type GameResult = 'player' | 'banker' | 'tie';

export interface BaccaratRound {
  id?: string;
  round_number: number;
  player_cards: string[];
  banker_cards: string[];
  player_score: number;
  banker_score: number;
  result: GameResult;
  is_player_pair: boolean;
  is_banker_pair: boolean;
  is_natural: boolean;
  created_at?: string;
}

export interface Probabilities {
  player: number;
  banker: number;
  tie: number;
}

export interface ShoeState {
  total_cards_remaining: number;
  cards_remaining: Record<string, number>;
  probability: Probabilities;
}
