/**
 * Xroad component library — barrel exports.
 *
 * All components consume tokens from src/design/theme.ts via useTheme().
 * No hardcoded hex outside src/design/tokens.ts; no fontFamily/fontSize
 * literals outside theme.textVariants (with one localized exception in
 * Wordmark + PrimaryButton/DangerButton/NarrationCard where the spec
 * explicitly calls for off-ramp sizes that the type ramp does not cover).
 */

export { AudienceMark }       from './AudienceMark';
export type { AudienceMarkProps, AudienceMarkType, AudienceMarkSize, AudienceMarkTone } from './AudienceMark';

export { Card }               from './Card';
export type { CardProps, CardVariant, CardRadius } from './Card';

export { DangerButton }       from './DangerButton';
export type { DangerButtonProps } from './DangerButton';

export { FieldNotesDivider }  from './FieldNotesDivider';
export type { FieldNotesDividerProps } from './FieldNotesDivider';

export { GlassPill }          from './GlassPill';
export type { GlassPillProps } from './GlassPill';

export { Kicker }             from './Kicker';
export type { KickerProps }   from './Kicker';

export { ModePillRow }        from './ModePillRow';
export type { ModePillRowProps, ModePillValue } from './ModePillRow';

export { NarrationCard }      from './NarrationCard';
export type { NarrationCardProps } from './NarrationCard';

export { OfflineBadge }       from './OfflineBadge';
export type { OfflineBadgeProps, OfflineState } from './OfflineBadge';

export { PrimaryButton }      from './PrimaryButton';
export type { PrimaryButtonProps } from './PrimaryButton';

export { SegmentedControl }   from './SegmentedControl';
export type { SegmentedControlProps, SegmentOption } from './SegmentedControl';

export { Waveform }           from './Waveform';
export type { WaveformProps } from './Waveform';

export { Wordmark }           from './Wordmark';
export type { WordmarkProps, WordmarkSize, WordmarkTone } from './Wordmark';
