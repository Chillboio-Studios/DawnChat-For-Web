export const PLAY_STORE_URL = "#";

export const DESKTOP_DOWNLOAD_URL = "#";

export const ROADMAP_URL = "#";

export const FEEDBACK_URL = "#";

export const BUG_TRACKER_URL = "#";

export const GITHUB_URL = "#";

export const BLUESKY_URL = "#";

export const DAWNCHAT_DONATION_URL = "https://www.chillboiostudios.com/donate";

export const DAWNCHAT_LOUNGE_SERVER_ID = "01M3615E99PYEQZ26AQ9RV6WJG";
export const DAWNCHAT_LOUNGE_HOME_SERVER_ID = "01M3615E99PYEQZ26AQ9RV6WJG";

export const DAWNCHAT_HOST = "chat.dawn-chat.com";
export const DAWNCHAT_API_HOST = "api.dawn-chat.com";
export const DAWNCHAT_API_URL = `https://${DAWNCHAT_API_HOST}`;
export const DAWNCHAT_CONFIG_PATH = "/.well-known/stoat";
export const DAWNCHAT_CHAT_URL = "https://chat.dawn-chat.com";
export const DAWNCHAT_APP_URL = "https://chat.dawn-chat.com";
export const DAWNCHAT_OFFICIAL_HOSTS = [
  DAWNCHAT_HOST,
  "https://csinvite.net",
  DAWNCHAT_API_HOST,
  new URL(DAWNCHAT_CHAT_URL).host,
  new URL(DAWNCHAT_APP_URL).host,
] as const;

export const ADMIN_PANEL_HOST = "admin.dawn-chat.com";
export const ADMIN_PANEL_URL = `https://${ADMIN_PANEL_HOST}`;
export const adminPanelInspectUrl = (
  type: "channel" | "message" | "server" | "user",
  id: string,
) => `${ADMIN_PANEL_URL}/panel/inspect/${type}/${id}`;

export const DAWNCHAT_STATUS_URL = "https://status.dawn-chat.com";

export const DAWNCHAT_STATUS_METRICS_URL = `${DAWNCHAT_STATUS_URL}/metrics`;

export const DAWNCHAT_TROUBLESHOOTING_URL =
  "https://support.chillboiostudios.com/";

export const DAWNCHAT_SUPPORT_URL = "https://support.chillboiostudios.com";

export const DAWNCHAT_SPAM_SUPPORT_URL =
  "https://support.stoat.chat/kb/safety/blocked-for-spam";


export const DAWNCHAT_TERMS_URL = "https://www.chillboiostudios.com/terms";


export const DAWNCHAT_PRIVACY_URL = "https://www.chillboiostudios.com/terms";


export const DAWNCHAT_SIGNUP_PRIVACY_URL = "https://www.chillboiostudios.com/terms";


export const DAWNCHAT_ACCEPTABLE_USE_URL = "https://www.chillboiostudios.com/terms";


export const DAWNCHAT_DEVELOPERS_URL = "https://developers.stoat.chat";


export const DAWNCHAT_TRANSLATIONS_URL =
  "https://translate.stoat.chat/projects/revolt/";




  export const DAWNCHAT_CHANGELOG_URL =
  "https://git.chillboiostudios.com/Chillboio-Studios/DawnChat-Static-Files/raw/branch/main/changelog.json";




export const DAWNCHAT_GIFBOX_INFO_URL = "https://gifbox.me/";
export const DAWNCHAT_GIFBOX_URL = "https://gifbox.dawn-chat.com";
export const GIFBOX_UPLOAD_URL = "https://gifbox.me/upload";




export const DAWNCHAT_INVITE_SHORTENER_URL = "https://csinvite.net/dc";
export const DAWNCHAT_DISCOVER_URL = "https://csinvite.net";


export const INVITE_SHORTENER_ORIGINS = [
  new URL(DAWNCHAT_INVITE_SHORTENER_URL).origin,
] as const;



export const DAWNCHAT_GEOLOCATION_URL = "https://geo.revolt.chat";

export const DAWNCHAT_WEBMAIL_URL = "https://mail.vrcband.com";



export const DAWNCHAT_IN_APP_ORIGINS = [
  DAWNCHAT_CHAT_URL,
  "https://dawn-chat.com",
  "https://csinvite.net",
  DAWNCHAT_APP_URL,
] as const;



export const GIF_PROVIDER_ORIGINS = [
  "https://tenor.com",
  "https://giphy.com",
  "https://gifbox.me",
  "https://klipy.com",
  "https://static.klipy.com",
  "https://static1.klipy.com",
  "https://static2.klipy.com",
] as const;


export const GIFBOX_ORIGIN = "https://gifbox.me";
export const KLIPY_URL = "https://klipy.com";
export const KLIPY_API_BASE_URL = "https://api.klipy.com/api/v1";

export const UNICODE_EMOJI_BASE_URL = "https://static.stoat.chat/emoji";

export const CUSTOM_EMOJI_BASE_URL =
  "https://cdn.revoltusercontent.com/emojis";

export const customEmojiUrl = (id: string) =>
  `${CUSTOM_EMOJI_BASE_URL}/${id}`;

export const EMAIL_PROVIDER_URLS = {
  gmail: "https://gmail.com",
  tutanota: "https://mail.tutanota.com",
  outlook: "https://outlook.live.com",
  yahoo: "https://mail.yahoo.com",
  wp: "https://poczta.wp.pl",
  protonmail: "https://mail.protonmail.com",
  seznam: "https://email.seznam.cz",
  zoho: "https://mail.zoho.com/zm/",
  aol: "https://mail.aol.com/",
  icloud: "https://mail.icloud.com/",
  mail: "https://www.mail.com/mail/",
  yandex: "https://mail.yandex.com/",
  hey: "https://app.hey.com/",
  mailRu: "https://mail.ru/",
  rambler: "https://rambler.ru/",
} as const;
