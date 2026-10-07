from __future__ import annotations

from typing import Optional

CARD_VALUES = {
    "A": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 0,
    "J": 0,
    "Q": 0,
    "K": 0,
}

CARD_SUITS = ["H", "D", "S", "C"]


def card_value(card: str) -> int:
    if card in CARD_VALUES:
        return CARD_VALUES[card]

    rank = card[1:] if len(card) > 1 else card
    if rank in CARD_VALUES:
        return CARD_VALUES[rank]

    raise ValueError(f"Unsupported card value: {card}")


def hand_score(cards: list[str]) -> int:
    total = sum(card_value(card) for card in cards)
    return total % 10


def is_natural(cards: list[str]) -> bool:
    return len(cards) in (2,) and hand_score(cards) in (8, 9)


def player_third_card_rule(player_total: int) -> bool:
    return player_total <= 5


def banker_third_card_rule(player_total: int, banker_total: int, player_third_card_value: Optional[int] = None) -> bool:
    if player_total >= 8:
        return False
    if player_third_card_value is None:
        return banker_total <= 5

    if banker_total <= 2:
        return True
    if banker_total == 3:
        return player_third_card_value != 8
    if banker_total == 4:
        return player_third_card_value in {2, 3, 4, 5, 6, 7}
    if banker_total == 5:
        return player_third_card_value in {4, 5, 6, 7}
    if banker_total == 6:
        return player_third_card_value in {6, 7}
    return False


def determine_winner(player_score: int, banker_score: int) -> str:
    if player_score > banker_score:
        return "player"
    if banker_score > player_score:
        return "banker"
    return "tie"


def evaluate_round(player_cards: list[str], banker_cards: list[str]) -> dict:
    player_score = hand_score(player_cards)
    banker_score = hand_score(banker_cards)

    player_draw = player_third_card_rule(player_score)
    player_third_card = None
    if player_draw:
        player_third_card = player_cards[2] if len(player_cards) > 2 else None

    banker_draw = banker_third_card_rule(player_score, banker_score, card_value(player_third_card) if player_third_card else None)

    final_player_cards = list(player_cards)
    final_banker_cards = list(banker_cards)

    if player_draw and len(player_cards) == 2:
        generated = draw_card_for_rule(player_cards)
        final_player_cards.append(generated)
        player_score = hand_score(final_player_cards)

    if banker_draw and len(banker_cards) == 2:
        generated = draw_card_for_rule(banker_cards)
        final_banker_cards.append(generated)
        banker_score = hand_score(final_banker_cards)

    result = determine_winner(player_score, banker_score)
    return {
        "player_cards": final_player_cards,
        "banker_cards": final_banker_cards,
        "player_score": player_score,
        "banker_score": banker_score,
        "result": result,
        "is_player_pair": is_pair(final_player_cards),
        "is_banker_pair": is_pair(final_banker_cards),
        "is_natural": is_natural(final_player_cards) or is_natural(final_banker_cards),
    }


def draw_card_for_rule(existing_cards: list[str]) -> str:
    possible = []
    for suit in CARD_SUITS:
        for rank in ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]:
            card = f"{suit}{rank}"
            if card not in existing_cards:
                possible.append(card)
    return possible[0] if possible else "H10"


def is_pair(cards: list[str]) -> bool:
    if len(cards) < 2:
        return False
    return cards[0][1:] == cards[1][1:]
