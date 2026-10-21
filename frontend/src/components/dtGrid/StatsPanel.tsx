import type { Color, GridStats, MatchesResult } from '../../api/dtGrid';
import { COLOR_META, COLORS } from './colors';

function modeLabel(stats: GridStats): string {
  if (stats.mode === 'column') return `ทุกแถว · คอลัมน์ ${stats.position} · ${stats.sample_size.toLocaleString()} รอบ`;
  if (stats.mode === 'row') return `คอลัมน์นี้ยังไม่มีข้อมูล · อิงแถวปัจจุบัน ${stats.sample_size} ช่อง`;
  return 'ยังไม่มีข้อมูล';
}

function rangeLabel(stats: GridStats): string {
  const { from_round: from, to_round: to } = stats.range;
  if (from === null || to === null) return 'ยังไม่มีรอบในช่วงนี้';
  return `ช่วงรอบ ${from.toLocaleString()} – ${to.toLocaleString()}`;
}

function Rates({ counts, percentages, size }: { counts: Record<Color, number>; percentages: Record<Color, number>; size: 'lg' | 'sm' }) {
  const total = COLORS.reduce((sum, c) => sum + counts[c], 0);
  const top = total ? Math.max(...COLORS.map((c) => counts[c])) : -1;
  return (
    <ul className={size === 'sm' ? 'dtg-rates dtg-rates--sm' : 'dtg-rates'}>
      {COLORS.map((color) => {
        const pct = percentages[color];
        const isTop = counts[color] === top && top > 0;
        return (
          <li key={color} className={isTop ? 'dtg-rate dtg-rate--top' : 'dtg-rate'}>
            <span
              className={size === 'sm' ? 'dtg-dot' : 'dtg-dot dtg-dot--lg'}
              style={{ backgroundColor: COLOR_META[color].bg, color: COLOR_META[color].fg }}
            >
              {color}
            </span>
            <span className="dtg-rate__bar">
              <span className="dtg-rate__fill" style={{ width: `${pct}%`, backgroundColor: COLOR_META[color].bg }} />
            </span>
            <span className="dtg-rate__pct">{pct.toFixed(1)}%</span>
            <span className="dtg-rate__count">{counts[color].toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}

interface StatsPanelProps {
  stats: GridStats;
  saving: number;
  /** Matching result when the current round has cells; its rates come first. */
  match: MatchesResult | null;
  matchStale: boolean;
}

/** Hit rates ("อัตราการออก") of each color for the next cell: among matching rows, and among all rows. */
export function StatsPanel({ stats, saving, match, matchStale }: StatsPanelProps) {
  const filtering = !!match && match.window_from !== null && stats.position > 1;

  return (
    <section className={saving ? 'dtg-panel dtg-panel--stale' : 'dtg-panel'}>
      <div className="dtg-panel__head">
        <h2 className="dtg-panel__title">อัตราการออก</h2>
        <span className="dtg-panel__sub">
          ช่องถัดไป: รอบ {stats.round_no.toLocaleString()} · คอลัมน์ {stats.position}
        </span>
      </div>
      {saving ? <p className="dtg-saving">กำลังบันทึก {saving} รายการ — อัตราจะอัปเดตเมื่อบันทึกครบ</p> : null}

      {filtering && match ? (
        <div className={matchStale ? 'dtg-matchstats dtg-matchstats--stale' : 'dtg-matchstats'}>
          <p className="dtg-mode dtg-mode--match">
            แถวที่ตรงกัน (ช่อง {match.window_from}–{match.window_to}) · {(match.total_matches || 0).toLocaleString()} แถว
            {match.total_matches && match.sample_size !== match.total_matches
              ? ` · มีสีคอลัมน์ ${stats.position} ${match.sample_size.toLocaleString()} แถว`
              : ''}
          </p>
          {match.sample_size ? (
            <Rates counts={match.counts} percentages={match.percentages} size="lg" />
          ) : (
            <p className="dtg-panel__empty">ไม่มีแถวที่ตรงกัน — ลองลดจำนวนช่องที่จับคู่</p>
          )}
        </div>
      ) : null}

      <p className={`dtg-mode dtg-mode--${stats.mode}`}>{modeLabel(stats)}</p>
      <Rates counts={stats.counts} percentages={stats.percentages} size={filtering ? 'sm' : 'lg'} />
      <p className="dtg-panel__foot">{rangeLabel(stats)} · สถิติความถี่ที่ผ่านมา ไม่ใช่การทำนาย</p>
    </section>
  );
}
