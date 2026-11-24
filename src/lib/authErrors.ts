/** Friendly text for login limits. Server errors arrive as { message: 'hourly_limit', details: { retryAfterSec } }. */
type T = (key: string, opts?: Record<string, unknown>) => string;
export function limitText(e: unknown, t: T): string | null {
  const err = e as { message?: string; details?: { retryAfterSec?: number } } | null;
  if (err?.message === 'hourly_limit') return t('login.limit', { mins: Math.max(1, Math.ceil((err.details?.retryAfterSec ?? 3600) / 60)) });
  if (err?.message === 'too_soon') return t('login.tooSoon');
  if (err?.message === 'expired') return t('login.waExpired');
  return null;
}
export const isLimit = (e: unknown) => (e as { message?: string } | null)?.message === 'hourly_limit';
