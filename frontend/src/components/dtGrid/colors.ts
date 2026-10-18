import type { Color } from '../../api/dtGrid';

export const COLORS: Color[] = ['R', 'B', 'Y', 'K', 'G'];

/** Hex on purpose: old Safari (iOS ≤ 12.0) can't parse Tailwind's `rgb(r g b / a)` colors. */
export const COLOR_META: Record<Color, { label: string; bg: string; fg: string }> = {
  R: { label: 'แดง', bg: '#dc2626', fg: '#ffffff' },
  B: { label: 'น้ำเงิน', bg: '#2563eb', fg: '#ffffff' },
  Y: { label: 'เหลือง', bg: '#facc15', fg: '#422006' },
  K: { label: 'ดำ', bg: '#18181b', fg: '#ffffff' },
  G: { label: 'เขียว', bg: '#16a34a', fg: '#ffffff' },
};

export function isColor(value: string): value is Color {
  return value === 'R' || value === 'B' || value === 'Y' || value === 'K' || value === 'G';
}
