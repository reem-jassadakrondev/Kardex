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

/** Calc page (หน้าคำนวณ): 3 colors. Joker replaces green and is a wildcard when matching. */
export type CalcColor = 'R' | 'B' | 'J';
export const CALC_COLORS: CalcColor[] = ['R', 'B', 'J'];
export const JOKER_META = { label: 'Joker', bg: '#7c3aed', fg: '#ffffff' };

/** Chip colors for any cell value (5 colors + Joker); null for skipped / empty cells. */
export function cellMeta(value: string): { label: string; bg: string; fg: string } | null {
  if (isColor(value)) return COLOR_META[value];
  return value === 'J' ? JOKER_META : null;
}

/** Stored cell as seen on the calc page: green, yellow and black are all Joker. */
export function toCalc(value: string): string {
  return value === 'G' || value === 'Y' || value === 'K' ? 'J' : value;
}
