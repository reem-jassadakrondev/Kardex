from __future__ import annotations

from collections import defaultdict

DEFAULT_SHOE = {
    "A": 4,
    "2": 4,
    "3": 4,
    "4": 4,
    "5": 4,
    "6": 4,
    "7": 4,
    "8": 4,
    "9": 4,
    "10": 4,
    "J": 4,
    "Q": 4,
    "K": 4,
}


def build_initial_shoe(deck_count: int = 8) -> dict[str, int]:
    shoe = {value: 0 for value in DEFAULT_SHOE}
    for value, count in DEFAULT_SHOE.items():
        shoe[value] = count * deck_count
    return shoe


def remove_cards_from_shoe(shoe: dict[str, int], cards: list[str]) -> dict[str, int]:
    updated = dict(shoe)
    for card in cards:
        rank = card[1:]
        if rank not in updated:
            continue
        updated[rank] = max(0, updated[rank] - 1)
    return updated


def get_cards_remaining_count(shoe: dict[str, int]) -> int:
    return sum(shoe.values())


def calculate_probability(shoe: dict[str, int]) -> dict[str, float]:
    total = sum(shoe.values())
    if total <= 0:
        return {"player": 0.0, "banker": 0.0, "tie": 0.0}

    # Simple percentage approximation using rank distribution.
    player_weight = sum(shoe.get(rank, 0) for rank in ["A", "2", "3", "4", "5", "6", "7", "8", "9"])
    banker_weight = sum(shoe.get(rank, 0) for rank in ["10", "J", "Q", "K"])
    tie_weight = max(1, total // 10)

    total_weight = player_weight + banker_weight + tie_weight
    player_pct = (player_weight / total_weight) * 100
    banker_pct = (banker_weight / total_weight) * 100
    tie_pct = (tie_weight / total_weight) * 100
    return {"player": round(player_pct, 2), "banker": round(banker_pct, 2), "tie": round(tie_pct, 2)}
