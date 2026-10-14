import { ArrowLeft, ChevronDown, ChevronUp, History, RefreshCcw, Save, Trash2 } from 'lucide-react';
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
const HISTORY_KEY = 'dt-play-history-v1';
const HISTORY_LIMIT = 50;

type Side = 'dragon' | 'tiger' | 'tie';

/** log ต่อรอบ (เก็บยอดเดิมพัน + กำไร/ขาดทุน) */
interface RoundLog {
  no: number;
  result: Side;
  flush: boolean;
  flushTie: boolean;
  staked: number;
  net: number;
}

/** ข้อมูลการเล่น 1 การเคลียร์ */
interface PlaySession {
  id: string;
  tableLabel: string;
  shoeNumber: number;
  startedAt: number;
  endedAt: number;
  reason: 'clear' | 'new_shoe';
  rounds: DragonTigerRound[];
  logs: RoundLog[];
  totalRounds: number;
  counts: { dragon: number; tiger: number; tie: number; flush: number; flushTie: number };
  totalStaked: number;
  net: number;
}

/** โซนเดิมพัน: แถวบน = เสือ/มังกร, แถวล่าง = ฟลัช/เสมอ/ฟลัชเสมอ */
const TOP_ZONES = ['tiger', 'dragon'] as const;
const BOTTOM_ZONES = ['flush', 'tie', 'flush_tie'] as const;

/** พื้นขาว + ขอบเทา เน้นสีเฉพาะตอน hover */
const betZoneClass: Record<DragonTigerBetType, string> = {
  tiger: 'hover:border-red-400 hover:bg-red-50',
  dragon: 'hover:border-blue-400 hover:bg-blue-50',
  tie: 'hover:border-emerald-400 hover:bg-emerald-50',
  flush: 'hover:border-amber-400 hover:bg-amber-50',
  flush_tie: 'hover:border-amber-400 hover:bg-amber-50',
};

const betTitleClass: Record<DragonTigerBetType, string> = {
  tiger: 'text-red-600',
  dragon: 'text-blue-600',
  tie: 'text-emerald-600',
  flush: 'text-amber-600',
  flush_tie: 'text-amber-600',
};

const sideLabel: Record<Side, string> = { dragon: 'มังกร', tiger: 'เสือ', tie: 'เสมอ' };
const sideBadge: Record<Side, string> = {
  dragon: 'bg-blue-50 text-blue-600',
  tiger: 'bg-red-50 text-red-600',
  tie: 'bg-emerald-50 text-emerald-600',
};

const fmtSigned = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString()}`;
const netColor = (n: number) => (n > 0 ? 'text-emerald-600' : n < 0 ? 'text-red-600' : 'text-zinc-500');
const fmtDate = (ts: number) => new Date(ts).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

function loadHistory(): PlaySession[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as PlaySession[]) : [];
  } catch {
    return [];
  }
}

export function DragonTigerRoom() {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shoeNumber, setShoeNumber] = useState(2239);
  const [shoe, setShoe] = useState<DragonTigerShoeState>(defaultShoe);
  const [rounds, setRounds] = useState<DragonTigerRound[]>([]);
  const [roundLogs, setRoundLogs] = useState<RoundLog[]>([]);
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());

  // บันทึกผลรอบ
  const [quickResult, setQuickResult] = useState<Side>('dragon');
  const [quickFlush, setQuickFlush] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // เดิมพัน
  const [wallet, setWallet] = useState(0);
  const [selectedChip, setSelectedChip] = useState<ChipValue>(2000);
  const [customAmount, setCustomAmount] = useState('');
  const [betSlip, setBetSlip] = useState<BetSlip>({});
  const [lastBetSlip, setLastBetSlip] = useState<BetSlip>({});

  // ประวัติ
  const [history, setHistory] = useState<PlaySession[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const winRates = useMemo(() => computeWinRates(rounds), [rounds]);
  const stakedTotal = useMemo(() => totalStaked(betSlip), [betSlip]);
  const remainingLabel = useMemo(() => shoe.total_cards_remaining.toLocaleString(), [shoe.total_cards_remaining]);

  const customValue = useMemo(() => {
    const n = Number(customAmount.replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }, [customAmount]);
  const amountToPlace = customValue > 0 ? customValue : selectedChip;

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* storage เต็ม / ถูกปิด — ข้าม */
    }
  }, [history]);

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

  /** เก็บข้อมูลการเล่นของรอบปัจจุบันเข้า history (เรียกก่อนเคลียร์ / เปลี่ยน shoe) */
  const archiveCurrent = (reason: PlaySession['reason']) => {
    if (rounds.length === 0) return false;
    const counts = {
      dragon: rounds.filter((r) => r.result === 'dragon').length,
      tiger: rounds.filter((r) => r.result === 'tiger').length,
      tie: rounds.filter((r) => r.result === 'tie').length,
      flush: rounds.filter((r) => r.flush).length,
      flushTie: rounds.filter((r) => r.flushTie).length,
    };
    const entry: PlaySession = {
      id: `${Date.now()}-${shoeNumber}`,
      tableLabel: TABLE_LABEL,
      shoeNumber,
      startedAt,
      endedAt: Date.now(),
      reason,
      rounds,
      logs: roundLogs,
      totalRounds: rounds.length,
      counts,
      totalStaked: roundLogs.reduce((s, l) => s + l.staked, 0),
      net: roundLogs.reduce((s, l) => s + l.net, 0),
    };
    setHistory((h) => [entry, ...h].slice(0, HISTORY_LIMIT));
    return true;
  };

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
      setRoundLogs([]);
      setBetSlip({});
      setStartedAt(Date.now());
      setShoeNumber((n) => n + 1);
      setStatus('เริ่ม shoe ใหม่แล้ว');
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setError('ไม่สามารถเชื่อมต่อ API ได้');
    } finally {
      setLoading(false);
    }
  };

  const newShoe = async () => {
    archiveCurrent('new_shoe');
    await createSession();
  };

  const refreshSession = async (id: string) => {
    const data = await apiGet<{ total_cards_remaining: number; cards_remaining: Record<string, number>; probability: Record<string, number> }>(
      `/sessions/${id}`,
    );
    setShoe(mapShoe(data));
  };

  const clearTable = () => {
    const saved = archiveCurrent('clear');
    setRounds([]);
    setRoundLogs([]);
    setBetSlip({});
    setStartedAt(Date.now());
    setStatus(saved ? 'เคลียร์ roadmap แล้ว · เก็บข้อมูลรอบนี้ในประวัติแล้ว' : 'เคลียร์ roadmap แล้ว');
  };

  const addBet = (type: DragonTigerBetType) => {
    setBetSlip((current) => ({
      ...current,
      [type]: (current[type] ?? 0) + amountToPlace,
    }));
  };

  const cancelBets = () => {
    setBetSlip({});
    setStatus('ยกเลิกเดิมพันแล้ว');
  };

  const repeatBets = () => {
    if (totalStaked(lastBetSlip) === 0) {
      setStatus('ยังไม่มีเดิมพันรอบก่อนหน้า');
      return;
    }
    setBetSlip({ ...lastBetSlip });
    setStatus('ลงเท่าเดิมแล้ว');
  };

  const pickChip = (value: ChipValue) => {
    setSelectedChip(value);
    setCustomAmount('');
  };

  const submitRound = async () => {
    if (!sessionId) {
      setError('ยังไม่มีเซสชัน');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await apiPost<{
        result: string;
        is_natural?: boolean;
        total_cards_remaining: number;
      }>(`/sessions/${sessionId}/rounds`, { result: quickResult });

      const side = toSide(data.result);
      if (!side) {
        setError('ผลรอบไม่ถูกต้อง');
        return;
      }

      // flush / flush_tie มาจากที่ผู้เล่นเลือกเอง
      const isTie = side === 'tie';
      const entry: DragonTigerRound = {
        result: side,
        natural: data.is_natural,
        flush: quickFlush && !isTie,
        flushTie: quickFlush && isTie,
      };

      const staked = stakedTotal;
      const net = settleBets(betSlip, entry);
      setWallet((w) => w + net);
      if (staked > 0) setLastBetSlip({ ...betSlip });

      setRounds((current) => [...current, entry]);
      setRoundLogs((current) => [
        ...current,
        {
          no: current.length + 1,
          result: side,
          flush: !!entry.flush,
          flushTie: !!entry.flushTie,
          staked,
          net,
        },
      ]);
      setStatus(
        `ผล: ${sideLabel[side]}${entry.flush ? ' · Flush' : ''}${entry.flushTie ? ' · Flush Tie' : ''}${
          staked > 0 ? ` • กำไร/ขาดทุน ${fmtSigned(net)}` : ''
        }`,
      );
      setBetSlip({});
      setQuickFlush(false);
      await refreshSession(sessionId);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setError(err instanceof Error ? err.message : 'บันทึกล้มเหลว');
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = (id: string) => {
    setHistory((h) => h.filter((s) => s.id !== id));
    if (openSessionId === id) setOpenSessionId(null);
  };

  useEffect(() => {
    void createSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ghostBtn =
    'inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900';

  const outlineBtn =
    'rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900';

  const renderZone = (type: DragonTigerBetType, large = false) => (
    <button
      key={type}
      type="button"
      onClick={() => addBet(type)}
      className={`relative rounded-lg border border-zinc-200 bg-white px-3 text-left transition ${
        large ? 'py-6' : 'py-4'
      } ${betZoneClass[type]}`}
    >
      <div className={`${large ? 'text-lg' : 'text-base'} font-semibold ${betTitleClass[type]}`}>{BET_LABELS[type].th}</div>
      {(betSlip[type] ?? 0) > 0 ? (
        <span className="absolute right-2 top-2 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white">
          {betSlip[type]?.toLocaleString()}
        </span>
      ) : null}
    </button>
  );

  return (
    <div className="min-h-screen bg-zinc-50 px-2 py-4 text-zinc-900">
      <div className="mx-auto max-w-[1100px] space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
          <button type="button" onClick={() => navigate('/')} className={ghostBtn}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Lobby
          </button>
          <span className="text-xs text-zinc-500">
            Table {TABLE_LABEL} · Shoe {shoeNumber}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowHistory((v) => !v)} className={ghostBtn}>
              <History className="h-3.5 w-3.5" />
              ประวัติ{history.length > 0 ? ` (${history.length})` : ''}
            </button>
            <button type="button" onClick={clearTable} className={ghostBtn}>
              <RefreshCcw className="h-3.5 w-3.5" />
              เคลียร์
            </button>
            <button type="button" onClick={() => void newShoe()} className={ghostBtn}>
              Shoe ใหม่
            </button>
          </div>
        </div>

        <DragonTigerWinRateBar tigerPercent={winRates.tiger} dragonPercent={winRates.dragon} />

        <DragonTigerScoreboard rounds={rounds} />

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        {status ? (
          <div className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-500">{status}</div>
        ) : null}

        {/* ประวัติการเล่น */}
        {showHistory ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="mb-3 text-[10px] uppercase tracking-widest text-zinc-400">ประวัติการเล่น (ต่อการเคลียร์)</p>
            {history.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-400">ยังไม่มีประวัติ — จะถูกบันทึกเมื่อกดเคลียร์หรือเริ่ม Shoe ใหม่</p>
            ) : (
              <div className="space-y-2">
                {history.map((s) => {
                  const open = openSessionId === s.id;
                  return (
                    <div key={s.id} className="rounded-lg border border-zinc-200 bg-zinc-50">
                      <button
                        type="button"
                        onClick={() => setOpenSessionId(open ? null : s.id)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900">
                            Shoe {s.shoeNumber} · {s.totalRounds} รอบ
                            <span className="ml-2 text-xs font-normal text-zinc-400">
                              {s.reason === 'new_shoe' ? 'Shoe ใหม่' : 'เคลียร์'}
                            </span>
                          </p>
                          <p className="text-xs text-zinc-400">
                            {fmtDate(s.startedAt)} → {fmtDate(s.endedAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-xs">
                            <span className="text-red-600">เสือ {s.counts.tiger}</span>
                            <span className="text-zinc-300"> · </span>
                            <span className="text-blue-600">มังกร {s.counts.dragon}</span>
                            <span className="text-zinc-300"> · </span>
                            <span className="text-emerald-600">เสมอ {s.counts.tie}</span>
                          </span>
                          <span className={`text-sm font-semibold ${netColor(s.net)}`}>{fmtSigned(s.net)}</span>
                          {open ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                        </div>
                      </button>

                      {open ? (
                        <div className="space-y-3 border-t border-zinc-200 bg-white px-3 py-3">
                          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                            <div className="rounded-md bg-zinc-50 px-2 py-1.5">
                              <p className="text-zinc-400">จำนวนรอบ</p>
                              <p className="text-sm font-semibold text-zinc-900">{s.totalRounds}</p>
                            </div>
                            <div className="rounded-md bg-zinc-50 px-2 py-1.5">
                              <p className="text-zinc-400">ยอดเดิมพันรวม</p>
                              <p className="text-sm font-semibold text-zinc-900">{s.totalStaked.toLocaleString()}</p>
                            </div>
                            <div className="rounded-md bg-zinc-50 px-2 py-1.5">
                              <p className="text-zinc-400">กำไร/ขาดทุนรวม</p>
                              <p className={`text-sm font-semibold ${netColor(s.net)}`}>{fmtSigned(s.net)}</p>
                            </div>
                            <div className="rounded-md bg-zinc-50 px-2 py-1.5">
                              <p className="text-zinc-400">Flush / Flush Tie</p>
                              <p className="text-sm font-semibold text-amber-600">
                                {s.counts.flush} / {s.counts.flushTie}
                              </p>
                            </div>
                          </div>

                          <DragonTigerScoreboard rounds={s.rounds} />

                          <div className="max-h-56 overflow-y-auto rounded-md border border-zinc-200">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-zinc-50 text-zinc-400">
                                <tr>
                                  <th className="px-2 py-1.5 text-left font-normal">#</th>
                                  <th className="px-2 py-1.5 text-left font-normal">ผล</th>
                                  <th className="px-2 py-1.5 text-right font-normal">เดิมพัน</th>
                                  <th className="px-2 py-1.5 text-right font-normal">กำไร/ขาดทุน</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.logs.map((l) => (
                                  <tr key={l.no} className="border-t border-zinc-100">
                                    <td className="px-2 py-1.5 text-zinc-400">{l.no}</td>
                                    <td className="px-2 py-1.5">
                                      <span className={`rounded px-1.5 py-0.5 ${sideBadge[l.result]}`}>{sideLabel[l.result]}</span>
                                      {l.flush ? <span className="ml-1 text-amber-600">Flush</span> : null}
                                      {l.flushTie ? <span className="ml-1 text-amber-600">Flush Tie</span> : null}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-zinc-600">{l.staked > 0 ? l.staked.toLocaleString() : '—'}</td>
                                    <td className={`px-2 py-1.5 text-right ${netColor(l.net)}`}>{l.staked > 0 ? fmtSigned(l.net) : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => deleteSession(s.id)}
                              className="inline-flex items-center gap-1 text-xs text-zinc-400 transition hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              ลบประวัติรอบนี้
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {/* เลือกประเภทเดิมพัน */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="mb-3 text-center text-[11px] uppercase tracking-widest text-zinc-400">
            เลือกประเภทเดิมพัน · แตะโซนเพื่อวางชิป
          </p>

          <div className="space-y-2">
            {/* แถวบน: เสือ / มังกร */}
            <div className="grid grid-cols-2 gap-2">{TOP_ZONES.map((type) => renderZone(type, true))}</div>
            {/* แถวล่าง: ฟลัช / เสมอ / ฟลัชเสมอ */}
            <div className="grid grid-cols-3 gap-2">{BOTTOM_ZONES.map((type) => renderZone(type))}</div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
            <label className="flex items-center gap-2 text-sm text-zinc-500">
              ยอดคงเหลือ
              <input
                type="number"
                inputMode="numeric"
                value={wallet}
                onChange={(e) => setWallet(Number(e.target.value) || 0)}
                className={`w-32 rounded-md border border-zinc-200 bg-white px-2 py-1 text-right text-lg font-semibold outline-none focus:border-zinc-400 ${
                  wallet === 0 ? 'text-zinc-900' : netColor(wallet)
                }`}
              />
            </label>
            <div className="text-sm text-zinc-500">
              เดิมพันรอบนี้: <span className="font-semibold text-zinc-900">{stakedTotal.toLocaleString()}</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {CHIP_VALUES.map((value) => {
              const active = customValue === 0 && selectedChip === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => pickChip(value)}
                  className={`flex h-11 w-11 items-center justify-center rounded-full border text-[10px] font-semibold transition ${
                    active
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400'
                  }`}
                >
                  {value >= 10000 ? '10K' : value}
                </button>
              );
            })}
            <input
              type="text"
              inputMode="numeric"
              placeholder="กรอกเอง"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value.replace(/[^\d,]/g, ''))}
              className={`ml-1 w-28 rounded-md border bg-white px-2 py-2 text-center text-sm outline-none ${
                customValue > 0
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-zinc-200 text-zinc-600 placeholder:text-zinc-400 focus:border-zinc-400'
              }`}
            />
          </div>
          <p className="mt-1.5 text-center text-[11px] text-zinc-400">
            ชิปที่จะวาง: <span className="text-zinc-700">{amountToPlace.toLocaleString()}</span>
            {customValue > 0 ? ' (กรอกเอง)' : ''}
          </p>

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={cancelBets} className={outlineBtn}>
              ยกเลิก
            </button>
            <button type="button" onClick={repeatBets} className={outlineBtn}>
              ลงเท่าเดิม
            </button>
          </div>
        </div>

        {/* บันทึกผลรอบ */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-widest text-zinc-400">บันทึกผลรอบ</p>
            <p className="text-sm text-zinc-500">
              ไพ่เหลือ {loading ? '…' : remainingLabel} · โมเดล {shoe.probability.tiger.toFixed(0)}% เสือ / {shoe.probability.dragon.toFixed(0)}% มังกร
            </p>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2">
            {(
              [
                { key: 'tiger', active: 'border-red-400 bg-red-50 text-red-600' },
                { key: 'dragon', active: 'border-blue-400 bg-blue-50 text-blue-600' },
                { key: 'tie', active: 'border-emerald-400 bg-emerald-50 text-emerald-600' },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setQuickResult(item.key)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                  quickResult === item.key
                    ? item.active
                    : 'border-zinc-200 bg-white text-zinc-400 hover:border-zinc-400'
                }`}
              >
                {sideLabel[item.key]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setQuickFlush((v) => !v)}
            className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm transition ${
              quickFlush
                ? 'border-amber-400 bg-amber-50 text-amber-700'
                : 'border-zinc-200 bg-white text-zinc-400 hover:border-zinc-400'
            }`}
          >
            {quickResult === 'tie' ? 'Flush Tie' : 'Flush'} {quickFlush ? '✓' : ''}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => void submitRound()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            บันทึกผล
          </button>
        </div>

        {sessionId ? <p className="text-center text-[10px] text-zinc-300">{sessionId.slice(0, 8)}…</p> : null}
      </div>
    </div>
  );
}