import type { StatsScope } from '../../api/dtGrid';

/** Which rounds the hit rates are computed from. Persisted per device. */
export type RangePreset =
  | { kind: 'all' }
  | { kind: 'last'; count: number }
  | { kind: 'custom'; from?: number; to?: number };

export function scopeOf(preset: RangePreset): StatsScope {
  if (preset.kind === 'last') return { last_rounds: preset.count };
  if (preset.kind === 'custom') return { from_round: preset.from, to_round: preset.to };
  return {};
}
