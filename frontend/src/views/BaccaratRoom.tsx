import { Activity, ArrowLeft, BarChart3, Coins, RefreshCcw, Save, ShieldCheck, TrendingUp, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import { CardMatrix } from '../components/CardMatrix';
import { PlayingCard } from '../components/PlayingCard';
import { ProbabilityBar } from '../components/ProbabilityBar';
import { BigRoad } from '../components/roadmaps/BigRoad';
import { BeadPlate } from '../components/roadmaps/BeadPlate';
import type { ShoeState } from '../types/baccarat';

const defaultShoe: ShoeState = {
  total_cards_remaining: 3328,
  cards_remaining: { A: 32, '2': 32, '3': 32, '4': 32, '5': 32, '6': 32, '7': 32, '8': 32, '9': 32, '10': 32, J: 32, Q: 32, K: 32 },
  probability: { player: 62.95, banker: 27.98, tie: 9.07 },
};

const betAmounts = [20, 50, 100, 200, 500, 1000];
const sideMeta = {
  player: { label: 'ผู้เล่น', color: 'bg-blue-600', dark: 'text-blue-700', border: 'border-blue-200', badge: 'bg-blue-100' },
  banker: { label: 'เจ้ามือ', color: 'bg-red-600', dark: 'text-red-700', border: 'border-red-200', badge: 'bg-red-100' },
  tie: { label: 'เสมอ', color: 'bg-emerald-600', dark: 'text-emerald-700', border: 'border-emerald-200', badge: 'bg-emerald-100' },
} as const;

type RoundHistoryEntry = {
  id: string;
  timestamp: string;
  side: keyof typeof sideMeta;
  amount: number;
  result: string;
  payout: number;
  net: number;
  status: 'win' | 'lose' | 'draw';
  cards: string[];
};

export function BaccaratRoom() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'picker' | 'quick'>('picker');
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [quickResult, setQuickResult] = useState('ผู้เล่น');
  const [betSide, setBetSide] = useState<keyof typeof sideMeta>('player');
  const [betAmount, setBetAmount] = useState(100);
  const [wallet, setWallet] = useState(5000);
  const [pendingBet, setPendingBet] = useState<{ side: keyof typeof sideMeta; amount: number } | null>(null);
  const [shoe, setShoe] = useState<ShoeState>(defaultShoe);
  const [roadmapRounds, setRoadmapRounds] = useState<Array<{ result: string }>>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roundStatus, setRoundStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' | 'info' } | null>(null);
  const [history, setHistory] = useState<RoundHistoryEntry[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [defaultStake, setDefaultStake] = useState(100);
  const [predictionWindow, setPredictionWindow] = useState(8);

  const showToast = (message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, tone });
  };

  const makeTableOpenEntry = (): RoundHistoryEntry => ({
    id: `table-open-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    side: 'player',
    amount: 0,
    result: 'new-table',
    payout: 0,
    net: 0,
    status: 'draw',
    cards: [],
  });

  const clearTable = () => {
    setSelectedCards([]);
    setPendingBet(null);
    setQuickResult('ผู้เล่น');
    setBetSide('player');
    setBetAmount(defaultStake);
    setRoadmapRounds([]);
    setExpandedHistoryId(null);
    setHistory((current) => [makeTableOpenEntry(), ...current].slice(0, 12));
    setRoundStatus('โต๊ะถูกเคลียร์แล้ว พร้อมเริ่มเกมใหม่');
    showToast('เคลียร์โต๊ะสำเร็จ เริ่มเกมใหม่ได้เลย', 'info');
  };

  const refreshSession = async (id: string) => {
    const data = await apiGet<ShoeState>(`/sessions/${id}`);
    setShoe(data);
  };

  const createSession = async () => {
    const isConfigured = !!import.meta.env.VITE_API_BASE_URL || window.location.hostname === 'localhost';

    if (!isConfigured) {
      setLoading(false);
      setError('ยังไม่ได้กำหนด backend URL สำหรับโหมด production');
      setRoundStatus('ยังไม่มีเซสชันที่ใช้งาน — ตั้งค่า VITE_API_BASE_URL ก่อนเริ่มเกม');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setRoundStatus(null);
      const data = await apiPost<{ session_id: string; shoe: ShoeState }>('/sessions', {});
      setSessionId(data.session_id);
      setShoe(data.shoe);
      setRoadmapRounds([]);
      setPendingBet(null);
      showToast('เริ่มเซสชันใหม่แล้ว', 'success');
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error(err);
      }
      const message = 'Unable to connect to the backend. Please check the API server.';
      setError(message);
      showToast('ไม่สามารถเชื่อมต่อ API ได้', 'error');
    } finally {
      setLoading(false);
    }
  };

  const submitRound = async () => {
    if (!sessionId) {
      const message = 'No active session. Create a new shoe first.';
      setError(message);
      showToast('ยังไม่มีเซสชันที่ใช้งาน', 'error');
      return;
    }

    const activeBet = pendingBet ?? { side: betSide, amount: betAmount };
    const normalizedResult = quickResult === 'ผู้เล่น' ? 'player' : quickResult === 'เจ้ามือ' ? 'banker' : 'tie';
    const payload: Record<string, unknown> = {
      result: normalizedResult,
      bet_side: activeBet.side,
      bet_amount: activeBet.amount,
    };

    if (tab === 'picker') {
      const playerCards = selectedCards.slice(0, 2);
      const bankerCards = selectedCards.slice(2, 4);
      payload.player_cards = playerCards.length ? playerCards : ['H9', 'H8'];
      payload.banker_cards = bankerCards.length ? bankerCards : ['D7', 'D6'];
    }

    try {
      setLoading(true);
      setError(null);
      const data = await apiPost<{ result: string; total_cards_remaining: number }>(`/sessions/${sessionId}/rounds`, payload);
      const won = normalizedResult === activeBet.side;
      const payout = activeBet.side === 'tie' ? activeBet.amount * 8 : activeBet.amount * 1.95;
      const net = won ? payout - activeBet.amount : -activeBet.amount;
      const nextWallet = wallet + net;
      const historyEntry: RoundHistoryEntry = {
        id: `${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        side: activeBet.side,
        amount: activeBet.amount,
        result: normalizedResult,
        payout: won ? payout : 0,
        net,
        status: won ? 'win' : 'lose',
        cards: [...(selectedCards.length ? selectedCards : ['H9', 'H8', 'D7', 'D6'])],
      };

      setWallet(nextWallet);
      setHistory((current) => [historyEntry, ...current].slice(0, 12));
      setRoadmapRounds((current) => [...current, { result: normalizedResult }]);
      setRoundStatus(
        `${sideMeta[activeBet.side].label} • ฿${activeBet.amount.toLocaleString()} • ${data.result} • ${data.total_cards_remaining} ไพ่คงเหลือ`,
      );
      setSelectedCards([]);
      setQuickResult('ผู้เล่น');
      setPendingBet({ side: betSide, amount: betAmount });
      showToast(won ? `ชนะ! รับ ${payout.toLocaleString()} บาท` : `แพ้ - ตัด ${activeBet.amount.toLocaleString()} บาท`, won ? 'success' : 'info');
      await refreshSession(sessionId);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Unable to record the round.';
      setError(message);
      showToast('บันทึกผลล้มเหลว', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void createSession();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    setPendingBet({ side: betSide, amount: betAmount });
  }, [betSide, betAmount]);

  const handleCardClick = (card: string) => {
    setSelectedCards((current) => {
      if (current.includes(card)) {
        return current.filter((item) => item !== card);
      }

      if (current.length >= 4) {
        showToast('เลือกไพ่ได้สูงสุด 4 ใบต่อหนึ่งรอบ', 'info');
        return current;
      }

      return [...current, card];
    });
  };

  const remainingCount = useMemo(() => shoe.total_cards_remaining, [shoe]);
  const baseProbability = useMemo(() => ({
    player: Number(shoe.probability?.player ?? 0),
    banker: Number(shoe.probability?.banker ?? 0),
    tie: Number(shoe.probability?.tie ?? 0),
  }), [shoe.probability]);
  const recentHistory = useMemo(() => history.filter((entry) => entry.result !== 'new-table').slice(0, predictionWindow), [history, predictionWindow]);
  const prediction = useMemo(() => {
    const recentCounts = { player: 0, banker: 0, tie: 0 };
    recentHistory.forEach((entry) => {
      if (entry.result === 'player' || entry.result === 'banker' || entry.result === 'tie') {
        recentCounts[entry.result] += 1;
      }
    });

    const recentTotal = recentHistory.length || 1;
    const recentShare = {
      player: (recentCounts.player / recentTotal) * 100,
      banker: (recentCounts.banker / recentTotal) * 100,
      tie: (recentCounts.tie / recentTotal) * 100,
    };

    const blended = {
      player: baseProbability.player * 0.8 + recentShare.player * 0.2,
      banker: baseProbability.banker * 0.8 + recentShare.banker * 0.2,
      tie: baseProbability.tie * 0.8 + recentShare.tie * 0.2,
    };

    return {
      player: Math.max(0, Math.min(100, blended.player)),
      banker: Math.max(0, Math.min(100, blended.banker)),
      tie: Math.max(0, Math.min(100, blended.tie)),
    };
  }, [baseProbability, recentHistory]);
  const recommendedWindow = Math.min(Math.max(1, predictionWindow), 12);
  const selectedSummary = selectedCards.length ? selectedCards.join(', ') : 'ยังไม่มีการเลือกไพ่';

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
                กลับ
              </button>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Baccarat</p>
                <h1 className="text-2xl font-semibold tracking-tight">วิเคราะห์ไพ่</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                <Activity className="h-3.5 w-3.5" />
                ออนไลน์
              </span>
              <button
                type="button"
                onClick={clearTable}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
              >
                <RefreshCcw className="h-4 w-4" />
                เคลียร์โต๊ะ
              </button>
            </div>
          </div>
        </div>

        {toast ? (
          <div className="fixed right-4 top-4 z-50 w-[min(92vw,340px)] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 h-2.5 w-2.5 rounded-full ${
                  toast.tone === 'success' ? 'bg-emerald-500' : toast.tone === 'error' ? 'bg-red-500' : 'bg-blue-500'
                }`}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800">{toast.message}</div>
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="text-xs uppercase tracking-[0.2em]">เซสชัน</span>
            </div>
            <div className="text-2xl font-semibold text-slate-900">{loading ? '...' : `${remainingCount}`}</div>
            <div className="text-sm text-slate-500">ไพ่คงเหลือ</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-slate-500">
              <TrendingUp className="h-4 w-4 text-sky-600" />
              <span className="text-xs uppercase tracking-[0.2em]">ผู้เล่น</span>
            </div>
            <div className="text-2xl font-semibold text-slate-900">{(shoe.probability?.player ?? 0).toFixed(1)}%</div>
            <div className="text-sm text-slate-500">อัตราเด่น</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-slate-500">
              <BarChart3 className="h-4 w-4 text-amber-600" />
              <span className="text-xs uppercase tracking-[0.2em]">เจ้ามือ</span>
            </div>
            <div className="text-2xl font-semibold text-slate-900">{(shoe.probability?.banker ?? 0).toFixed(1)}%</div>
            <div className="text-sm text-slate-500">อัตราเด่น</div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">สถานะกองไพ่</h2>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
                {loading ? 'กำลังโหลด...' : `${remainingCount}/3328`}
              </span>
            </div>
            <ProbabilityBar probabilities={shoe.probability || { player: 0, banker: 0, tie: 0 }} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">สภาพไพ่ที่เหลือ</h2>
            <CardMatrix remaining={shoe.cards_remaining || {}} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Betting Panel</p>
              <h2 className="text-lg font-semibold text-slate-900">โต๊ะเดิมพัน</h2>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700">
              <Coins className="h-4 w-4" />
              ฿{wallet.toLocaleString()}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(sideMeta) as Array<keyof typeof sideMeta>).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setBetSide(key)}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                      betSide === key
                        ? `border-transparent ${sideMeta[key].color} text-white shadow-md`
                        : `border-slate-200 bg-slate-50 text-slate-700 ${sideMeta[key].border}`
                    }`}
                  >
                    {sideMeta[key].label}
                  </button>
                ))}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                  <span>จำนวนเงิน</span>
                  <span className="font-medium text-slate-800">฿{betAmount.toLocaleString()}</span>
                </div>

                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-500">กรอกจำนวนเงินเอง</label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={betAmount}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value) || 0;
                      setBetAmount(nextValue);
                      setDefaultStake(nextValue);
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 focus:border-slate-400"
                    placeholder="0"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {betAmounts.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => {
                        setBetAmount(amount);
                        setDefaultStake(amount);
                      }}
                      className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                        betAmount === amount
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      ฿{amount.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>เดิมพันปัจจุบัน</span>
                  <span className="font-semibold text-slate-900">{sideMeta[betSide].label}</span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Stake</div>
                    <div className="text-2xl font-semibold text-slate-900">฿{betAmount.toLocaleString()}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingBet({ side: betSide, amount: betAmount });
                      showToast(`วางเดิมพัน ${sideMeta[betSide].label} จำนวน ฿${betAmount.toLocaleString()}`, 'success');
                    }}
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                  >
                    <WalletCards className="mr-1.5 h-4 w-4" />
                    วางเดิมพัน
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Prediction</p>
                    <h3 className="text-base font-semibold text-slate-900">คาดการณ์รอบต่อไป</h3>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Live</span>
                </div>
                <div className="mb-3 grid grid-cols-4 gap-2">
                  {[4, 6, 8, 12].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPredictionWindow(value)}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
                        predictionWindow === value
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {value} รอบ
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {[
                    { key: 'player', label: 'ผู้เล่น', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
                    { key: 'banker', label: 'เจ้ามือ', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
                    { key: 'tie', label: 'เสมอ', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
                  ].map((group) => (
                    <div key={group.key} className={`rounded-xl border p-2 ${group.bg} ${group.border}`}>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{group.label}</div>
                      <div className={`mt-2 text-lg font-semibold ${group.color}`}>{prediction[group.key as keyof typeof prediction].toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                  แนะนำใช้ {recommendedWindow} รอบล่าสุด เพื่อให้เปอร์เซ็นในรอบต่อไปมีความแม่นยำสูงขึ้น โดยเฉพาะเมื่อมีข้อมูลมากกว่า 8 รอบ
                </div>
              </div>

              {pendingBet ? (
                <div className={`rounded-xl border p-3 ${sideMeta[pendingBet.side].border} ${sideMeta[pendingBet.side].badge}`}>
                  <div className="flex items-center justify-between gap-2 text-sm text-slate-700">
                    <span>เดิมพันที่ยืนยันแล้ว</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold text-white ${sideMeta[pendingBet.side].color}`}>
                      {sideMeta[pendingBet.side].label}
                    </span>
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">฿{pendingBet.amount.toLocaleString()}</div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Card Board</div>
                <div className="text-xs text-slate-500">เลือกไพ่ 4 ใบ</div>
              </div>

              <div className="space-y-3">
                {['H', 'D', 'S', 'C'].map((suit) => (
                  <div key={suit} className="rounded-xl border border-slate-200 bg-white p-2">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <span>{suit}</span>
                      <span>{suit === 'H' ? '♥' : suit === 'D' ? '♦' : suit === 'S' ? '♠' : '♣'}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((rank) => {
                        const card = `${suit}${rank}`;
                        const active = selectedCards.includes(card);
                        return (
                          <PlayingCard
                            key={card}
                            card={card}
                            selected={active}
                            onClick={() => handleCardClick(card)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex rounded-xl border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setTab('picker')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${tab === 'picker' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                เลือกไพ่
              </button>
              <button
                type="button"
                onClick={() => setTab('quick')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${tab === 'quick' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                แบบรวดเร็ว
              </button>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate-700">
              <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-amber-700">Selected Cards</div>
              <div className="font-medium text-slate-900">{selectedSummary}</div>
            </div>

            {tab === 'picker' ? (
              <div className="mt-3 space-y-3">
                <button
                  type="button"
                  onClick={() => void submitRound()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white"
                >
                  <Save className="h-4 w-4" />
                  บันทึกผล
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {['ผู้เล่น', 'เจ้ามือ', 'เสมอ'].map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => setQuickResult(action)}
                      className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                        quickResult === action
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {action}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void submitRound()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white"
                >
                  <Save className="h-4 w-4" />
                  บันทึกผล
                </button>
              </div>
            )}

            {roundStatus ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {roundStatus}
              </div>
            ) : null}
          </div>

          <div className="space-y-5">
            <BigRoad rounds={roadmapRounds} />
            <BeadPlate rounds={roadmapRounds} />
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">History</p>
                  <h3 className="text-base font-semibold text-slate-900">ประวัติรอบ</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                  {history.length} รอบ
                </span>
              </div>

              {history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  ยังไม่มีประวัติรอบ จะแสดงผลที่นี่หลังจากบันทึกเกม
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((item) => {
                    const isExpanded = expandedHistoryId === item.id;
                    const statusText = item.result === 'new-table' ? 'เปิดโต๊ะใหม่' : item.status === 'win' ? 'ชนะ' : item.status === 'lose' ? 'แพ้' : 'เสมอ';
                    const resultLabel =
                      item.result === 'new-table'
                        ? 'เปิดโต๊ะใหม่'
                        : item.result === 'player'
                          ? 'ผู้เล่น'
                          : item.result === 'banker'
                            ? 'เจ้ามือ'
                            : 'เสมอ';

                    return (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <button
                          type="button"
                          onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                          className="flex w-full items-center justify-between gap-2 text-left"
                        >
                          <div>
                            <div className="text-xs text-slate-500">{item.timestamp}</div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">{resultLabel}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${item.result === 'new-table' ? 'bg-slate-200 text-slate-700' : item.status === 'win' ? 'bg-emerald-100 text-emerald-700' : item.status === 'lose' ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-700'}`}>
                              {statusText}
                            </span>
                            <span className="text-xs text-slate-500">{isExpanded ? 'ซ่อน' : 'แสดง'}</span>
                          </div>
                        </button>

                        {isExpanded ? (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                            <div className="mb-2 flex items-center justify-between text-sm text-slate-700">
                              <span>{item.result === 'new-table' ? 'สถานะโต๊ะ' : 'เดิมพัน'}</span>
                              <span className="font-semibold text-slate-900">
                                {item.result === 'new-table' ? 'เริ่มโต๊ะใหม่' : sideMeta[item.side].label}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
                              <div className="rounded-lg bg-slate-50 p-2">
                                <div className="text-slate-500">เดิมพัน</div>
                                <div className="mt-1 font-semibold text-slate-900">฿{item.amount.toLocaleString()}</div>
                              </div>
                              <div className="rounded-lg bg-slate-50 p-2">
                                <div className="text-slate-500">รับ</div>
                                <div className="mt-1 font-semibold text-slate-900">฿{item.payout.toLocaleString()}</div>
                              </div>
                              <div className="rounded-lg bg-slate-50 p-2">
                                <div className="text-slate-500">สุทธิ</div>
                                <div className={`mt-1 font-semibold ${item.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                  {item.net >= 0 ? '+' : '-'}฿{Math.abs(item.net).toLocaleString()}
                                </div>
                              </div>
                            </div>

                            {item.cards.length > 0 ? (
                              <div className="mt-3 text-xs text-slate-600">
                                <span className="font-medium text-slate-700">ไพ่:</span> {item.cards.join(', ')}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {sessionId ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            เซสชันที่กำลังใช้งาน: <span className="font-medium text-slate-900">{sessionId}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
