import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dtGridApi, type TableState } from '../api/dtGrid';
import './home.css';

const TABLE_CODE = 'dt-1';

export function HomeLobby() {
  const navigate = useNavigate();
  const [table, setTable] = useState<TableState | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    dtGridApi
      .state(TABLE_CODE, {})
      .then((state) => {
        if (cancelled) return;
        setTable(state);
        setOnline(true);
      })
      .catch(() => {
        if (!cancelled) setOnline(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  let summary = 'กำลังโหลด…';
  if (table) summary = `${table.table.name} · ${table.total_rounds.toLocaleString()} รอบ`;
  else if (online === false) summary = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';

  return (
    <div className="home">
      <header className="home__header">
        <span className="home__brand">Kardex</span>
        {online === null ? null : (
          <span className={online ? 'home__status home__status--on' : 'home__status home__status--off'}>
            {online ? 'ออนไลน์' : 'ออฟไลน์'}
          </span>
        )}
      </header>

      <button type="button" className="home__entry" onClick={() => navigate('/dragon-tiger')}>
        <span className="home__entry-text">
          <span className="home__entry-title">เสือมังกร</span>
          <span className="home__entry-sub">{summary}</span>
        </span>
        <ChevronRight className="home__chevron" />
      </button>
    </div>
  );
}
