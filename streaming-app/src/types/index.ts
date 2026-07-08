export type Theme = 'light' | 'dark' | 'system';

export interface ScheduleEntry {
  id: string;
  day: string;
  start_time: string;
  end_time: string;
  title: string;
  game: string;
  is_active: boolean;
}

export interface Recording {
  id: string;
  title: string;
  description: string;
  video_id: string;
  platform: 'youtube' | 'twitch';
  thumbnail_url: string;
  duration: number;
  view_count: number;
  published: boolean;
  is_private: boolean;
  category: string;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  published: boolean;
  created_at: string;
}

export interface StreamSettings {
  title: string;
  game: string;
  description: string;
  is_live: boolean;
  viewer_count: number;
  platform: 'youtube' | 'twitch';
  embed_id: string;
}

export interface SiteSettings {
  site_name: string;
  embed_enabled: boolean;
  schedule_visible: boolean;
  recordings_hidden: boolean;
  social_youtube: string;
  social_twitch: string;
  social_twitter: string;
  social_discord: string;
}

export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: string;
}
