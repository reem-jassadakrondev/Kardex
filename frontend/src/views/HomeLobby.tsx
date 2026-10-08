import { BarChart3, Dice5, Gauge, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../api/client';
import { GameCard } from '../components/GameCard';
import { Navbar } from '../components/Navbar';

interface GameOption {
  code: string;
  name: string;
  is_active: boolean;
  rules_config?: Record<string, unknown>;
}

const fallbackGames: GameOption[] = [
  { code: 'baccarat', name: 'บาคาร่า', is_active: true },
  { code: 'pokdeng', name: 'โพกเด้ง', is_active: false },
  { code: 'sic_bo', name: 'Sic Bo', is_active: false },
];

export function HomeLobby() {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameOption[]>(fallbackGames);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadGames = async () => {
      const isConfigured = !!import.meta.env.VITE_API_BASE_URL || window.location.hostname === 'localhost';

      if (!isConfigured) {
        setGames(fallbackGames);
        setIsLoading(false);
        return;
      }

      try {
        const data = await apiGet<GameOption[]>('/games');
        if (Array.isArray(data) && data.length > 0) {
          setGames(data);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Could not load live games:', error);
        }
        setGames(fallbackGames);
      } finally {
        setIsLoading(false);
      }
    };

    void loadGames();
  }, []);

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <Navbar />

        {isLoading ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            กำลังโหลดเกมจากเซิร์ฟเวอร์...
          </div>
        ) : null}

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {games.map((game) => {
            const isBaccarat = game.code === 'baccarat';
            const isAvailable = game.is_active || isBaccarat;
            const iconMap = {
              baccarat: Gauge,
              pokdeng: Dice5,
              dragon_tiger: BarChart3,
              sic_bo: Sparkles,
            };

            return (
              <GameCard
                key={game.code}
                title={game.name}
                subtitle={
                  isAvailable
                    ? 'ตรวจสอบไพ่ที่เหลือ • อัตราผลแบบเรียลไทม์'
                    : 'แผนงานสำหรับโต๊ะเกมในอนาคต'
                }
                active={isAvailable}
                badge={isAvailable ? undefined : 'เร็วๆ นี้'}
                actionLabel={isAvailable ? 'เข้าตาราง' : undefined}
                onAction={isAvailable ? () => navigate('/baccarat') : undefined}
                icon={iconMap[game.code as keyof typeof iconMap] || Gauge}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
