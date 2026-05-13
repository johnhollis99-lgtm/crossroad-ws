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

export { AudienceMark }       from './AudienceMark';
export type { AudienceMarkProps, AudienceMarkType, AudienceMarkSize, AudienceMarkTone } from './AudienceMark';

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

export { LabeledSlider } from './LabeledSlider';
export type { LabeledSliderProps } from './LabeledSlider';

export { PersonaPill } from './PersonaPill';
export type { PersonaPillProps } from './PersonaPill';

export { StoriesBadge } from './StoriesBadge';
export type { StoriesBadgeProps } from './StoriesBadge';

export { TripStat } from './TripStat';
export type { TripStatProps } from './TripStat';
