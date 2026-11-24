/**
 * Invite links are https://sceno.app/<eventId> (universal / app links). Expo Router would treat
 * `/<eventId>` as an unknown route, so send any sceno.app link with one path segment to the join screen.
 * `/join/<id>` and `sceno://join/<id>` already match src/app/join/[code].tsx and pass through.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const m = /^https?:\/\/(?:www\.)?sceno\.app\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(path);
    // ?i=<code> is a per-guest invite for chosen parts; keep it for the join screen.
    const inv = /[?&]i=([A-Za-z0-9_-]+)/.exec(path)?.[1];
    if (m && m[1] !== 'join') return `/join/${m[1]}${inv ? `?i=${inv}` : ''}`;
    return path;
  } catch {
    return path;
  }
}
