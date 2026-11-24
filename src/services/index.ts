/**
 * Service layer. Screens import only from here.
 * Firebase runs when EXPO_PUBLIC_FIREBASE_* is set (cloud or local emulator); otherwise in-memory mocks.
 */
import { firebaseEnabled } from './firebase';
import * as fbImpl from './fb';
import * as mockImpl from './mock/core';
import { MOCK_NOW } from './mock/data';

export * from './types';
export { sortIntoSubEvent } from './sort';
export { firebaseEnabled, MOCK_NOW };

type Api = typeof mockImpl;
const api: Api = firebaseEnabled ? (fbImpl as unknown as Api) : mockImpl;

export const { auth, events, photoService, uploads, people, inbox, moderation, admin, settings } = api;

/**
 * "Now" for live/next logic. Mocks freeze time on 13 Dec 2026 11:00 so Haldi is live;
 * EXPO_PUBLIC_DEMO_NOW does the same against Firebase (e.g. 2026-12-13T11:00:00).
 */
const demoNow = process.env.EXPO_PUBLIC_DEMO_NOW ? new Date(process.env.EXPO_PUBLIC_DEMO_NOW) : null;
export const now = () => demoNow ?? (firebaseEnabled ? new Date() : MOCK_NOW);
