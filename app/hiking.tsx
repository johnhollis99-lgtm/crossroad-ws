/**
 * RoadStory — Hiking.tsx
 * Screen: trail/hike search + route preview
 *
 * Differences from index.tsx:
 *   - Walking routing (Mapbox walking / Google mode=walking)
 *   - Terrain map (mapType="terrain" on native)
 *   - Elevation gain via Google Elevation API
 *   - POI count filtered to mode='hiking'
 *   - Navigates to filters with mode='hiking'
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, Keyboard, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { countPOIsAlongRoute } from '../lib/supabase';
import { XRoadLogo } from '../components/XRoadLogo';

const MAPS_KEY     = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY!;
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN!;

interface TrailPreview {
  distanceMi: number;
  durationMin: number;
  elevationGainFt: number | null;
  poiCount: number | null;
  polylineCoords: { latitude: number; longitude: number }[];
  destLat: number;
  destLng: number;
}

function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

async function fetchElevationGain(
  coords: { latitude: number; longitude: number }[]
): Promise<number | null> {
  if (coords.length < 2) return null;
  try {
    // Sample up to 50 evenly spaced points
    const n = Math.min(50, coords.length);
    const step = Math.max(1, Math.floor(coords.length / n));
    const sampled = coords.filter((_, i) => i % step === 0).slice(0, n);
    const locations = sampled.map(c => `${c.latitude},${c.longitude}`).join('|');
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/elevation/json?locations=${locations}&key=${MAPS_KEY}`
    );
    const data = await res.json();
    if (data.status !== 'OK' || !data.results?.length) return null;
    const elevs: number[] = data.results.map((r: any) => r.elevation);
    let gain = 0;
    for (let i = 1; i < elevs.length; i++) {
      if (elevs[i] > elevs[i - 1]) gain += elevs[i] - elevs[i - 1];
    }
    return Math.round(gain * 3.28084); // meters → feet
  } catch {
    return null;
  }
}

export default function Hiking() {
  const navigation = useNavigation<any>();
  const mapRef = useRef<MapView>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [destination, setDestination] = useState('');
  const [suggestions, setSuggestions] = useState<{ description: string; place_id: string; coords?: { latitude: number; longitude: number } }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [trailPreview, setTrailPreview] = useState<TrailPreview | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserLocation(coord);
      mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.06, longitudeDelta: 0.06 }, 800);
    })();
  }, []);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.length < 3) { setSuggestions([]); return; }
    try {
      if (Platform.OS === 'web') {
        const prox = userLocation ? `&proximity=${userLocation.longitude},${userLocation.latitude}` : '';
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?access_token=${MAPBOX_TOKEN}&limit=5&types=place,address,poi${prox}`
        );
        const data = await res.json();
        setSuggestions((data.features ?? []).map((f: any) => ({
          description: f.place_name, place_id: f.id,
          coords: { latitude: f.center[1], longitude: f.center[0] },
        })));
      } else {
        const origin = userLocation
          ? `&location=${userLocation.latitude},${userLocation.longitude}&radius=50000` : '';
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}${origin}&key=${MAPS_KEY}`
        );
        const data = await res.json();
        setSuggestions((data.predictions ?? []).slice(0, 5).map((p: any) => ({
          description: p.description, place_id: p.place_id,
        })));
      }
      setShowSuggestions(true);
    } catch { setSuggestions([]); }
  }, [userLocation]);

  const handleDestChange = (text: string) => {
    setDestination(text);
    setTrailPreview(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchSuggestions(text), 400);
  };

  const fetchRoute = async (destText: string, destCoords?: { latitude: number; longitude: number }) => {
    if (!userLocation) return;
    setLoadingRoute(true);
    setShowSuggestions(false);
    setSuggestions([]);
    Keyboard.dismiss();
    try {
      let polylineCoords: { latitude: number; longitude: number }[];
      let distanceMi: number;
      let durationMin: number;
      let destLat: number;
      let destLng: number;

      if (Platform.OS === 'web' && destCoords) {
        const coordsList = [
          `${userLocation.longitude},${userLocation.latitude}`,
          `${destCoords.longitude},${destCoords.latitude}`,
        ].join(';');
        const res = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/walking/${coordsList}.json?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`
        );
        const data = await res.json();
        if (!data.routes?.[0]) return;
        const r = data.routes[0];
        polylineCoords = r.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ latitude: lat, longitude: lng }));
        distanceMi = r.distance / 1609.34;
        durationMin = Math.round(r.duration / 60);
        destLat = destCoords.latitude;
        destLng = destCoords.longitude;
      } else {
        const origin = `${userLocation.latitude},${userLocation.longitude}`;
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${encodeURIComponent(destText)}&mode=walking&key=${MAPS_KEY}`
        );
        const data = await res.json();
        if (data.status !== 'OK' || !data.routes?.[0]) return;
        const leg = data.routes[0].legs[0];
        polylineCoords = decodePolyline(data.routes[0].overview_polyline.points);
        distanceMi = leg.distance.value / 1609.34;
        durationMin = Math.round(leg.duration.value / 60);
        destLat = leg.end_location.lat;
        destLng = leg.end_location.lng;
      }

      setTrailPreview({
        distanceMi: Math.round(distanceMi * 10) / 10,
        durationMin,
        elevationGainFt: null,
        poiCount: null,
        polylineCoords,
        destLat,
        destLng,
      });

      mapRef.current?.fitToCoordinates(polylineCoords, {
        edgePadding: { top: 80, right: 40, bottom: 340, left: 40 },
        animated: true,
      });

      // Fetch elevation + POI count in parallel
      fetchElevationGain(polylineCoords).then(gainFt => {
        if (gainFt !== null)
          setTrailPreview(prev => prev ? { ...prev, elevationGainFt: gainFt } : prev);
      });
      countPOIsAlongRoute(polylineCoords, 1, 'hiking').then(count => {
        if (count !== null)
          setTrailPreview(prev => prev ? { ...prev, poiCount: count } : prev);
      });
    } catch (err) {
      console.error('[Hiking] Route fetch error:', err);
    } finally {
      setLoadingRoute(false);
    }
  };

  const selectSuggestion = (desc: string, coords?: { latitude: number; longitude: number }) => {
    setDestination(desc);
    setShowSuggestions(false);
    fetchRoute(desc, coords);
  };

  const handleStartHike = () => {
    if (!trailPreview) return;
    navigation.navigate('filters', {
      destination,
      routePreview: JSON.stringify(trailPreview),
      originLocation: JSON.stringify(userLocation ?? {}),
      turnByTurn: 'false',
      mode: 'hiking',
    });
  };

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={Platform.OS !== 'web' ? PROVIDER_GOOGLE : undefined}
        mapType={Platform.OS !== 'web' ? 'terrain' : undefined}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        initialRegion={{ latitude: 34.18, longitude: -118.33, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
      >
        {trailPreview && trailPreview.polylineCoords.length > 1 && (
          <>
            <Polyline coordinates={trailPreview.polylineCoords} strokeColor="rgba(63,185,80,0.3)" strokeWidth={8} />
            <Polyline coordinates={trailPreview.polylineCoords} strokeColor="#3fb950" strokeWidth={3} />
            <Marker coordinate={{ latitude: trailPreview.destLat, longitude: trailPreview.destLng }}>
              <View style={s.destPin}><View style={s.destPinDot} /></View>
            </Marker>
          </>
        )}
      </MapView>

      {/* Header */}
      <SafeAreaView style={s.header} edges={['top']}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backText}>←</Text>
          </TouchableOpacity>
          <XRoadLogo size="sm" />
        </View>
      </SafeAreaView>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <View style={s.suggestionsBox}>
          {suggestions.map((sg, i) => (
            <TouchableOpacity key={sg.place_id} style={[s.suggRow, i > 0 && s.suggRowBorder]} onPress={() => selectSuggestion(sg.description, sg.coords)}>
              <Text style={s.suggIcon}>🥾</Text>
              <Text style={s.suggText} numberOfLines={1}>{sg.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Bottom sheet */}
      <SafeAreaView style={s.sheet} edges={['bottom']}>
        <View style={s.dragHandle} />

        <View style={[s.inputRow, trailPreview && s.inputRowActive]}>
          <View style={s.inputDot} />
          <TextInput
            style={s.input}
            placeholder="Trailhead or destination"
            placeholderTextColor="#8b949e"
            value={destination}
            onChangeText={handleDestChange}
            returnKeyType="search"
            onSubmitEditing={() => fetchRoute(destination)}
            autoCorrect={false}
            autoCapitalize="words"
          />
          {loadingRoute
            ? <ActivityIndicator size="small" color="#3fb950" style={{ marginRight: 4 }} />
            : destination.length > 0 && (
              <TouchableOpacity onPress={() => { setDestination(''); setTrailPreview(null); }}>
                <Text style={s.clearBtn}>✕</Text>
              </TouchableOpacity>
            )
          }
        </View>

        {trailPreview && (
          <View style={s.routeMeta}>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Distance</Text>
              <Text style={s.metaValue}>{trailPreview.distanceMi} mi</Text>
            </View>
            <View style={s.metaSep} />
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Est. time</Text>
              <Text style={s.metaValue}>{trailPreview.durationMin} min</Text>
            </View>
            <View style={s.metaSep} />
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Elev. gain</Text>
              {trailPreview.elevationGainFt === null
                ? <ActivityIndicator size="small" color="#56d364" style={{ alignSelf: 'flex-start', marginTop: 4 }} />
                : <Text style={[s.metaValue, { color: '#56d364' }]}>{trailPreview.elevationGainFt} ft</Text>}
            </View>
            <View style={s.metaSep} />
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Stories</Text>
              {trailPreview.poiCount === null
                ? <ActivityIndicator size="small" color="#f0883e" style={{ alignSelf: 'flex-start', marginTop: 4 }} />
                : <Text style={[s.metaValue, { color: '#f0883e' }]}>{trailPreview.poiCount}</Text>}
            </View>
          </View>
        )}

        <View style={s.actions}>
          <TouchableOpacity
            style={[s.btnStart, !trailPreview && s.btnDisabled]}
            onPress={handleStartHike}
            disabled={!trailPreview}
          >
            <Text style={s.btnStartText}>
              {loadingRoute ? 'Finding route…' : trailPreview ? 'Start Hike' : 'Enter destination'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1a0a' },

  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
    backgroundColor: 'rgba(10,26,10,0.88)',
  },
  backBtn: {
    width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  backText: { fontSize: 16, color: '#e6edf3' },
  brand: { fontSize: 16, fontWeight: '700', color: '#3fb950', letterSpacing: -0.3 },

  destPin: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(63,185,80,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  destPinDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#3fb950', borderWidth: 2, borderColor: '#fff' },

  suggestionsBox: {
    position: 'absolute', left: 16, right: 16, bottom: 270,
    backgroundColor: '#161b22', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 30, overflow: 'hidden',
  },
  suggRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  suggRowBorder: { borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  suggIcon: { fontSize: 13 },
  suggText: { fontSize: 13, color: '#e6edf3', flex: 1 },

  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#0f1f0f',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderColor: 'rgba(63,185,80,0.15)',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 8 : 16,
    zIndex: 20,
  },
  dragHandle: {
    width: 36, height: 3, backgroundColor: 'rgba(63,185,80,0.25)',
    borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 14,
  },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#161b22', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  inputRowActive: { borderColor: '#3fb950' },
  inputDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3fb950', flexShrink: 0 },
  input: { flex: 1, fontSize: 13, color: '#e6edf3' },
  clearBtn: { fontSize: 12, color: '#8b949e', paddingHorizontal: 6 },

  routeMeta: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderColor: 'rgba(63,185,80,0.12)',
    marginTop: 12, paddingTop: 12, gap: 8,
  },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 15, fontWeight: '600', color: '#e6edf3', marginTop: 2 },
  metaSep: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.06)' },

  actions: { marginTop: 12 },
  btnStart: {
    backgroundColor: '#3fb950', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  btnDisabled: { backgroundColor: '#21262d', opacity: 0.5 },
  btnStartText: { fontSize: 15, fontWeight: '700', color: '#0d1117' },
});
