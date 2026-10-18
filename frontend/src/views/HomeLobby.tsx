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
  { code: 'dragon_tiger', name: 'เสือมังกร', is_active: true },
  { code: 'pokdeng', name: 'โพกเด้ง', is_active: false },
  { code: 'sic_bo', name: 'Sic Bo', is_active: false },
];

export function HomeLobby() {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameOption[]>(fallbackGames);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadGames = async () => {
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

        {/* flex-wrap + padding instead of grid/gap: old iPads (iOS < 10.3) have neither */}
        <div className="-mx-2.5 mt-8 flex flex-wrap">
          {games.map((game) => {
            const isBaccarat = game.code === 'baccarat';
            const isDragonTiger = game.code === 'dragon_tiger';
            const isAvailable = game.is_active || isBaccarat || isDragonTiger;
            const iconMap = {
              baccarat: Gauge,
              dragon_tiger: BarChart3,
              pokdeng: Dice5,
              sic_bo: Sparkles,
            };

            return (
              <div key={game.code} className="mb-5 w-full px-2.5 md:w-1/2 xl:w-1/4">
                <GameCard
                  title={game.name}
                  subtitle={
                    isAvailable
                      ? 'ตรวจสอบไพ่ที่เหลือ • อัตราผลแบบเรียลไทม์'
                      : 'แผนงานสำหรับโต๊ะเกมในอนาคต'
                  }
                  active={isAvailable}
                  badge={isAvailable ? undefined : 'เร็วๆ นี้'}
                  actionLabel={isAvailable ? 'เข้าตาราง' : undefined}
                  onAction={
                    isAvailable
                      ? () => navigate(isDragonTiger ? '/dragon-tiger' : isBaccarat ? '/baccarat' : '/')
                      : undefined
                  }
                  icon={iconMap[game.code as keyof typeof iconMap] || Gauge}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
