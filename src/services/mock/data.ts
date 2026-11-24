import type { Celebration, Photo, SubEvent } from '../types';

/**
 * In-memory store used only when no Firebase config is set. It starts empty: no demo events,
 * guests or photos. Everything shown comes from what you create in the app.
 */
export const MOCK_NOW = new Date();

export const celebrations: Celebration[] = [];
export const subEvents: SubEvent[] = [];
export const photos: Photo[] = [];
