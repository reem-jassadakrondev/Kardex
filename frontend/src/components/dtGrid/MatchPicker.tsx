import type { MatchesResult } from '../../api/dtGrid';

type MatchSummary = Pick<MatchesResult, 'window_from' | 'window_to' | 'pattern' | 'total_matches'>;
import { cellMeta } from './colors';
import { WINDOW_OPTIONS } from './range';

interface MatchPickerProps {
  size: number;
  match: MatchSummary | null;
  stale: boolean;
  onChange: (size: number) => void;
  /** Shown before the first cell is typed. */
  hint?: string;
  /** false: only the result line (the chips are shown elsewhere on the page). */
  showChips?: boolean;
}

/** How many of the current round's latest cells to match earlier rounds against (จับคู่แถว). */
export function MatchPicker({ size, match, stale, onChange, hint, showChips = true }: MatchPickerProps) {
  const filtering = !!match && match.window_from !== null;

  return (
    <div className="dtg-range">
      <span className="dtg-range__label">จับคู่</span>
      {(showChips ? WINDOW_OPTIONS : []).map((option) => (
        <button
          key={option}
          type="button"
          className={option === size ? 'dtg-chip dtg-chip--active' : 'dtg-chip'}
          onClick={() => onChange(option)}
        >
          {option ? `${option} ช่องล่าสุด` : 'ทั้งแถว'}
        </button>
      ))}
      <span className={stale ? 'dtg-match dtg-match--stale' : 'dtg-match'}>
        {filtering && match ? (
          <>
            ช่อง {match.window_from}–{match.window_to}{' '}
            {match.pattern.split('').map((value, i) => {
              const meta = cellMeta(value);
              return meta ? (
                <span key={i} className="dtg-dot dtg-dot--sm" style={{ backgroundColor: meta.bg, color: meta.fg }}>
                  {value}
                </span>
              ) : (
                <span key={i} className="dtg-dot dtg-dot--sm dtg-dot--skip">
                  –
                </span>
              );
            })}{' '}
            → ตรงกัน <b>{(match.total_matches || 0).toLocaleString()}</b> แถว
          </>
        ) : (
          hint || 'กรอกช่องแรกของรอบแล้วตารางจะเหลือเฉพาะแถวที่ตรงกัน'
        )}
      </span>
    </div>
  );
}
