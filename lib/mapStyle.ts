import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WARM_DARK_MAP } from './theme';

export type MapStyleId = 'dark' | 'satellite' | 'topo' | 'standard';

export interface MapStyleConfig {
  id: MapStyleId;
  label: string;
  mapboxStyleSlug: string;
  mapType: 'standard' | 'hybrid' | 'terrain';
  customMapStyle: object[] | undefined;
}

export const MAP_STYLES: Record<MapStyleId, MapStyleConfig> = {
  dark: {
    id: 'dark', label: 'Dark', mapboxStyleSlug: 'dark-v11',
    mapType: 'standard', customMapStyle: WARM_DARK_MAP,
  },
  satellite: {
    id: 'satellite', label: 'Satellite', mapboxStyleSlug: 'satellite-streets-v12',
    mapType: 'hybrid', customMapStyle: undefined,
  },
  topo: {
    id: 'topo', label: 'Topo', mapboxStyleSlug: 'outdoors-v12',
    mapType: 'terrain', customMapStyle: undefined,
  },
  standard: {
    id: 'standard', label: 'Standard', mapboxStyleSlug: 'standard',
    mapType: 'standard', customMapStyle: undefined,
  },
};

const STORAGE_KEY = 'rs_map_style';

export async function loadMapStyle(): Promise<MapStyleId> {
  try {
    if (Platform.OS === 'web') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && saved in MAP_STYLES) return saved as MapStyleId;
    } else {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved && saved in MAP_STYLES) return saved as MapStyleId;
    }
  } catch {}
  return 'dark';
}

export async function saveMapStyle(id: MapStyleId): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, id);
    }
  } catch {}
}

// Mapbox Static Images API — LA area zoom 10 shows good style differentiation
export function buildThumbUrl(styleSlug: string, token: string): string {
  return (
    `https://api.mapbox.com/styles/v1/mapbox/${styleSlug}/static/` +
    `-118.25,34.05,10/120x120@2x?access_token=${token}`
  );
}

/*
  Supabase migration (run in SQL editor when auth is wired up):

  CREATE TABLE IF NOT EXISTS user_preferences (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    map_style    text DEFAULT 'dark' CHECK (map_style IN ('dark','satellite','topo','standard')),
    updated_at   timestamptz DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_user_id_idx ON user_preferences (user_id);
  ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Own prefs" ON user_preferences USING (auth.uid() = user_id);
*/
