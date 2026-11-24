# Wedding & Event App — MVP Spec

Nov 23, 2026 · Nehal Prasad · Live doc: https://claude.ai/artifact/9Zcoc6eerMU7DQzaScYwvU

## Overview

The MVP gives one wedding a shared app: guests join by QR link, follow the itinerary, and upload photos that sort themselves into each event by time. When the wedding ends, every photo becomes one timeline album.

- **Problem:** the best photos sit in the phones of guests you don't know personally (your father's friend's son), so you never see them. Guests who attend only some functions have nothing from the rest, and anyone who forgot to take pictures has nothing to show.
- **Users:** the host family or wedding planner (admin), and 100–1,000 guests per wedding.
- **First market:** any event where guests' photos beat the host's: weddings (with sub-events such as Haldi, Mehendi and Sangeet), birthdays, parties, corporate events and trips. The admin picks a type when creating the event, and the type preloads its usual sub-events. Indian weddings are the launch example.

**Core principle: one wedding, one shared album.** Every guest's photos land in the same pool, whoever invited them. Every guest can see every event's photos, including functions they didn't attend. Being invited to an event controls who attends it, not who sees its photos. The admin can still mark an event as private (for example, a family-only ritual).

## Roles

| Role | Can do | Sign-in |
| --- | --- | --- |
| Admin (host or planner) | Create the wedding and events, invite guests, design event cards, hide photos, download the album | Phone OTP |
| Co-admin | The same as Admin, except deleting the wedding | Phone OTP |
| Guest | View the itinerary for the events they're invited to, upload photos, view and download the album | QR or link, then name and phone OTP |

## MVP features

1. **Wedding and event setup:** the admin creates the wedding (couple names, dates, cover photo), then adds events. Each event has a name, start and end time, venue with a map link, dress code and a theme colour (for example, yellow for Haldi).
2. **Event cards:** each event gets a card with a cover photo, name, time, venue and dress code. The card is the default; a short teaser video on the card (30 seconds or less, muted autoplay) is optional.
3. **QR and link invites:** each wedding has one QR code and a link. The admin can also send per-guest links whose itinerary shows only the events that guest is invited to. Those guests still see every event's photos unless an event is marked private. The QR code is printable for the invitation and the venue tables.
4. **Itinerary:** the event that is live or next is pinned at the top with a countdown, followed by all events by day. Guests can tap the venue for directions and add events to their calendar.
5. **Photo upload:** guests pick several photos from their gallery or take them with the camera. The capture time (EXIF) puts each photo into the event whose time window contains it. If there's no timestamp, the photo goes into the live event; the guest can always change the event. Uploads are compressed on the device, queued, and retried when the signal comes back.
6. **Event carousels:** the home screen shows one horizontal carousel per event, in time order: Haldi, then Mehendi, and so on. Tapping a carousel opens a grid of that event's photos in time order.
7. **Final timeline album:** once the last event ends, the admin publishes *The Wedding Story*: every photo in time order, with sticky event and day headers as you scroll. Guests can download a single photo or a whole event as a ZIP file.
8. **Moderation:** it's the admin's event, so the admin decides what stays. In Select mode the admin picks photos in any event or The Wedding Story and chooses Delete or Hide. Delete removes them for every guest and keeps them in Deleted for 30 days so they can be restored; Hide takes them out of the album but leaves them with the uploader. Uploaders aren't told. An optional setting requires approval before uploads appear.
9. **Invite on WhatsApp:** the admin uploads their own invitation: an invite card (image or PDF), an invite video, or none (the event cover is used). Share on WhatsApp opens WhatsApp with that invitation attached and a ready message ("Join us on the app to keep track of every event, get the itinerary and share your photos") plus the link. Text-only shares use the standard `wa.me/?text=` link, so the WhatsApp Business API isn't needed; attaching the card or video uses the phone's share sheet. The admin can edit the message, send it to a group or to chosen contacts, and see joined, uploaded and not-yet-joined counts, with Remind. Any guest can forward the link to friends who were there, so their photos land in the album too.
10. **Multiple events per person:** one account can join or host many events at once, for example being a guest at a wedding while running a birthday as admin. My events lists Happening now, Coming up and Albums (past events), with the person's role on each. Switch event in the Home header opens My events.
11. **Multilingual:** the app works in English and Indian languages, starting with Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati and Punjabi. Every screen has a language switch in its header, and the language defaults to the phone's. Guests can also choose it on the Join screen. The admin writes event details once; guests can see them auto-translated, with the original a tap away. Invite messages can be sent in the guest's language. Event names like Haldi and Sangeet are never translated. The design has every screen in Hindi too.

All screens, in English and Hindi, are in [`design/screens`](../design/screens) and on the [design canvas](https://claude.ai/artifact/AGDXeG2UREgskWNqVm9LbJ).

## Key screens and flows

**Guest flow:** scan the QR code → enter name and OTP → itinerary home → tap Upload → photos are sorted into events automatically → view them in the event carousels → after the wedding, open The Wedding Story.

**Admin flow:** create the wedding → add events and their cards → share the QR code or per-guest links → watch uploads arrive and hide any if needed → publish The Wedding Story.

| Screen | Who | What's on it |
| --- | --- | --- |
| Join | Guest | Couple, cover photo, language, name and phone, Send code on WhatsApp |
| Login: enter code | All | 6-digit WhatsApp code (autofill), Change number, resend countdown, Send by SMS, Verify and join |
| Home | All | Live or next event card, Upload button, event carousels, Switch event, notification bell with unread count, profile |
| Itinerary | All | Every event by day with time, venue and directions, dress code, Add to calendar; live event marked |
| Event | All | Event card, photo grid in time order, Upload to this event |
| Photo viewer | All | Full-screen photo, uploader and time, swipe through, Download, Share on WhatsApp, Report; admin: Hide, Delete |
| Upload | Guest | Gallery picker, suggested event for each photo, upload progress |
| Wedding Story | All | Full timeline with event and day headers, Download |
| My events | All | Happening now, Coming up, Albums, role on each event, New event |
| Notifications | All | All and Unread, Mark all read; by day: new photos in an event, photos you're in, event reminders, venue or time changes, album ready, your uploads done; each opens its screen; also sent on WhatsApp (set in profile) |
| Guest profile | All | Name, phone, relation to the couple, Edit; counts of my uploads, photos of me, events; my uploads; language; WhatsApp updates; Find me in photos (opt-in); Settings; Sign out; Delete my account and uploads |
| Settings | All | Language; upload in full quality, Wi-Fi only; WhatsApp and phone notifications, mute during events; Find me in photos, others can download my photos; help and support, privacy policy; delete account |
| Admin dashboard | Admin | Guests joined, photos and uploaders counts; photos waiting for review; deleted and hidden photos; events with status (done, live, upcoming, private), Add event; Invite guests; Guests and roles; Publish The Wedding Story |
| Event editor | Admin | Event type, name, time, venue, dress code, colour, cover photo or video, private toggle |
| Invite on WhatsApp | Admin | Invite card or video upload, message preview, Share on WhatsApp, link and QR, joined counts, Remind |
| Admin: guests and roles | Admin | Search, Joined and Not joined, each guest's uploads and events, make co-admin, remove guest, Remind |
| Admin: delete photos | Admin | Select photos, Delete (restorable 30 days) or Hide |
| Admin: deleted photos | Admin | Deleted and hidden photos with days left, Restore, Delete forever |

Every screen also exists in Hindi and has a language switch in its header.

## Login

Log in with a phone number and a one-time code sent on WhatsApp, with SMS as the fallback. No passwords. Guests arrive from a WhatsApp invite, so the code lands in the app they already have open, and WhatsApp codes cost less and arrive more reliably in India than SMS.

| Who | Method | Notes |
| --- | --- | --- |
| Guest | Phone + WhatsApp OTP (SMS fallback) | Name asked once; signed in for 90 days on that phone |
| Admin, co-admin | Phone + WhatsApp OTP | Re-confirm with a code before Delete photos or Delete event |
| Anyone (optional) | Sign in with Google or Apple | Later, for guests abroad without an Indian number |

- **Provider:** an OTP service with WhatsApp and SMS in one API, such as MSG91, Gupshup or Twilio Verify. Firebase Authentication sends phone codes by SMS only, not WhatsApp. To use WhatsApp codes with Firebase, send and check them through one of those providers, then sign the user in to Firebase with a custom token.
- **Invite link:** the link carries an invite token, so a new guest lands straight in the right event. The token only grants access after the OTP.
- **Phone as identity:** one number is one account across every event, which is what makes My events work.
- **Limits:** 5 codes per number per hour, codes valid for 10 minutes.

## Data model and technical notes

| Entity | Key fields |
| --- | --- |
| Wedding | id, couple names, start and end dates, cover photo, timezone, story_published_at |
| Event | id, wedding_id, name, starts_at, ends_at, venue, map link, dress code, colour, cover photo or video |
| Member | id, wedding_id, name, phone, role (admin, co-admin or guest) |
| Invite | id, wedding_id, token, event_ids (empty means all events) |
| Photo | id, event_id, uploader_id, taken_at, uploaded_at, storage key, width, height, hidden |

- **Auto-sort:** read `taken_at` from EXIF on the device. Match it to an event in the wedding's timezone, with ±30 minutes of slack. Fall back to the upload time.
- **Images:** resize to about 2,000 px on the long edge, at roughly 400 KB, before upload. Generate thumbnails on the server. Keep originals only on a paid plan.
- **Scale:** expect 300 guests × 30 photos ≈ 9,000 photos, or about 3.6 GB per wedding.

## Out of scope (v2)

- Auto-generated highlight reel for each event (a slideshow with music)
- AI sections inside an event (Rituals, Candid, Family, Dance)
- Face search ("photos of me")
- Photographer role with bulk RAW and JPEG upload
- RSVP and meal choices, gifting, live stream
- Printed photo books

## Success metrics and open questions

- At least 60% of invited guests join
- At least 25% of guests who join upload one or more photos
- An average of 20 or more photos per uploading guest
- At least 50% of guests open The Wedding Story within 7 days

- [ ] Pricing: free for guests; does the admin pay per wedding, or by the number of photos stored?
- [ ] Should guests see each other's photos during an event, or only after the admin approves them?
- [ ] How long are photos kept after the wedding (for example, 1 year free, longer paid)?
