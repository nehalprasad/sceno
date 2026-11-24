/** Mock backend: in-memory data so the app runs with no Firebase project. */
import * as SecureStore from 'expo-secure-store';
import { celebrations, photos, subEvents } from './data';
import type { Celebration, OtpChannelResult, WaLoginStart, Photo, SubEvent, User } from '../types';

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const SESSION_KEY = 'session.v1';
let currentUser: User | null = null;
let mockWaVerified = false;

export const auth = {
  async requestOtp(phone: string, channel: 'whatsapp' | 'sms' = 'whatsapp'): Promise<OtpChannelResult> {
    await wait(500); void phone;
    return { requestId: `req_${Date.now()}`, channel, resendAfterSec: 30 };
  },
  async verifyOtp(requestId: string, code: string, name: string, phone: string): Promise<User> {
    if (!/^\d{6}$/.test(code) || !requestId) throw new Error('bad_code');
    await wait(600);
    currentUser = { id: 'u1', name, phone };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(currentUser)).catch(() => {});
    return currentUser;
  },
  async startWaLogin(phone: string, name: string): Promise<WaLoginStart> {
    await wait(400); void phone; void name;
    mockWaVerified = false;
    return { loginId: `wa_${Date.now()}`, secret: 'mock', code: String(100000 + Math.floor(Math.random() * 900000)), waNumber: '15551234567', expiresInSec: 600, dev: true };
  },
  async checkWaLogin(loginId: string, secret: string, name: string, phone: string): Promise<User | null> {
    if (!mockWaVerified) return null;
    void loginId; void secret;
    return auth.verifyOtp('wa', '000000', name, phone);
  },
  async devVerifyWaLogin(loginId: string, secret: string): Promise<void> { void loginId; void secret; mockWaVerified = true; },
  async startReverify(): Promise<WaLoginStart> { mockWaVerified = false; return auth.startWaLogin('', ''); },
  async checkReverify(loginId: string, secret: string): Promise<boolean> { void loginId; void secret; return mockWaVerified; },
  async restore(): Promise<User | null> {
    try { const raw = await SecureStore.getItemAsync(SESSION_KEY); currentUser = raw ? JSON.parse(raw) : null; } catch { currentUser = null; }
    return currentUser;
  },
  async updateProfile(patch: { name?: string; avatarUri?: string }): Promise<User | null> {
    if (!currentUser) return null;
    currentUser = { ...currentUser, ...(patch.name ? { name: patch.name } : {}), ...(patch.avatarUri ? { avatar: patch.avatarUri } : {}) };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(currentUser)).catch(() => {});
    return currentUser;
  },
  async deleteAccount() { await auth.signOut(); },
  async signOut() { currentUser = null; await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {}); },
};

export const events = {
  async listMine(): Promise<Celebration[]> { await wait(); return celebrations; },
  async get(id: string): Promise<Celebration | undefined> { await wait(100); return celebrations.find((c) => c.id === id); },
  /** Invite links carry the celebration id: https://sceno.app/aarav-meera */
  async byInvite(code: string): Promise<Celebration | undefined> { await wait(100); return celebrations.find((c) => c.id === code); },
  async join(celebrationId: string, invite?: string): Promise<void> { void celebrationId; void invite; },
  async subEvents(celebrationId: string): Promise<SubEvent[]> {
    await wait(150);
    return subEvents.filter((s) => s.celebrationId === celebrationId).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },
  async subEvent(id: string): Promise<SubEvent | undefined> { await wait(100); return subEvents.find((s) => s.id === id); },
};

export const photoService = {
  async forSubEvent(subEventId: string): Promise<Photo[]> {
    await wait(200);
    return photos.filter((p) => p.subEventId === subEventId && !p.hidden).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  },
  async get(id: string): Promise<Photo | undefined> { return photos.find((p) => p.id === id); },
};

export * from './more';
