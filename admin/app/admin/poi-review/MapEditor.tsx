// Client-only — dynamically imported with { ssr: false } from EditModal
import { useState } from 'react';
import Map, { Marker } from 'react-map-gl/mapbox';
import type { MapMouseEvent } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Props {
  initialLng: number | null;
  initialLat: number | null;
  token:      string;
  onChange:   (lng: number, lat: number) => void;
}

// Default centre: California
const DEFAULT_LNG = -119.5;
const DEFAULT_LAT =   37.3;

export default function MapEditor({ initialLng, initialLat, token, onChange }: Props) {
  const [pos, setPos] = useState<{ lng: number; lat: number } | null>(
    initialLng != null && initialLat != null ? { lng: initialLng, lat: initialLat } : null,
  );

  const viewLng = pos?.lng ?? DEFAULT_LNG;
  const viewLat = pos?.lat ?? DEFAULT_LAT;

  function place(lng: number, lat: number) {
    setPos({ lng, lat });
    onChange(lng, lat);
  }

  function handleMapClick(e: MapMouseEvent) {
    if (!pos) place(e.lngLat.lng, e.lngLat.lat);
  }

  return (
    <div className="relative">
      <Map
        mapboxAccessToken={token}
        initialViewState={{ longitude: viewLng, latitude: viewLat, zoom: pos ? 12 : 6 }}
        style={{ width: '100%', height: 300 }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        onClick={handleMapClick}
        cursor={pos ? 'grab' : 'crosshair'}
      >
        {pos && (
          <Marker
            longitude={pos.lng}
            latitude={pos.lat}
            draggable
            onDragEnd={(e) => place(e.lngLat.lng, e.lngLat.lat)}
          />
        )}
      </Map>
      <p className="text-xs text-gray-400 mt-1">
        {pos
          ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} — drag pin to adjust`
          : 'Click on the map to place a pin'}
      </p>
    </div>
  );
}
