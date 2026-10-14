import { ArrowLeft, RefreshCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import {
  BET_LABELS,
  CHIP_VALUES,
  type BetSlip,
  type ChipValue,
  settleBets,
  totalStaked,
} from '../components/dragonTiger/dtBetting';
import { PlayingCard } from '../components/PlayingCard';
import { DragonTigerScoreboard } from '../components/roadmaps/DragonTigerScoreboard';
import { DragonTigerWinRateBar } from '../components/roadmaps/DragonTigerWinRateBar';
import { computeWinRates, toSide } from '../components/roadmaps/dragonTigerRoadUtils';
import type { DragonTigerBetType, DragonTigerRound, DragonTigerShoeState } from '../types/dragonTiger';

const defaultShoe: DragonTigerShoeState = {
  total_cards_remaining: 416,
  cards_remaining: {},
  probability: { dragon: 33.3, tiger: 33.3, tie: 33.3 },
};

const TABLE_LABEL = 'SW-1';
const INITIAL_WALLET = 97_706;

const betZoneClass: Record<DragonTigerBetType, string> = {
  tiger: 'border-red-400/60 bg-red-950/40 hover:bg-red-900/50',
  dragon: 'border-blue-400/60 bg-blue-950/40 hover:bg-blue-900/50',
  flush: 'border-amber-400/50 bg-amber-950/30 hover:bg-amber-900/40',
  tie: 'border-emerald-400/60 bg-emerald-950/35 hover:bg-emerald-900/45',
  flush_tie: 'border-yellow-400/70 bg-yellow-950/30 hover:bg-yellow-900/40',
};

export function DragonTigerRoom() {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shoeNumber, setShoeNumber] = useState(2239);
  const [shoe, setShoe] = useState<DragonTigerShoeState>(defaultShoe);
  const [rounds, setRounds] = useState<DragonTigerRound[]>([]);
  const [dragonCard, setDragonCard] = useState<string | null>(null);
  const [tigerCard, setTigerCard] = useState<string | null>(null);
  const [quickResult, setQuickResult] = useState<'dragon' | 'tiger' | 'tie'>('dragon');
  const [tab, setTab] = useState<'cards' | 'quick'>('quick');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [wallet, setWallet] = useState(INITIAL_WALLET);
  const [selectedChip, setSelectedChip] = useState<ChipValue>(2000);
  const [betSlip, setBetSlip] = useState<BetSlip>({});
  const [lastBetSlip, setLastBetSlip] = useState<BetSlip>({});

  const winRates = useMemo(() => computeWinRates(rounds), [rounds]);
  const stakedTotal = useMemo(() => totalStaked(betSlip), [betSlip]);
  const remainingLabel = useMemo(() => shoe.total_cards_remaining.toLocaleString(), [shoe.total_cards_remaining]);

  const mapShoe = (data: {
    total_cards_remaining: number;
    cards_remaining: Record<string, number>;
    probability: Record<string, number>;
  }): DragonTigerShoeState => ({
    total_cards_remaining: data.total_cards_remaining,
    cards_remaining: data.cards_remaining,
    probability: {
      dragon: Number(data.probability?.dragon ?? data.probability?.banker ?? 0),
      tiger: Number(data.probability?.tiger ?? data.probability?.player ?? 0),
      tie: Number(data.probability?.tie ?? 0),
    },
  });

  const createSession = async () => {
    const isConfigured = !!import.meta.env.VITE_API_BASE_URL || window.location.hostname === 'localhost';
    if (!isConfigured) {
      setLoading(false);
      setError('ยังไม่ได้กำหนด backend URL');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await apiPost<{ session_id: string; shoe: DragonTigerShoeState & { probability: Record<string, number> } }>(
        '/sessions',
        { game_code: 'dragon_tiger' },
      );
      setSessionId(data.session_id);
      setShoe(mapShoe(data.shoe));
      setRounds([]);
      setBetSlip({});
      setShoeNumber((n) => n + 1);
      setStatus('เริ่ม shoe ใหม่แล้ว');
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setError('ไม่สามารถเชื่อมต่อ API ได้');
    } finally {
      setLoading(false);
    }
  };

  const refreshSession = async (id: string) => {
    const data = await apiGet<{ total_cards_remaining: number; cards_remaining: Record<string, number>; probability: Record<string, number> }>(
      `/sessions/${id}`,
    );
    setShoe(mapShoe(data));
  };

  const clearTable = () => {
    setRounds([]);
    setDragonCard(null);
    setTigerCard(null);
    setBetSlip({});
    setStatus('เคลียร์ roadmap แล้ว');
  };

  const addBet = (type: DragonTigerBetType) => {
    if (wallet < selectedChip) {
      setStatus('ยอดเงินไม่พอ');
      return;
    }
    setBetSlip((current) => ({
      ...current,
      [type]: (current[type] ?? 0) + selectedChip,
    }));
  };

  const cancelBets = () => {
    setBetSlip({});
    setStatus('ยกเลิกเดิมพันแล้ว');
  };

  const repeatBets = () => {
    if (totalStaked(lastBetSlip) > wallet) {
      setStatus('ยอดเงินไม่พอสำหรับลงเท่าเดิม');
      return;
    }
    setBetSlip({ ...lastBetSlip });
    setStatus('ลงเท่าเดิมแล้ว');
  };

  const pickCard = (card: string, side: 'dragon' | 'tiger') => {
    if (side === 'dragon') {
      setDragonCard((current) => (current === card ? null : card));
      return;
    }
    setTigerCard((current) => (current === card ? null : card));
  };

  const submitRound = async () => {
    if (!sessionId) {
      setError('ยังไม่มีเซสชัน');
      return;
    }

    if (stakedTotal > wallet) {
      setError('ยอดเดิมพันเกินกระเป๋าเงิน');
      return;
    }

    const payload: Record<string, unknown> = {};
    if (tab === 'cards' && dragonCard && tigerCard) {
      payload.dragon_card = dragonCard;
      payload.tiger_card = tigerCard;
    } else {
      payload.result = quickResult;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await apiPost<{
        result: string;
        is_natural?: boolean;
        is_flush?: boolean;
        is_flush_tie?: boolean;
        dragon_card?: string;
        tiger_card?: string;
        total_cards_remaining: number;
      }>(`/sessions/${sessionId}/rounds`, payload);

      const side = toSide(data.result);
      if (!side) {
        setError('ผลรอบไม่ถูกต้อง');
        return;
      }

      const entry: DragonTigerRound = {
        result: side,
        natural: data.is_natural,
        flush: data.is_flush,
        flushTie: data.is_flush_tie,
        dragonCard: data.dragon_card,
        tigerCard: data.tiger_card,
      };

      const net = settleBets(betSlip, entry);
      setWallet((w) => w + net);
      if (stakedTotal > 0) {
        setLastBetSlip({ ...betSlip });
      }

      setRounds((current) => [...current, entry]);
      setStatus(
        `ผล: ${side === 'dragon' ? 'มังกร' : side === 'tiger' ? 'เสือ' : 'เสมอ'}${net !== 0 ? ` • กำไร/ขาดทุน ${net >= 0 ? '+' : ''}${net.toLocaleString()}` : ''}`,
      );
      setDragonCard(null);
      setTigerCard(null);
      setBetSlip({});
      await refreshSession(sessionId);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setError(err instanceof Error ? err.message : 'บันทึกล้มเหลว');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void createSession();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0f0a] via-[#2d1810] to-[#1a0f0a] px-2 py-4 text-slate-100">
      <div className="mx-auto max-w-[1100px] space-y-3">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-600/50 bg-black/40 px-3 py-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1 rounded border border-slate-500 px-2 py-1 text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Lobby
          </button>
          <span className="text-xs text-slate-300">
            Table {TABLE_LABEL} · Shoe {shoeNumber}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={clearTable} className="inline-flex items-center gap-1 rounded border border-slate-500 px-2 py-1 text-xs">
              <RefreshCcw className="h-3.5 w-3.5" />
              เคลียร์
            </button>
            <button type="button" onClick={() => void createSession()} className="rounded border border-slate-500 px-2 py-1 text-xs">
              Shoe ใหม่
            </button>
          </div>
        </div>

        <DragonTigerWinRateBar tigerPercent={winRates.tiger} dragonPercent={winRates.dragon} />

        <DragonTigerScoreboard rounds={rounds} />

        {error ? <div className="rounded border border-red-400/50 bg-red-950/50 px-3 py-2 text-sm">{error}</div> : null}
        {status ? <div className="rounded border border-slate-600 bg-black/30 px-3 py-1.5 text-xs text-slate-300">{status}</div> : null}

        <div className="rounded-2xl border-4 border-red-900/80 bg-gradient-to-b from-red-900 to-red-950 p-4 shadow-xl">
          <p className="mb-3 text-center text-xs uppercase tracking-widest text-red-200/80">เลือกประเภทเดิมพัน · แตะโซนเพื่อวางชิป</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
            {(['tiger', 'dragon', 'flush', 'tie', 'flush_tie'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => addBet(type)}
                className={`relative rounded-xl border-2 px-3 py-4 text-left transition ${betZoneClass[type]}`}
              >
                <div className="text-lg font-bold">{BET_LABELS[type].th}</div>
                <div className="text-xs text-slate-300">{BET_LABELS[type].payout}</div>
                {(betSlip[type] ?? 0) > 0 ? (
                  <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-amber-300">
                    {betSlip[type]?.toLocaleString()}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-red-800/60 pt-4">
            <div className="text-sm">
              <span className="text-red-200/80">ยอดคงเหลือ </span>
              <span className="text-xl font-bold text-pink-300">{wallet.toLocaleString()}</span>
            </div>
            <div className="text-sm text-slate-300">
              เดิมพันรอบนี้: <span className="font-semibold text-white">{stakedTotal.toLocaleString()}</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {CHIP_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSelectedChip(value)}
                className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                  selectedChip === value
                    ? 'border-amber-300 bg-gradient-to-b from-sky-400 to-blue-700 text-white shadow-[0_0_12px_rgba(56,189,248,0.6)]'
                    : 'border-slate-400 bg-gradient-to-b from-slate-500 to-slate-700 text-white'
                }`}
              >
                {value >= 10000 ? '10K' : value}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={cancelBets} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium">
              ยกเลิก
            </button>
            <button type="button" onClick={repeatBets} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium">
              ลงเท่าเดิม
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-600 bg-slate-900/80 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">บันทึกผลรอบ</p>
              <p className="text-sm text-slate-400">
                ไพ่เหลือ {loading ? '…' : remainingLabel} · โมเดล {shoe.probability.tiger.toFixed(0)}% เสือ / {shoe.probability.dragon.toFixed(0)}% มังกร
              </p>
            </div>
            <div className="flex rounded border border-slate-600 bg-slate-800 p-0.5 text-xs">
              <button type="button" onClick={() => setTab('quick')} className={`rounded px-3 py-1 ${tab === 'quick' ? 'bg-slate-700' : ''}`}>
                เร็ว
              </button>
              <button type="button" onClick={() => setTab('cards')} className={`rounded px-3 py-1 ${tab === 'cards' ? 'bg-slate-700' : ''}`}>
                เลือกไพ่
              </button>
            </div>
          </div>

          {tab === 'quick' ? (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {(
                [
                  { key: 'tiger', label: 'เสือ', color: 'border-red-500 bg-red-950/50' },
                  { key: 'dragon', label: 'มังกร', color: 'border-blue-500 bg-blue-950/50' },
                  { key: 'tie', label: 'เสมอ', color: 'border-emerald-500 bg-emerald-950/50' },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setQuickResult(item.key)}
                  className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold ${
                    quickResult === item.key ? item.color : 'border-slate-600 bg-slate-800 text-slate-400'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-3 space-y-2">
              <p className="text-xs text-slate-400">
                มังกร: {dragonCard ?? '—'} · เสือ: {tigerCard ?? '—'}
              </p>
              <div className="max-h-40 overflow-y-auto rounded border border-slate-700 p-2">
                {['H', 'D', 'S', 'C'].map((suit) => (
                  <div key={suit} className="mb-2 flex flex-wrap gap-1">
                    {['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((rank) => {
                      const card = `${suit}${rank}`;
                      return (
                        <PlayingCard
                          key={card}
                          card={card}
                          selected={dragonCard === card || tigerCard === card}
                          onClick={() => {
                            if (!dragonCard || dragonCard === card) pickCard(card, 'dragon');
                            else pickCard(card, 'tiger');
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={loading || (tab === 'cards' && (!dragonCard || !tigerCard))}
            onClick={() => void submitRound()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            เปิดไพ่ & บันทึกผล
          </button>
        </div>

        {sessionId ? <p className="text-center text-[10px] text-red-400/60">{sessionId.slice(0, 8)}…</p> : null}
      </div>
    </div>
  );
}
