/**
 * RoadStory — hooks/usePOIStream.ts
 *
 * Watches live GPS and fires story events when the driver
 * enters the trigger radius of an upcoming POI.
 *
 * Trigger logic:
 *   - POIs are sorted by position along the route (already ordered by Supabase RPC)
 *   - Each POI fires once when driver is within triggerRadiusM meters
 *   - Heading check (driving only, radius >= 200m): skip POIs that are behind or
 *     perpendicular to the direction of travel — they require leaving the route
 *   - Played POIs are tracked so they never repeat in the same session
 *   - Respects paused state
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import * as Location from 'expo-location';
import type { POI } from '../lib/supabase';

const TRIGGER_RADIUS_M   = 400;   // default fire radius (driving)
const GPS_INTERVAL_MS    = 5000;  // check GPS every 5s
const GPS_DISTANCE_M     = 30;    // minimum movement to trigger GPS update
const HEADING_TOLERANCE  = 120;   // ±120° forward arc — filters POIs behind the user

function distanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Bearing in degrees (0–360, clockwise from true north) from point 1 → point 2
function bearingDeg(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const φ1   = lat1 * Math.PI / 180;
  const φ2   = lat2 * Math.PI / 180;
  const y    = Math.sin(dLng) * Math.cos(φ2);
  const x    = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

// Smallest angular difference between two bearings (0–180)
function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

interface UsePOIStreamOptions {
  pois: POI[];
  paused: boolean;
  onStoryFire: (poi: POI) => void;
  onLocationUpdate?: (lat: number, lng: number) => void;
  triggerRadiusM?: number;
}

export function usePOIStream({
  pois,
  paused,
  onStoryFire,
  onLocationUpdate,
  triggerRadiusM,
}: UsePOIStreamOptions) {
  const playedIds  = useRef<Set<string>>(new Set());
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const headingRef = useRef<number | null>(null); // degrees, from GPS
  const [nextPOI, setNextPOI] = useState<POI | null>(null);
  const [nextPOIDistM, setNextPOIDistM] = useState<number | null>(null);

  const radius = triggerRadiusM ?? TRIGGER_RADIUS_M;
  // Only apply heading filter for driving (large radius). Hiking trails are too
  // winding for bearing checks to be reliable.
  const useHeadingFilter = radius >= 200;

  const checkProximity = useCallback((lat: number, lng: number) => {
    if (paused) return;

    for (const poi of pois) {
      if (playedIds.current.has(poi.id)) continue;

      const dist = distanceMeters(lat, lng, poi.lat, poi.lng);
      setNextPOI(poi);
      setNextPOIDistM(dist);

      if (dist <= radius) {
        // Heading check: don't narrate POIs that are behind the direction of travel.
        // If heading is unavailable, skip the check and fire anyway.
        if (useHeadingFilter && headingRef.current !== null) {
          const poiBearing = bearingDeg(lat, lng, poi.lat, poi.lng);
          if (angleDiff(headingRef.current, poiBearing) > HEADING_TOLERANCE) {
            // POI is outside the forward arc — don't fire, re-evaluate next GPS tick
            break;
          }
        }
        playedIds.current.add(poi.id);
        onStoryFire(poi);
        return;
      }

      break; // pois are ordered along route; stop at the first unplayed one
    }
  }, [pois, paused, onStoryFire, radius, useHeadingFilter]);

  useEffect(() => {
    let active = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || !active) return;

      locationSub.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: GPS_INTERVAL_MS,
          distanceInterval: GPS_DISTANCE_M,
        },
        loc => {
          if (!active) return;
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;

          // Capture device heading (degrees clockwise from true north, -1 = unavailable)
          const h = loc.coords.heading;
          if (h !== null && h >= 0) headingRef.current = h;

          onLocationUpdate?.(lat, lng);
          checkProximity(lat, lng);
        }
      );
    })();

    return () => {
      active = false;
      locationSub.current?.remove();
    };
  }, [checkProximity]);

  // Reset played IDs if POI list changes (new route)
  useEffect(() => {
    playedIds.current = new Set();
    headingRef.current = null;
  }, [pois]);

  return { nextPOI, nextPOIDistM };
}
