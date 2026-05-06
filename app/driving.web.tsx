import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getPOIsAlongRoute } from '../lib/supabase';
import type { POI } from '../lib/supabase';

const CATEGORY_COLORS: Record<string, string> = {
  History: '#f0883e', Geology: '#a371f7', 'Scenic views': '#58a6ff',
  Nature: '#3fb950', Hiking: '#56d364', Food: '#ffa657',
  Architecture: '#79c0ff', Legends: '#ff7b72', Wildlife: '#7ee787', 'Hidden gems': '#e3b341',
};

export default function Driving() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = route.params ?? {};

  const destination: string = params.destination ?? 'Your route';
  const filters = (() => { try { return JSON.parse(params.filters ?? '{}'); } catch { return {}; } })();
  const routePreview = (() => { try { return JSON.parse(params.routePreview ?? '{}'); } catch { return {}; } })();
  const originLocation = (() => { try { return JSON.parse(params.originLocation ?? '{}'); } catch { return {}; } })();

  const [pois, setPois] = useState<POI[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const polyline = routePreview.polylineCoords ?? [];
        const corridorMi = filters.corridorMi ?? 15;
        const categories: string[] | null = filters.categoryFilter?.length > 0 ? filters.categoryFilter : null;
        const fetched = await getPOIsAlongRoute(polyline, corridorMi, categories);
        setPois(fetched);
      } catch (err) {
        console.error('[Driving web] POI load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const initialRegion = originLocation.latitude
    ? { latitude: originLocation.latitude, longitude: originLocation.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }
    : { latitude: 34.18, longitude: -118.33, latitudeDelta: 0.1, longitudeDelta: 0.1 };

  return (
    <View style={s.container}>
      {/* Map */}
      <MapView
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        showsUserLocation
      >
        {routePreview.polylineCoords?.length > 1 && (
          <Polyline coordinates={routePreview.polylineCoords} strokeColor="#388bfd" strokeWidth={4} />
        )}
        {pois.map(poi => (
          <Marker
            key={poi.id}
            coordinate={{ latitude: poi.lat, longitude: poi.lng }}
            onPress={() => setSelectedPOI(poi)}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[s.dot, { backgroundColor: CATEGORY_COLORS[poi.category] ?? '#f0883e' }]} />
          </Marker>
        ))}
      </MapView>

      {/* Top bar */}
      <SafeAreaView style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.navigate('index')}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.destLabel} numberOfLines={1}>{destination}</Text>
        <View style={s.badge}>
          {loading
            ? <Text style={s.badgeText}>Loading stories…</Text>
            : <Text style={s.badgeText}>{pois.length} stories</Text>}
        </View>
      </SafeAreaView>

      {/* POI callout */}
      {selectedPOI && (
        <View style={s.callout}>
          <View style={[s.calloutDot, { backgroundColor: CATEGORY_COLORS[selectedPOI.category] ?? '#f0883e' }]} />
          <View style={s.calloutBody}>
            <Text style={s.calloutCat}>{selectedPOI.category}</Text>
            <Text style={s.calloutName}>{selectedPOI.name}</Text>
          </View>
          <TouchableOpacity onPress={() => setSelectedPOI(null)} style={s.closeBtn}>
            <Text style={s.closeX}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* POI list sidebar */}
      {pois.length > 0 && (
        <View style={s.sidebar}>
          <Text style={s.sidebarTitle}>Along your route</Text>
          <ScrollView style={s.sidebarList} showsVerticalScrollIndicator={false}>
            {pois.map(poi => (
              <TouchableOpacity
                key={poi.id}
                style={[s.sidebarItem, selectedPOI?.id === poi.id && s.sidebarItemActive]}
                onPress={() => setSelectedPOI(poi)}
              >
                <View style={[s.dot, { backgroundColor: CATEGORY_COLORS[poi.category] ?? '#f0883e', marginRight: 8 }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.sidebarCat}>{poi.category}</Text>
                  <Text style={s.sidebarName} numberOfLines={1}>{poi.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#0d1117' },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8,
    backgroundColor: 'rgba(13,17,23,0.92)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  backText: { color: '#e6edf3', fontSize: 13, fontWeight: '600' },
  destLabel: { flex: 1, color: '#e6edf3', fontSize: 14, fontWeight: '600' },
  badge: {
    backgroundColor: 'rgba(63,185,80,0.12)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(63,185,80,0.3)',
  },
  badgeText: { color: '#3fb950', fontSize: 11, fontWeight: '600' },
  callout: {
    position: 'absolute', bottom: 24, left: 16, right: 220,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(22,27,34,0.97)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(56,139,253,0.35)',
    paddingHorizontal: 14, paddingVertical: 10, zIndex: 15,
  },
  calloutDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  calloutBody: { flex: 1 },
  calloutCat: { fontSize: 10, color: '#8b949e', textTransform: 'uppercase' },
  calloutName: { fontSize: 14, fontWeight: '600', color: '#e6edf3', marginTop: 2 },
  closeBtn: { padding: 4 },
  closeX: { fontSize: 14, color: '#8b949e' },
  sidebar: {
    position: 'absolute', top: 64, right: 0, bottom: 0, width: 200,
    backgroundColor: 'rgba(13,17,23,0.95)',
    borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.08)',
    zIndex: 10,
  },
  sidebarTitle: {
    fontSize: 11, fontWeight: '700', color: '#8b949e',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8,
  },
  sidebarList: { flex: 1 },
  sidebarItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  sidebarItemActive: { backgroundColor: 'rgba(56,139,253,0.1)' },
  sidebarCat: { fontSize: 9, color: '#8b949e', textTransform: 'uppercase' },
  sidebarName: { fontSize: 12, color: '#e6edf3', fontWeight: '500', marginTop: 1 },
});
