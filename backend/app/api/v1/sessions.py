from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.game import Game
from app.models.round import Round
from app.models.session import GameSession
from app.schemas.session import SessionCreateResponse, SessionDetail, ShoeState
from app.services.baccarat_engine import determine_winner, hand_score
from app.services.card_tracker import (
    build_initial_shoe,
    calculate_dragon_tiger_probability,
    calculate_probability,
    get_cards_remaining_count,
    remove_cards_from_shoe,
)
from app.services.dragon_tiger_engine import (
    determine_dragon_tiger_winner,
    is_dragon_tiger_natural,
    is_flush,
    is_flush_tie,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionCreateResponse)
async def create_session(payload: dict | None = None, db: AsyncSession = Depends(get_db)) -> SessionCreateResponse:
    body = payload or {}
    game_code = body.get("game_code") or "baccarat"
    game = await db.get(Game, game_code)
    if game is None:
        raise HTTPException(status_code=404, detail=f"Game not found: {game_code}")

    rules = game.rules_config or {}
    max_decks = int(rules.get("max_deck_count", 8))
    deck_count = max(1, min(max_decks, int(body.get("deck_count") or max_decks)))

    shoe_cards = build_initial_shoe(deck_count)
    total_cards = sum(shoe_cards.values())

    session = GameSession(
        id=str(uuid.uuid4()),
        game_code=game_code,
        deck_count=deck_count,
        total_initial_cards=total_cards,
        cards_remaining=shoe_cards,
        total_cards_remaining=total_cards,
        status="active",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    prob = (
        calculate_dragon_tiger_probability(session.cards_remaining)
        if game_code == "dragon_tiger"
        else calculate_probability(session.cards_remaining)
    )

    return SessionCreateResponse(
        session_id=session.id,
        shoe=ShoeState(
            total_cards_remaining=session.total_cards_remaining,
            cards_remaining=session.cards_remaining,
            probability=prob,
        ),
    )


@router.get("/{session_id}", response_model=SessionDetail)
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)) -> SessionDetail:
    session = await db.get(GameSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    prob = (
        calculate_dragon_tiger_probability(session.cards_remaining)
        if session.game_code == "dragon_tiger"
        else calculate_probability(session.cards_remaining)
    )

    return SessionDetail(
        id=session.id,
        game_code=session.game_code,
        deck_count=session.deck_count,
        total_initial_cards=session.total_initial_cards,
        total_cards_remaining=session.total_cards_remaining,
        cards_remaining=session.cards_remaining,
        probability=prob,
        status=session.status,
    )


@router.post("/{session_id}/rounds")
async def create_round(session_id: str, payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    session = await db.get(GameSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    player_cards = payload.get("player_cards") or []
    banker_cards = payload.get("banker_cards") or []
    result = payload.get("result")

    is_dragon_tiger = session.game_code == "dragon_tiger"

    if is_dragon_tiger:
        dragon_card = payload.get("dragon_card")
        tiger_card = payload.get("tiger_card")
        if dragon_card and tiger_card:
            banker_cards = [dragon_card]
            player_cards = [tiger_card]
        elif not player_cards and not banker_cards and result is None:
            raise HTTPException(status_code=400, detail="Dragon Tiger round requires cards or result")

        if not banker_cards and payload.get("result") in {"dragon", "banker"}:
            banker_cards = ["HK"]
            player_cards = ["H7"]
        elif not player_cards and payload.get("result") in {"tiger", "player"}:
            banker_cards = ["H7"]
            player_cards = ["HK"]
        elif not player_cards and payload.get("result") == "tie":
            banker_cards = ["H8"]
            player_cards = ["D8"]

        if not banker_cards:
            banker_cards = ["HK"]
        if not player_cards:
            player_cards = ["H7"]

        banker_cards = banker_cards[:1]
        player_cards = player_cards[:1]

        player_score = hand_score(player_cards)
        banker_score = hand_score(banker_cards)

        if result in {"dragon", "banker"}:
            result = "banker"
        elif result in {"tiger", "player"}:
            result = "player"
        elif result == "tie":
            result = "tie"
        elif result is None:
            result = determine_dragon_tiger_winner(banker_cards[0], player_cards[0])

        is_natural = is_dragon_tiger_natural(banker_cards[0]) or is_dragon_tiger_natural(player_cards[0])
        round_flush = is_flush(banker_cards[0], player_cards[0])
        round_flush_tie = is_flush_tie(banker_cards[0], player_cards[0])
        is_banker_pair = round_flush
        is_player_pair = round_flush_tie
    else:
        if not player_cards and not banker_cards and result is None:
            raise HTTPException(status_code=400, detail="Round payload is required")

        if not player_cards:
            player_cards = [f"H{rank}" for rank in ["9", "8"]]
        if not banker_cards:
            banker_cards = [f"D{rank}" for rank in ["7", "6"]]

        player_score = hand_score(player_cards)
        banker_score = hand_score(banker_cards)
        if result is None:
            result = determine_winner(player_score, banker_score)

        is_natural = False
        is_banker_pair = False
        is_player_pair = False

    round_number = (await db.execute(select(Round).where(Round.session_id == session_id))).scalars().all()
    new_round = Round(
        id=str(uuid.uuid4()),
        session_id=session_id,
        round_number=len(round_number) + 1,
        player_cards=player_cards,
        banker_cards=banker_cards,
        player_score=player_score,
        banker_score=banker_score,
        result=result,
        is_player_pair=is_player_pair if is_dragon_tiger else False,
        is_banker_pair=is_banker_pair if is_dragon_tiger else False,
        is_natural=is_natural if is_dragon_tiger else False,
        created_at=datetime.now(timezone.utc),
    )
    db.add(new_round)

    session.cards_remaining = remove_cards_from_shoe(session.cards_remaining, player_cards + banker_cards)
    session.total_cards_remaining = get_cards_remaining_count(session.cards_remaining)
    if session.total_cards_remaining <= 0:
        session.status = "completed"
    session.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session)

    prob = (
        calculate_dragon_tiger_probability(session.cards_remaining)
        if is_dragon_tiger
        else calculate_probability(session.cards_remaining)
    )

    return {
        "round_id": new_round.id,
        "result": result,
        "is_natural": new_round.is_natural,
        "is_flush": new_round.is_banker_pair if is_dragon_tiger else False,
        "is_flush_tie": new_round.is_player_pair if is_dragon_tiger else False,
        "dragon_card": banker_cards[0] if is_dragon_tiger else None,
        "tiger_card": player_cards[0] if is_dragon_tiger else None,
        "cards_remaining": session.cards_remaining,
        "total_cards_remaining": session.total_cards_remaining,
        "probability": prob,
    }


@router.get("/{session_id}/roadmaps")
async def get_roadmaps(session_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    session = await db.get(GameSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    rounds = await db.execute(select(Round).where(Round.session_id == session_id).order_by(Round.created_at))
    round_records = [
        {
            "result": row.result,
            "player_cards": row.player_cards,
            "banker_cards": row.banker_cards,
            "player_score": row.player_score,
            "banker_score": row.banker_score,
        }
        for row in rounds.scalars().all()
    ]

    from app.services.roadmap_generator import build_bead_plate, build_big_road

    return {
        "big_road": build_big_road(round_records),
        "bead_plate": build_bead_plate(round_records),
    }
