/**
 * XRoad component library — barrel exports (Pine).
 *
 * All components consume tokens from src/design/theme.ts via useTheme().
 * No hardcoded hex outside src/design/tokens.ts; no fontFamily/fontSize
 * literals outside theme.textVariants — Wordmark, PrimaryButton,
 * DangerButton, NarrationCard, PoiCallout, CoordinatesPill, and PoiMarkerX
 * each carry one documented exception where the Pine spec calls for an
 * off-ramp size or paintOrder discipline the ramp doesn't cover.
 *
 * `FieldNotesDivider` retains its name for API continuity — it predates
 * the Pine rename but the visual is now Pine-themed (line color, no
 * other vestiges).
 */

// Migration Batch 2 (Track C, 2026-05-22): AudienceMark retired and
// replaced by NarratorMark — addendum §5 collapses the 4-glyph audience
// taxonomy (family/kids/unfiltered/local) to the 2-narrator model
// (narrator_a/narrator_b). NarratorMark defaults to letter monograms
// ("W"/"S") until the J1b 2-card picker lands richer iconography.
export { NarratorMark }       from './NarratorMark';
export type { NarratorMarkProps, NarratorMarkType, NarratorMarkSize, NarratorMarkTone } from './NarratorMark';

export { Card }               from './Card';
export type { CardProps, CardVariant, CardRadius } from './Card';

export { CategoryChip }       from './CategoryChip';
export type { CategoryChipProps } from './CategoryChip';

export { CoordinatesPill }    from './CoordinatesPill';
export type { CoordinatesPillProps } from './CoordinatesPill';

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

export { PoiCallout }         from './PoiCallout';
export type { PoiCalloutProps, PoiCalloutPoi } from './PoiCallout';

export { PoiMarkerX, usePoiMarkerTracking } from './PoiMarkerX';
export type { PoiMarkerXProps, PoiMarkerXSize } from './PoiMarkerX';

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

// Phase 2 additions

export {
  IconArrowLeft,
  IconPlay,
  IconPause,
  IconSkipBack,
  IconSkipFwd,
  IconVolume,
  IconVolumeOff,
  IconMic,
  IconSparkle,
  IconCar,
  IconHike,
  IconClose,
  IconHistory,
  IconNature,
  IconArchitecture,
  IconFood,
  IconMusic,
  IconArt,
  IconWeird,
  IconRoadside,
  IconFilm,
  IconScience,
} from './Icons';
export type { IconProps } from './Icons';

export { SegmentedTrio } from './SegmentedTrio';
export type { SegmentedTrioProps, SegmentedTrioOption } from './SegmentedTrio';

export { NarratorCard } from './NarratorCard';
export type { NarratorCardProps } from './NarratorCard';

export { OptionCard } from './OptionCard';
export type { OptionCardProps } from './OptionCard';

export { LabeledSlider } from './LabeledSlider';
export type { LabeledSliderProps } from './LabeledSlider';

export { PersonaPill } from './PersonaPill';
export type { PersonaPillProps } from './PersonaPill';

export { StoriesBadge } from './StoriesBadge';
export type { StoriesBadgeProps } from './StoriesBadge';

export { TripStat } from './TripStat';
export type { TripStatProps } from './TripStat';
