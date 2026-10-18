import type { Color } from '../../api/dtGrid';
import { COLOR_META, COLORS } from './colors';

interface InputPadProps {
  colorsEnabled: boolean;
  canUndo: boolean;
  canEndOrDiscard: boolean;
  onColor: (color: Color) => void;
  onSkip: () => void;
  onUndo: () => void;
  onEndRound: () => void;
  onDiscardRound: () => void;
}

/** Big tap targets: one tap records a color into the highlighted cell. */
export function InputPad({ colorsEnabled, canUndo, canEndOrDiscard, onColor, onSkip, onUndo, onEndRound, onDiscardRound }: InputPadProps) {
  return (
    <section className="dtg-panel">
      <div className="dtg-pad">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className="dtg-colorbtn"
            style={{ backgroundColor: COLOR_META[color].bg, color: COLOR_META[color].fg }}
            disabled={!colorsEnabled}
            onClick={() => onColor(color)}
            aria-label={COLOR_META[color].label}
          >
            <span className="dtg-colorbtn__key">{color}</span>
            <span className="dtg-colorbtn__label">{COLOR_META[color].label}</span>
          </button>
        ))}
      </div>

      <div className="dtg-actions">
        <button type="button" className="dtg-btn" disabled={!canUndo} onClick={onUndo}>
          ↶ ลบตัวสุดท้าย
        </button>
        <button type="button" className="dtg-btn" disabled={!colorsEnabled} onClick={onSkip}>
          ⏭ ข้ามช่อง
        </button>
        <button type="button" className="dtg-btn" disabled={!canEndOrDiscard} onClick={onEndRound}>
          ⏹ จบรอบ
        </button>
        <button type="button" className="dtg-btn dtg-btn--danger" disabled={!canEndOrDiscard} onClick={onDiscardRound}>
          ✕ ทิ้งรอบนี้
        </button>
      </div>
      <p className="dtg-hint">
        แป้นพิมพ์: R B Y K G = บันทึกสี · − = ข้ามช่อง · Backspace = ลบตัวสุดท้าย
      </p>
    </section>
  );
}
