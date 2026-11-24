/** Accepts https://sceno.app/<id>, sceno://join/<id>, a WhatsApp message containing the link, or a bare code. */
export function inviteCode(text: string): string | null {
  const s = text.trim();
  const m = s.match(/sceno\.app\/(?:join\/)?([a-z0-9-]{3,60})/i) ?? s.match(/sceno:\/\/join\/([a-z0-9-]{3,60})/i);
  if (m) return m[1].toLowerCase();
  return /^[a-z0-9-]{3,60}$/i.test(s) ? s.toLowerCase() : null;
}
