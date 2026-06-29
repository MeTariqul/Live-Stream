const I18N = {
  _lang: 'en',
  _strings: {},

  en: {
    'app.name': 'My Live TV',
    'channels': 'Channels',
    'live': 'LIVE',
    'offline': 'Offline',
    'now_playing': 'Now Playing',
    'up_next': 'Up Next',
    'epg': 'Program Guide',
    'recordings': 'Recordings',
    'favorites': 'Favorites',
    'search': 'Search',
    'login': 'Login',
    'signup': 'Sign Up',
    'logout': 'Logout',
    'profile': 'Profile',
    'settings': 'Settings',
    'admin': 'Admin',
    'username': 'Username',
    'password': 'Password',
    'confirm_password': 'Confirm Password',
    'change_password': 'Change Password',
    'delete_account': 'Delete Account',
    'current_password': 'Current Password',
    'new_password': 'New Password',
    'all': 'All',
    'favorites_only': 'Favorites',
    'live_only': 'Live Only',
    'category': 'Category',
    'no_channels': 'No channels available',
    'channel_offline': 'This channel is currently not streaming',
    'parental_pin': 'Parental Control PIN',
    'enter_pin': 'Enter PIN to access mature content',
    'pin_required': 'PIN Required',
    'submit': 'Submit',
    'cancel': 'Cancel',
    'save': 'Save',
    'delete': 'Delete',
    'edit': 'Edit',
    'create': 'Create',
    'search_placeholder': 'Search channels & programs...',
    'dvr': 'DVR',
    'fullscreen': 'Fullscreen',
    'volume': 'Volume',
    'quality': 'Quality',
    'auto': 'Auto',
    'now': 'Now',
    'upcoming': 'Upcoming',
    'reminder_set': 'Reminder set',
    'channel_live': 'is now LIVE!',
    'program_reminder': 'starts soon!',
  },

  setLanguage(lang) {
    this._lang = lang || 'en';
    if (!this._strings[this._lang]) {
      this._lang = 'en';
    }
  },

  t(key, params = {}) {
    const strings = this._strings[this._lang] || this.en;
    let value = strings[key] || this.en[key] || key;
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, v);
    }
    return value;
  },
};

I18N._strings = { en: I18N.en };
