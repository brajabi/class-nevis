import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export interface Settings {
  transcribeModel: string;
  noteModel: string;
}

const KEY = 'classnevis.settings.v1';

/**
 * The ClassNevis server. Fixed in the app (users never see or type it);
 * override at build/dev time with EXPO_PUBLIC_API_URL, e.g. http://192.168.1.10:4000.
 */
export const SERVER_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://classnevis.tarino.net').replace(/\/+$/, '');

export const defaultSettings: Settings = {
  transcribeModel: '',
  noteModel: '',
};

let current: Settings = defaultSettings;
let loaded = false;
const listeners = new Set<() => void>();

export async function loadSettings(): Promise<Settings> {
  if (loaded) return current;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const { transcribeModel, noteModel } = JSON.parse(raw);
      current = { ...defaultSettings, ...(transcribeModel ? { transcribeModel } : {}), ...(noteModel ? { noteModel } : {}) };
    }
  } catch {}
  loaded = true;
  listeners.forEach((l) => l());
  return current;
}

export function getSettings(): Settings {
  return current;
}

export async function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  listeners.forEach((l) => l());
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
