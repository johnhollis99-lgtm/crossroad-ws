/**
 * RoadStory — Trail.tsx (native)
 * Active hiking screen — terrain map, 80m trigger, offline pre-cache
 *
 * Differences from driving.tsx:
 *   - triggerRadiusM = 80 (not 400)
 *   - mode = 'hiking' passed to getPOIsAlongRoute
 *   - Pre-cache ALL POIs before departure (offline-first)
 *   - Pre-cache progress loading screen
 *   - Standard-sized cancel button
 *   - Terrain map tiles
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Platform, Alert, StatusBar,
  TextInput, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getPOIsAlongRoute, saveRoute } from '../lib/supabase';
import { XRoadLogo } from '../components/XRoadLogo';
import type { POI } from '../lib/supabase';
import { usePOIStream } from '../hooks/usePOIStream';
import { useTTS } from '../hooks/useTTS';

const TRAIL_TRIGGER_M = 80;

const CATEGORY_COLORS: Record<string, string> = {
  History: '#f0883e', Geology: '#a371f7', 'Scenic views': '#58a6ff',
  Nature: '#3fb950', Hiking: '#56d364', Food: '#ffa657',
  Architecture: '#79c0ff', Legends: '#ff7b72', Wildlife: '#7ee787', 'Hidden gems': '#e3b341',
};

export default function Trail() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = route.params ?? {};

  const destination: string = params.destination ?? 'Trail';
  const filters = (() => { try { return JSON.parse(params.filters ?? '{}'); } catch { return {}; } })();
  const routePreview = (() => { try { return JSON.parse(params.routePreview ?? '{}'); } catch { return {}; } })();
  const originLocation = (() => { try { return JSON.parse(params.originLocation ?? '{}'); } catch { return {}; } })();

  const mapRef = useRef<MapView>(null);
  const micTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micArcAnim = useRef(new Animated.Value(1)).current;
  const poiBarAnim = useRef(new Animated.Value(0)).current;

  const [pois, setPois] = useState<POI[]>([]);
  const [cachePhase, setCachePhase] = useState<'loading' | 'caching' | 'ready'>('loading');
  const [cacheDone, setCacheDone] = useState(0);
  const [cacheTotal, setCacheTotal] = useState(0);
  const [paused, setPaused] = useState(false);
  const [activePOI, setActivePOI] = useState<POI | null>(null);
  const [selectedMarkerPOI, setSelectedMarkerPOI] = useState<POI | null>(null);
  const [micOpen, setMicOpen] = useState(false);
  const [qaMode, setQaMode] = useState(false);
  const [qaInput, setQaInput] = useState('');

  const tts = useTTS({
    mode: 'hiking',
    depth: filters.depth ?? 'ride_along',
  });

  const openMicWindow = useCallback(() => {
    if (paused) return;
    setMicOpen(true);
    setQaMode(false);
    micArcAnim.setValue(1);
    Animated.timing(micArcAnim, { toValue: 0, duration: 7000, useNativeDriver: false })
      .start(({ finished }) => { if (finished) closeMicWindow(); });
    if (micTimerRef.current) clearTimeout(micTimerRef.current);
    micTimerRef.current = setTimeout(closeMicWindow, 7200);
  }, [paused]);

  const closeMicWindow = () => {
    setMicOpen(false);
    setQaMode(false);
    micArcAnim.stopAnimation();
    if (micTimerRef.current) clearTimeout(micTimerRef.current);
  };

  const handleStoryFire = useCallback((poi: POI) => {
    setActivePOI(poi);
    Animated.spring(poiBarAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    tts.narratePOI(poi).then(() => openMicWindow());
  }, [tts, openMicWindow]);

  const { nextPOI, nextPOIDistM } = usePOIStream({
    pois: cachePhase === 'ready' ? pois : [],
    paused,
    onStoryFire: handleStoryFire,
    triggerRadiusM: TRAIL_TRIGGER_M,
    onLocationUpdate: (lat, lng) => {
      mapRef.current?.animateCamera({ center: { latitude: lat, longitude: lng }, zoom: 16 }, { duration: 500 });
    },
  });

  // Phase 1: load POIs
  useEffect(() => {
    (async () => {
      try {
        const polyline = routePreview.polylineCoords ?? [];
        const corridorMi = filters.corridorMi ?? 1;
        const categories: string[] | null = filters.categoryFilter?.length > 0 ? filters.categoryFilter : null;
        const fetched = await getPOIsAlongRoute(polyline, corridorMi, categories, 'hiking');
        setPois(fetched);
        saveRoute({
          destination,
          originLat: originLocation.latitude,
          originLng: originLocation.longitude,
          distanceMi: routePreview.distanceMi,
          durationMin: routePreview.durationMin,
          filterSnapshot: { ...filters, mode: 'hiking' },
        });

        if (fetched.length === 0) {
          setCachePhase('ready');
          return;
        }
        setCacheTotal(fetched.length);
        setCachePhase('caching');
        // Phase 2: cache all POI audio offline
        await tts.cacheAllPOIs(fetched, (done, total) => {
          setCacheDone(done);
          setCacheTotal(total);
        });
      } catch (err) {
        console.error('[Trail] setup error:', err);
      } finally {
        setCachePhase('ready');
      }
    })();
  }, []);

  const skipCache = () => setCachePhase('ready');

  const dismissPOI = () => {
    Animated.timing(poiBarAnim, { toValue: 0, duration: 200, useNativeDriver: true })
      .start(() => setActivePOI(null));
    tts.stop();
  };

  const handleQASubmit = async () => {
    closeMicWindow();
  };

  const handlePauseResume = () => {
    const next = !paused;
    setPaused(next);
    if (next) { tts.stop(); closeMicWindow(); }
  };

  const handleEndHike = () => {
    Alert.alert('End hike?', 'Your trail and filters are saved.', [
      { text: 'Keep hiking', style: 'cancel' },
      { text: 'End hike', style: 'destructive', onPress: () => { tts.stop(); navigation.navigate('index'); } },
    ]);
  };

  const initialRegion = originLocation.latitude ? {
    latitude: originLocation.latitude, longitude: originLocation.longitude,
    latitudeDelta: 0.02, longitudeDelta: 0.02,
  } : { latitude: 34.18, longitude: -118.33, latitudeDelta: 0.06, longitudeDelta: 0.06 };

  // ── Pre-cache loading screen ─────────────────────────────────────────────
  if (cachePhase !== 'ready') {
    const pct = cacheTotal > 0 ? cacheDone / cacheTotal : 0;
    return (
      <View style={s.cacheScreen}>
        <StatusBar translucent barStyle="light-content" backgroundColor="transparent" />
        <Text style={s.cacheIcon}>🥾</Text>
        <Text style={s.cacheTitle}>
          {cachePhase === 'loading' ? 'Loading trail…' : 'Preparing offline stories'}
        </Text>
        {cachePhase === 'caching' && (
          <>
            <Text style={s.cacheSub}>Caching {cacheDone} of {cacheTotal} stories for offline use</Text>
            <View style={s.cacheTrack}>
              <View style={[s.cacheFill, { width: `${Math.round(pct * 100)}%` as any }]} />
            </View>
            <Text style={s.cacheHint}>Works without signal once downloaded</Text>
            <TouchableOpacity style={s.skipBtn} onPress={skipCache}>
              <Text style={s.skipBtnText}>Skip & Start</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={s.cacheCancel} onPress={() => navigation.goBack()}>
          <Text style={s.cacheCancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main hiking screen ───────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <StatusBar translucent barStyle="light-content" backgroundColor="transparent" />

      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        mapType="terrain"
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {routePreview.polylineCoords?.length > 1 && (
          <>
            <Polyline coordinates={routePreview.polylineCoords} strokeColor="rgba(63,185,80,0.3)" strokeWidth={6} />
            <Polyline coordinates={routePreview.polylineCoords} strokeColor="#3fb950" strokeWidth={3} />
          </>
        )}
        {pois.map(poi => (
          <Marker
            key={poi.id}
            coordinate={{ latitude: poi.lat, longitude: poi.lng }}
            onPress={() => setSelectedMarkerPOI(poi)}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[
              s.markerDot,
              { backgroundColor: CATEGORY_COLORS[poi.category] ?? '#3fb950' },
              activePOI?.id === poi.id && s.markerDotActive,
            ]} />
          </Marker>
        ))}
      </MapView>

      {pois.length > 0 && (
        <View style={s.poiCountBadge}>
          <Text style={s.poiCountText}>{pois.length} stories on this trail</Text>
        </View>
      )}
      {paused && (
        <View style={s.pausedBadge}><Text style={s.pausedText}>Stories paused</Text></View>
      )}

      {selectedMarkerPOI && !activePOI && (
        <View style={s.callout}>
          <View style={{ flex: 1 }}>
            <Text style={s.calloutCat}>{selectedMarkerPOI.category}</Text>
            <Text style={s.calloutName}>{selectedMarkerPOI.name}</Text>
          </View>
          <TouchableOpacity style={s.calloutBtn} onPress={() => { handleStoryFire(selectedMarkerPOI); setSelectedMarkerPOI(null); }}>
            <Text style={s.calloutBtnText}>▶ Tell me</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedMarkerPOI(null)} hitSlop={{ top:12, bottom:12, left:12, right:12 }}>
            <Text style={s.closeX}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {activePOI && (
        <Animated.View style={[s.poiBar, {
          opacity: poiBarAnim,
          transform: [{ translateY: poiBarAnim.interpolate({ inputRange:[0,1], outputRange:[16,0] }) }],
        }]}>
          <View style={[s.poiDot, { backgroundColor: CATEGORY_COLORS[activePOI.category] ?? '#3fb950' }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.poiCat}>{activePOI.category}</Text>
            <Text style={s.poiName} numberOfLines={1}>{activePOI.name}</Text>
            {tts.speaking && <Text style={s.poiSpeaking}>🔊 Narrating…</Text>}
          </View>
          <TouchableOpacity onPress={dismissPOI} hitSlop={{ top:12, bottom:12, left:12, right:12 }}>
            <Text style={s.closeX}>✕</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {micOpen && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.micWrap}>
          {qaMode ? (
            <View style={s.qaPanel}>
              <Text style={s.qaLabel}>Ask about this spot</Text>
              <View style={s.qaRow}>
                <TextInput
                  style={s.qaInput} value={qaInput} onChangeText={setQaInput} autoFocus
                  placeholder="What do you want to know?" placeholderTextColor="#8b949e"
                  returnKeyType="send" onSubmitEditing={handleQASubmit}
                />
                <TouchableOpacity style={s.qaSend} onPress={handleQASubmit}>
                  <Text style={s.qaSendText}>Ask</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={closeMicWindow}>
                <Text style={s.qaCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.micBar}>
              <View style={s.micTop}>
                <Text style={s.micLabel}>🎙 Listening… speak or type</Text>
                <TouchableOpacity onPress={() => setQaMode(true)}>
                  <Text style={s.micTypeBtn}>Type</Text>
                </TouchableOpacity>
              </View>
              <Animated.View style={[s.micArc, {
                width: micArcAnim.interpolate({ inputRange:[0,1], outputRange:['0%','100%'] }),
              }]} />
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      {nextPOI && !activePOI && nextPOIDistM != null && nextPOIDistM > TRAIL_TRIGGER_M && (
        <View style={s.nextBadge}>
          <Text style={s.nextText}>
            Next: {nextPOI.name} · {nextPOIDistM > 1000 ? `${(nextPOIDistM/1000).toFixed(1)} km` : `${Math.round(nextPOIDistM)} m`}
          </Text>
        </View>
      )}

      <SafeAreaView style={s.btnSafe} edges={['bottom']}>
        <View style={s.trailLogoRow}>
          <XRoadLogo size="sm" style={{ opacity: 0.6 }} />
        </View>
        <View style={s.btnBar}>
          <TouchableOpacity style={[s.btn, s.btnGreen]} onPress={() => { openMicWindow(); setQaMode(true); }} activeOpacity={0.75}>
            <Text style={s.btnIcon}>🎙</Text>
            <Text style={[s.btnLbl, { color:'#3fb950' }]}>Ask</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, paused && s.btnOrange]} onPress={handlePauseResume} activeOpacity={0.75}>
            <Text style={s.btnIcon}>{paused ? '▶' : '⏸'}</Text>
            <Text style={s.btnMuted}>{paused ? 'Resume' : 'Pause'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('filters', { ...params })} activeOpacity={0.75}>
            <Text style={s.btnIcon}>⚙</Text>
            <Text style={s.btnMuted}>Filters</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnRed]} onPress={handleEndHike} activeOpacity={0.75}>
            <Text style={s.btnIcon}>■</Text>
            <Text style={[s.btnLbl, { color:'#f85149' }]}>End</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  // ── Pre-cache screen ────────────────────────────────────────────────────
  cacheScreen: {
    flex: 1, backgroundColor: '#0a1a0a',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  cacheIcon: { fontSize: 48, marginBottom: 20 },
  cacheTitle: { fontSize: 20, fontWeight: '700', color: '#e6edf3', marginBottom: 8, textAlign: 'center' },
  cacheSub: { fontSize: 13, color: '#8b949e', marginBottom: 20, textAlign: 'center' },
  cacheTrack: {
    width: '100%', height: 6, backgroundColor: '#21262d',
    borderRadius: 3, overflow: 'hidden', marginBottom: 10,
  },
  cacheFill: { height: 6, backgroundColor: '#3fb950', borderRadius: 3 },
  cacheHint: { fontSize: 11, color: '#3fb950', marginBottom: 32, opacity: 0.7 },
  skipBtn: {
    backgroundColor: 'rgba(63,185,80,0.12)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(63,185,80,0.3)',
    paddingHorizontal: 24, paddingVertical: 10, marginBottom: 12,
  },
  skipBtnText: { fontSize: 14, fontWeight: '600', color: '#3fb950' },
  cacheCancel: { paddingVertical: 8 },
  cacheCancelText: { fontSize: 13, color: '#8b949e' },

  // ── Main screen ─────────────────────────────────────────────────────────
  container: { flex: 1, backgroundColor: '#0a1a0a' },
  markerDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#0a1a0a' },
  markerDotActive: { width: 18, height: 18, borderRadius: 9 },
  poiCountBadge: { position:'absolute', top: Platform.OS==='android'?48:60, alignSelf:'center', zIndex:20, backgroundColor:'rgba(10,26,10,0.92)', borderRadius:20, paddingHorizontal:14, paddingVertical:5, borderWidth:1, borderColor:'rgba(63,185,80,0.3)' },
  poiCountText: { fontSize:12, color:'#3fb950', fontWeight:'500' },
  pausedBadge: { position:'absolute', top: Platform.OS==='android'?80:96, alignSelf:'center', zIndex:20, backgroundColor:'rgba(10,26,10,0.92)', borderRadius:20, paddingHorizontal:14, paddingVertical:5, borderWidth:1, borderColor:'rgba(240,136,62,0.4)' },
  pausedText: { fontSize:13, fontWeight:'600', color:'#f0883e' },
  callout: { position:'absolute', left:16, right:16, bottom:110, backgroundColor:'rgba(10,26,10,0.97)', borderRadius:12, borderWidth:1, borderColor:'rgba(255,255,255,0.1)', paddingHorizontal:14, paddingVertical:10, flexDirection:'row', alignItems:'center', gap:10, zIndex:15 },
  calloutCat: { fontSize:10, color:'#8b949e', textTransform:'uppercase' },
  calloutName: { fontSize:14, fontWeight:'600', color:'#e6edf3', marginTop:2 },
  calloutBtn: { backgroundColor:'rgba(63,185,80,0.12)', borderRadius:8, paddingHorizontal:12, paddingVertical:7, borderWidth:1, borderColor:'rgba(63,185,80,0.3)' },
  calloutBtnText: { fontSize:12, color:'#3fb950', fontWeight:'600' },
  closeX: { fontSize:14, color:'#8b949e', paddingLeft:8 },
  poiBar: { position:'absolute', left:16, right:16, bottom:110, backgroundColor:'rgba(10,26,10,0.97)', borderRadius:12, borderWidth:1, borderColor:'rgba(63,185,80,0.35)', paddingHorizontal:14, paddingVertical:10, flexDirection:'row', alignItems:'center', gap:10, zIndex:15 },
  poiDot: { width:10, height:10, borderRadius:5, flexShrink:0 },
  poiCat: { fontSize:10, color:'#8b949e', textTransform:'uppercase', letterSpacing:0.5 },
  poiName: { fontSize:14, fontWeight:'600', color:'#e6edf3', marginTop:2 },
  poiSpeaking: { fontSize:11, color:'#3fb950', marginTop:2 },
  micWrap: { position:'absolute', left:16, right:16, bottom:110, zIndex:20 },
  micBar: { backgroundColor:'rgba(10,26,10,0.95)', borderRadius:12, borderWidth:1, borderColor:'rgba(63,185,80,0.35)', paddingHorizontal:14, paddingVertical:10, overflow:'hidden' },
  micTop: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8 },
  micLabel: { fontSize:12, color:'#3fb950', fontWeight:'500', flex:1 },
  micTypeBtn: { fontSize:11, color:'#58a6ff', marginLeft:8 },
  micArc: { height:3, backgroundColor:'#3fb950', borderRadius:2 },
  qaPanel: { backgroundColor:'rgba(10,26,10,0.97)', borderRadius:12, borderWidth:1, borderColor:'rgba(63,185,80,0.35)', padding:14 },
  qaLabel: { fontSize:12, color:'#8b949e', marginBottom:10 },
  qaRow: { flexDirection:'row', gap:8 },
  qaInput: { flex:1, backgroundColor:'#21262d', borderRadius:8, borderWidth:1, borderColor:'rgba(255,255,255,0.08)', paddingHorizontal:12, paddingVertical:8, fontSize:13, color:'#e6edf3' },
  qaSend: { backgroundColor:'#3fb950', borderRadius:8, paddingHorizontal:14, justifyContent:'center' },
  qaSendText: { fontSize:13, fontWeight:'700', color:'#0d1117' },
  qaCancel: { fontSize:12, color:'#8b949e', marginTop:10, textAlign:'center' },
  nextBadge: { position:'absolute', left:16, right:16, bottom:112, backgroundColor:'rgba(10,26,10,0.85)', borderRadius:8, borderWidth:1, borderColor:'rgba(255,255,255,0.06)', paddingHorizontal:12, paddingVertical:6, zIndex:10 },
  nextText: { fontSize:11, color:'#8b949e' },
  btnSafe: { position:'absolute', bottom:0, left:0, right:0 },
  btnBar: { flexDirection:'row', gap:8, paddingHorizontal:12, paddingTop:10, paddingBottom:16, backgroundColor:'rgba(10,26,10,0.95)', borderTopWidth:1, borderColor:'rgba(63,185,80,0.15)' },
  btn: { flex:1, minHeight:56, backgroundColor:'#161b22', borderRadius:10, borderWidth:1, borderColor:'rgba(255,255,255,0.08)', alignItems:'center', justifyContent:'center', paddingVertical:8, gap:3 },
  btnGreen: { backgroundColor:'rgba(63,185,80,0.1)', borderColor:'rgba(63,185,80,0.35)' },
  btnOrange: { backgroundColor:'rgba(240,136,62,0.1)', borderColor:'rgba(240,136,62,0.3)' },
  btnRed: { backgroundColor:'rgba(248,81,73,0.08)', borderColor:'rgba(248,81,73,0.25)' },
  btnIcon: { fontSize:18 },
  btnLbl: { fontSize:11, fontWeight:'600', textAlign:'center' },
  btnMuted:     { fontSize:11, color:'#8b949e', fontWeight:'500', textAlign:'center' },
  trailLogoRow: { alignItems: 'center', paddingBottom: 6 },
});
