from __future__ import annotations

RANK_ORDER = {
    "A": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 10,
    "J": 11,
    "Q": 12,
    "K": 13,
}


def card_rank(card: str) -> str:
    return card[1:] if len(card) > 1 else card


def card_suit(card: str) -> str:
    return card[0] if card else ""


def rank_strength(card: str) -> int:
    rank = card_rank(card)
    if rank not in RANK_ORDER:
        raise ValueError(f"Unsupported card: {card}")
    return RANK_ORDER[rank]


def determine_dragon_tiger_winner(dragon_card: str, tiger_card: str) -> str:
    """Returns banker (dragon), player (tiger), or tie — aligned with session result codes."""
    dragon = rank_strength(dragon_card)
    tiger = rank_strength(tiger_card)
    if dragon > tiger:
        return "banker"
    if tiger > dragon:
        return "player"
    return "tie"


def is_dragon_tiger_natural(card: str) -> bool:
    return card_rank(card) in {"8", "9"}


def is_same_rank(a: str, b: str) -> bool:
    return card_rank(a) == card_rank(b)


def is_flush(dragon_card: str, tiger_card: str) -> bool:
    return card_suit(dragon_card) == card_suit(tiger_card) and card_suit(dragon_card) != ""


def is_flush_tie(dragon_card: str, tiger_card: str) -> bool:
    return is_same_rank(dragon_card, tiger_card) and is_flush(dragon_card, tiger_card)
