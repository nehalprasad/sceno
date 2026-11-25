import type { Localized } from '@/i18n';

export type Role = 'guest' | 'family' | 'coadmin' | 'admin';
/** All admins are equal; 'coadmin' is a legacy value treated as admin. */
export const isAdminRole = (r?: Role) => r === 'admin' || r === 'coadmin';

export interface User {
  id: string;
  name: string;
  phone: string; // E.164
  avatar?: string; // local or Storage URL
}

/** The whole celebration (a wedding, birthday, trip). */
export interface Celebration {
  id: string;
  title: Localized; // "Aarav & Meera"
  city: Localized;
  venue: Localized;
  startsAt: string; // ISO
  endsAt: string;
  coverAccent: string;
  myRole: Role;
  kind?: string; // wedding, birthday, party, corporate, trip, other
  published: boolean; // admin has published the timeline album
  subEventCount?: number; // from the public invite preview
  guestCount?: number; // members joined (kept by functions)
  inviteMedia?: InviteMedia; // admin's invite card or teaser video
  joinCode?: string; // name-based code for links, e.g. "ishan-pinki"
  holdUploads?: boolean; // guests' uploads wait for admin approval
  inviteText?: string; // admin's edited invite message
  inviteTextI18n?: Localized; // same, auto-translated (functions/src/translate.ts)
}

/** A sub-event: Haldi, Mehendi, Sangeet… Names are kept as entered by the host. */
export interface SubEvent {
  id: string;
  celebrationId: string;
  name: string;
  startsAt: string;
  endsAt?: string;
  place: Localized;
  dress?: Localized;
  note?: Localized;
  accent: string;
  private: boolean; // family only
  mapsQuery?: string;
  mapLink?: string; // admin-pasted Google/Apple Maps link or search text; Directions opens it
  cover?: InviteMedia; // cover photo or ≤30 s teaser video, shown whole on the accent colour
  photoCount: number;
  guestCount: number;
  /** Created from a preset with only the day known; the host still has to set the time. */
  timeTbd?: boolean;
}

export type PhotoTag = 'rituals' | 'candid' | 'family';

export interface Photo {
  id: string;
  subEventId: string;
  uri: string;
  width: number;
  height: number;
  takenAt: string; // EXIF capture time, used for auto-sorting
  uploadedBy: { id: string; name: string };
  tags: PhotoTag[];
  hidden: boolean;
  noDownload?: boolean; // set by the server when the uploader turned off "Others can download my photos"
  thumb?: string; // ~400px server thumbnail for grids; falls back to uri
  medium?: string; // ~1200px for the viewer; falls back to uri
}

export interface OtpChannelResult {
  requestId: string;
  channel: 'whatsapp' | 'sms';
  resendAfterSec: number;
}

/** Free WhatsApp login: the guest sends `code` to Sceno's number; the app polls until it lands. */
export interface WaLoginStart {
  loginId: string;
  secret: string;
  code: string;
  waNumber: string;
  expiresInSec: number;
  dev: boolean;
}

export interface SubEventInput {
  name: string; startsAt: string; endsAt?: string | null; place: Localized; dress?: Localized | null; note?: Localized | null;
  private: boolean; accent: string; mapLink?: string | null;
  timeTbd?: boolean; // only the day is known
}
/** Cover for one part: a new local file to upload, or clear. */
export interface PartCoverUpdate { mediaUri?: string; kind?: 'image' | 'video'; clear?: boolean }
export interface InviteMedia { url: string; kind: 'image' | 'video' }
export interface InviteUpdate { mediaUri?: string; kind?: 'image' | 'video'; clearMedia?: boolean; text?: string | null }
export interface Guest { id: string; name: string; relation: string; role: Role; uploads: number; events: 'all' | string[]; joined: boolean; invitedAt?: string; phone?: string }
export interface Notice { id: string; kind: 'photos' | 'you' | 'reminder' | 'change' | 'album' | 'mine'; text: { en: string; hi: string }; at: string; read: boolean; link?: string }
export interface Removed { photo: Photo; state: 'deleted' | 'hidden'; at: string }
export interface Prefs { waUpdates: boolean; push: boolean; findMe: boolean; fullQuality: boolean; wifiOnly: boolean; othersDownload: boolean; muteDuringEvents: boolean; lang?: string /* UI language; invites and notices use it */ }
export interface PickedAsset { uri: string; width: number; height: number; takenAt?: string }
/** id: a fixed photo id so retries are idempotent. onProgress: 0..1 of the file upload. */
export interface UploadOpts { id?: string; onProgress?: (fraction: number) => void }
export interface AdminStats { guests: number; photos: number; uploaders: number; waiting: number; removed: number; notJoined: number; pending?: number }
export interface NewCelebration { kind: string; name: string; city: string; private: boolean; startsAt?: string; endsAt?: string; parts?: string[] }
