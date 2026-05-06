import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import Map, { Marker as MGLMarker, Source, Layer } from 'react-map-gl/mapbox';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

// Inject Mapbox CSS once
if (typeof document !== 'undefined' && !document.getElementById('mapbox-gl-css')) {
  const link = document.createElement('link');
  link.id = 'mapbox-gl-css';
  link.rel = 'stylesheet';
  link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.12.0/mapbox-gl.css';
  document.head.appendChild(link);
}

const MAPTYPE_TO_MAPBOX = {
  standard:  'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  hybrid:    'mapbox://styles/mapbox/satellite-streets-v12',
  terrain:   'mapbox://styles/mapbox/outdoors-v12',
  none:      'mapbox://styles/mapbox/streets-v12',
};

function resolveMapboxStyle(mapType, customMapStyle) {
  // Non-empty customMapStyle array signals the dark theme
  if (Array.isArray(customMapStyle) && customMapStyle.length > 0) {
    return 'mapbox://styles/mapbox/dark-v11';
  }
  return MAPTYPE_TO_MAPBOX[mapType] ?? 'mapbox://styles/mapbox/dark-v11';
}

function latDeltaToZoom(latitudeDelta) {
  return Math.round(Math.log2(180 / latitudeDelta));
}

const MapView = forwardRef(function MapView(
  { style, initialRegion, showsUserLocation, mapType, customMapStyle, onPress, children },
  ref
) {
  const mapRef = useRef(null);
  const mapboxStyle = resolveMapboxStyle(mapType, customMapStyle);

  const handleDblClick = useCallback((e) => {
    if (!onPress) return;
    const [longitude, latitude] = e.lngLat.toArray();
    onPress({ nativeEvent: { coordinate: { latitude, longitude } } });
  }, [onPress]);

  useImperativeHandle(ref, () => ({
    animateToRegion(region, duration) {
      mapRef.current?.flyTo({
        center: [region.longitude, region.latitude],
        zoom: latDeltaToZoom(region.latitudeDelta ?? 0.08),
        duration: duration ?? 800,
      });
    },
    fitToCoordinates(coords, options) {
      if (!coords?.length) return;
      const lngs = coords.map(c => c.longitude);
      const lats = coords.map(c => c.latitude);
      const pad = options?.edgePadding ?? { top: 40, right: 40, bottom: 40, left: 40 };
      mapRef.current?.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: pad, duration: 800 }
      );
    },
    animateCamera({ zoom, center, heading } = {}, options) {
      mapRef.current?.flyTo({
        ...(zoom !== undefined && { zoom }),
        ...(center && { center: [center.longitude, center.latitude] }),
        ...(heading !== undefined && { bearing: heading }),
        duration: options?.duration ?? 500,
      });
    },
  }));

  const initialViewState = {
    longitude: initialRegion?.longitude ?? -118.33,
    latitude:  initialRegion?.latitude  ?? 34.18,
    zoom: latDeltaToZoom(initialRegion?.latitudeDelta ?? 0.12),
  };

  return (
    <View style={style}>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapboxStyle}
        logoPosition="bottom-right"
        onDblClick={handleDblClick}
      >
        {children}
      </Map>
    </View>
  );
});

// ── Polyline ──────────────────────────────────────────────────────────────────
let _pid = 0;
function Polyline({ coordinates, strokeColor = '#388bfd', strokeWidth = 4 }) {
  const id = useRef(`poly-${_pid++}`).current;
  if (!coordinates?.length) return null;
  const data = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coordinates.map(c => [c.longitude, c.latitude]),
    },
  };
  return (
    <Source id={id} type="geojson" data={data}>
      <Layer
        id={`${id}-line`}
        type="line"
        layout={{ 'line-join': 'round', 'line-cap': 'round' }}
        paint={{ 'line-color': strokeColor, 'line-width': strokeWidth }}
      />
    </Source>
  );
}

// ── Marker ────────────────────────────────────────────────────────────────────
function Marker({ coordinate, onPress, anchor, children }) {
  if (!coordinate) return null;
  return (
    <MGLMarker
      longitude={coordinate.longitude}
      latitude={coordinate.latitude}
      anchor={anchor?.x === 0.5 && anchor?.y === 0.5 ? 'center' : 'bottom'}
      onClick={onPress}
    >
      {children ?? (
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#388bfd' }} />
      )}
    </MGLMarker>
  );
}

const PROVIDER_GOOGLE = 'google';

export default MapView;
export { Marker, Polyline, PROVIDER_GOOGLE };
