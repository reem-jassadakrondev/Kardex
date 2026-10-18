import type { GridStats } from '../../api/dtGrid';
import { COLOR_META, COLORS } from './colors';

function modeLabel(stats: GridStats): string {
  if (stats.mode === 'column') return `อิงคอลัมน์ ${stats.position} · ${stats.sample_size.toLocaleString()} รอบ`;
  if (stats.mode === 'row') return `คอลัมน์นี้ยังไม่มีข้อมูล · อิงแถวปัจจุบัน ${stats.sample_size} ช่อง`;
  return 'ยังไม่มีข้อมูล';
}

function rangeLabel(stats: GridStats): string {
  const { from_round: from, to_round: to } = stats.range;
  if (from === null || to === null) return 'ยังไม่มีรอบในช่วงนี้';
  return `ช่วงรอบ ${from.toLocaleString()} – ${to.toLocaleString()}`;
}

/** Hit rates ("อัตราการออก") of each color for the next cell. */
export function StatsPanel({ stats, saving }: { stats: GridStats; saving: number }) {
  const top = stats.sample_size ? Math.max(...COLORS.map((c) => stats.counts[c])) : -1;

  return (
    <section className={saving ? 'dtg-panel dtg-panel--stale' : 'dtg-panel'}>
      <div className="dtg-panel__head">
        <h2 className="dtg-panel__title">อัตราการออก</h2>
        <span className="dtg-panel__sub">
          ช่องถัดไป: รอบ {stats.round_no.toLocaleString()} · คอลัมน์ {stats.position}
        </span>
      </div>
      <p className={`dtg-mode dtg-mode--${stats.mode}`}>{modeLabel(stats)}</p>
      {saving ? <p className="dtg-saving">กำลังบันทึก {saving} รายการ — อัตราจะอัปเดตเมื่อบันทึกครบ</p> : null}

      <ul className="dtg-rates">
        {COLORS.map((color) => {
          const pct = stats.percentages[color];
          const isTop = stats.counts[color] === top && top > 0;
          return (
            <li key={color} className={isTop ? 'dtg-rate dtg-rate--top' : 'dtg-rate'}>
              <span className="dtg-dot dtg-dot--lg" style={{ backgroundColor: COLOR_META[color].bg, color: COLOR_META[color].fg }}>
                {color}
              </span>
              <span className="dtg-rate__bar">
                <span className="dtg-rate__fill" style={{ width: `${pct}%`, backgroundColor: COLOR_META[color].bg }} />
              </span>
              <span className="dtg-rate__pct">{pct.toFixed(1)}%</span>
              <span className="dtg-rate__count">{stats.counts[color].toLocaleString()}</span>
            </li>
          );
        })}
      </ul>
      <p className="dtg-panel__foot">{rangeLabel(stats)} · สถิติความถี่ที่ผ่านมา ไม่ใช่การทำนาย</p>
    </section>
  );
}
