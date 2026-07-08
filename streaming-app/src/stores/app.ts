'use client';

import { create } from 'zustand';
import type { StreamSettings, SiteSettings, ScheduleEntry, Recording, Announcement } from '@/types';
import { DEFAULT_SCHEDULE, DEFAULT_RECORDINGS, DEFAULT_ANNOUNCEMENTS, SITE_NAME } from '@/lib/constants';

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch { return fallback; }
}

function saveToStorage(key: string, value: any) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

interface AppState {
  stream: StreamSettings;
  schedule: ScheduleEntry[];
  recordings: Recording[];
  announcements: Announcement[];
  siteSettings: SiteSettings;
  setStream: (s: Partial<StreamSettings>) => void;
  setSchedule: (s: ScheduleEntry[]) => void;
  setRecordings: (r: Recording[]) => void;
  setAnnouncements: (a: Announcement[]) => void;
  setSiteSettings: (s: Partial<SiteSettings>) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  stream: loadFromStorage('sh_stream', {
    title: 'Live Stream',
    game: '',
    description: 'Welcome to the stream!',
    is_live: false,
    viewer_count: 0,
    platform: 'youtube' as const,
    embed_id: '',
  }),
  schedule: loadFromStorage('sh_schedule', DEFAULT_SCHEDULE),
  recordings: loadFromStorage('sh_recordings', DEFAULT_RECORDINGS),
  announcements: loadFromStorage('sh_announcements', DEFAULT_ANNOUNCEMENTS),
  siteSettings: loadFromStorage('sh_site', {
    site_name: SITE_NAME,
    embed_enabled: true,
    schedule_visible: true,
    recordings_hidden: false,
    social_youtube: '',
    social_twitch: '',
    social_twitter: '',
    social_discord: '',
  }),

  setStream: (updates) => {
    const next = { ...get().stream, ...updates };
    saveToStorage('sh_stream', next);
    set({ stream: next });
  },
  setSchedule: (schedule) => { saveToStorage('sh_schedule', schedule); set({ schedule }); },
  setRecordings: (recordings) => { saveToStorage('sh_recordings', recordings); set({ recordings }); },
  setAnnouncements: (announcements) => { saveToStorage('sh_announcements', announcements); set({ announcements }); },
  setSiteSettings: (updates) => {
    const next = { ...get().siteSettings, ...updates };
    saveToStorage('sh_site', next);
    set({ siteSettings: next });
  },
}));
