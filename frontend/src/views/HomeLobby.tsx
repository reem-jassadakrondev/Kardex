import { ChevronRight, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorDetail } from '../api/client';
import { lastTable, tablesApi, type TableSummary } from '../api/tables';
import './home.css';

function deletedOn(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return isNaN(date.getTime()) ? '' : `ลบเมื่อ ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

export function HomeLobby() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [trash, setTrash] = useState<TableSummary[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [purging, setPurging] = useState<string | null>(null); // code of the trashed table being confirmed
  const [purgeName, setPurgeName] = useState('');
  const recent = lastTable();

  const load = useCallback(
    () =>
      Promise.all([tablesApi.list(), tablesApi.list(true)])
        .then(([active, deleted]) => {
          setTables(active);
          setTrash(deleted);
          setOnline(true);
        })
        .catch(() => setOnline(false)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs a table action, shows its error, then reloads both lists. */
  const act = (action: Promise<unknown>, failure: string, after?: () => void) => {
    setBusy(true);
    setError('');
    action
      .then(() => {
        if (after) after();
        return load();
      })
      .catch((err: unknown) => setError(errorDetail(err, failure)))
      .then(() => setBusy(false));
  };

  const create = () => {
    if (!newName.trim() || busy) return;
    act(tablesApi.create(newName), 'เพิ่มโต๊ะไม่สำเร็จ', () => {
      setAdding(false);
      setNewName('');
    });
  };

  const purgeTarget = trash.filter((t) => t.code === purging)[0];

  return (
    <div className="home">
      <header className="home__header">
        <span className="home__brand">ระบบเก็บสถิติ</span>
        {online === null ? null : (
          <span className={online ? 'home__status home__status--on' : 'home__status home__status--off'}>
            {online ? 'ออนไลน์' : 'ออฟไลน์'}
          </span>
        )}
      </header>

      {online === false ? <p className="home__error">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</p> : null}
      {tables === null && online !== false ? <p className="home__muted">กำลังโหลด…</p> : null}

      {tables
        ? tables.map((table) => (
            <button key={table.code} type="button" className="home__entry" onClick={() => navigate(`/t/${table.code}`)}>
              <span className="home__entry-text">
                <span className="home__entry-title">
                  {table.name}
                  {table.code === recent ? <span className="home__tag">ล่าสุด</span> : null}
                </span>
                <span className="home__entry-sub">{table.total_rounds.toLocaleString()} รอบ</span>
              </span>
              <ChevronRight className="home__chevron" />
            </button>
          ))
        : null}

      {tables && tables.length === 0 ? <p className="home__muted">ยังไม่มีโต๊ะ — เพิ่มโต๊ะแรกได้เลย</p> : null}

      {tables ? (
        adding ? (
          <div className="home__form">
            <input
              className="home__input"
              placeholder="ชื่อโต๊ะ เช่น โต๊ะ 2"
              value={newName}
              maxLength={50}
              autoFocus
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') create();
                if (event.key === 'Escape') setAdding(false);
              }}
            />
            <button type="button" className="home__btn home__btn--dark" onClick={create} disabled={busy || !newName.trim()}>
              เพิ่ม
            </button>
            <button
              type="button"
              className="home__btn"
              onClick={() => {
                setAdding(false);
                setError('');
              }}
            >
              ยกเลิก
            </button>
          </div>
        ) : (
          <button type="button" className="home__add" onClick={() => setAdding(true)}>
            <Plus className="home__add-icon" />
            เพิ่มโต๊ะ
          </button>
        )
      ) : null}

      {error ? <p className="home__error">{error}</p> : null}

      {trash.length ? (
        <div className="home__trash">
          <button type="button" className="home__link" onClick={() => setShowTrash(!showTrash)}>
            โต๊ะที่ลบแล้ว ({trash.length}) {showTrash ? '▴' : '▾'}
          </button>
          {showTrash
            ? trash.map((table) => (
                <div key={table.code} className="home__trash-row">
                  <span className="home__trash-text">
                    <span className="home__trash-name">{table.name}</span>
                    <span className="home__entry-sub">
                      {table.total_rounds.toLocaleString()} รอบ · {deletedOn(table.deleted_at)}
                    </span>
                  </span>
                  <button type="button" className="home__btn" disabled={busy} onClick={() => act(tablesApi.restore(table.code), 'กู้คืนไม่สำเร็จ')}>
                    กู้คืน
                  </button>
                  <button
                    type="button"
                    className="home__btn home__btn--danger"
                    disabled={busy}
                    onClick={() => {
                      setPurging(purging === table.code ? null : table.code);
                      setPurgeName('');
                    }}
                  >
                    ลบถาวร
                  </button>
                </div>
              ))
            : null}
          {showTrash && purgeTarget ? (
            <div className="home__confirm">
              <p>
                ลบ <b>{purgeTarget.name}</b> และข้อมูล {purgeTarget.total_rounds.toLocaleString()} รอบ <b>ถาวร</b> กู้คืนไม่ได้ —
                พิมพ์ชื่อโต๊ะเพื่อยืนยัน
              </p>
              <input className="home__input" value={purgeName} onChange={(event) => setPurgeName(event.target.value)} />
              <button
                type="button"
                className="home__btn home__btn--danger"
                disabled={busy || purgeName.trim() !== purgeTarget.name}
                onClick={() => act(tablesApi.purge(purgeTarget.code, purgeName), 'ลบถาวรไม่สำเร็จ', () => setPurging(null))}
              >
                ลบถาวร
              </button>
              <button type="button" className="home__btn" onClick={() => setPurging(null)}>
                ยกเลิก
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
