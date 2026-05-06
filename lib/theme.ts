/**
 * RoadStory — design tokens
 * Single source of truth for the dark earthy palette.
 */

export const C = {
  BG_BASE:        '#1a1208',
  BG_SURFACE:     '#261A0C',
  BG_ELEVATED:    'rgba(255,255,255,0.04)',
  BORDER_SUBTLE:  'rgba(160,124,82,0.25)',
  BORDER_STRONG:  'rgba(160,124,82,0.45)',
  TEXT_PRIMARY:   '#F5F0E8',
  TEXT_SECONDARY: '#C4B89A',
  TEXT_TERTIARY:  '#A07C52',
  ACCENT:         '#639922',
  ACCENT_LIGHT:   'rgba(99,153,34,0.15)',
  ACCENT_BORDER:  'rgba(99,153,34,0.6)',
  ACCENT_TEXT:    '#97C459',
  WARNING:        '#BA7517',
  WARNING_BRIGHT: '#FAC775',
  DANGER:         '#D85A30',
  STOP:           '#5DCAA5',
  WHITE:          '#FFFFFF',
} as const;

export const WARM_DARK_MAP = [
  { elementType: 'geometry',           stylers: [{ color: '#1c140a' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#A07C52' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1208' }] },
  { featureType: 'road',          elementType: 'geometry',       stylers: [{ color: '#2d1e0c' }] },
  { featureType: 'road.arterial', elementType: 'geometry',       stylers: [{ color: '#3d2910' }] },
  { featureType: 'road.highway',  elementType: 'geometry',       stylers: [{ color: '#4a3215' }] },
  { featureType: 'road.highway',  elementType: 'geometry.stroke', stylers: [{ color: '#614020' }] },
  { featureType: 'water',         elementType: 'geometry',       stylers: [{ color: '#0a1628' }] },
  { featureType: 'landscape',     elementType: 'geometry',       stylers: [{ color: '#1a1208' }] },
  { featureType: 'poi',           stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',       stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry',      stylers: [{ color: '#2d1e0c' }] },
  { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#A07C52' }] },
];
