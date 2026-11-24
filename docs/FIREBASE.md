# Sceno on Firebase

The app has three modes, picked by environment variables:

| Mode | When | Data |
|---|---|---|
| Mock | no `EXPO_PUBLIC_FIREBASE_*` set | in-memory demo data, any login code works |
| Emulator | `npm run start:emu` | local Firebase on this Mac, code `123456` |
| Cloud | `.env` filled from your project | your real Firebase project |

## Run against the local emulator (no Firebase account needed)

```bash
npm run emulators      # terminal 1: Auth, Firestore, Storage, Functions + UI at http://127.0.0.1:4010
npm run seed           # terminal 2: loads the Aarav & Meera demo
npm run start:emu      # terminal 3: the app, pointed at the emulator (start:emu:demo freezes the clock at 13 Dec 2026 11:00 for the seeded wedding)
```

Sign in with **+91 98765 43210** and code **123456** (that number is the event admin).
On a real phone add `EXPO_PUBLIC_EMULATOR_HOST=<your Mac's Wi-Fi IP>` in front of `npm run start:emu`.
The emulator needs Java 21: `brew install openjdk@21` (the npm script uses it automatically).
Ports used: Auth 9098, Firestore 8085, Storage 9198, Functions 5011, UI 4010.

## Move to your real project

1. Create the project at console.firebase.google.com and upgrade it to **Blaze**.
2. Turn on **Authentication**, **Firestore** (location `asia-south1`, production mode) and **Storage** (same location).
3. Register a **Web app** and copy its `firebaseConfig` into `.env` (template: `.env.example`).
   Register iOS and Android apps with bundle/package `com.sceno.app` (config files are needed only for native builds later).
4. On this Mac:
   ```bash
   firebase login
   firebase use --add          # pick the project, alias "default"
   firebase functions:secrets:set MSG91_AUTH_KEY        # type "dev" for now to keep code 123456
   firebase functions:secrets:set MSG91_WA_TEMPLATE
   firebase functions:secrets:set MSG91_WA_NUMBER
   firebase functions:secrets:set MSG91_SMS_TEMPLATE_ID
   npm run deploy              # rules, indexes, storage rules, all functions
   ```
   With `MSG91_AUTH_KEY=dev` every login code is 123456: fine for a private demo, **never for launch**.
5. Start the app with `npx expo start` (it reads `.env`).

## What lives where

- `src/services/fb/index.ts`: every read and write the app makes (Firestore layout is documented at the top).
- `functions/src/index.ts`: login codes, event creation and joining, counters, moderation, publish, reminders, account deletion.
- `firestore.rules`, `storage.rules`: who can see and change what (guests never see family-only photos; only admins moderate).
- `firestore.indexes.json`: indexes the queries need.
- `scripts/seed.mjs`: demo data, emulator only (refuses to run on a real project).

## Still to do before launch

- MSG91 (or Meta Cloud API) WhatsApp authentication template approved, plus the real keys.
- WhatsApp templates for invite reminders and "album published" (code has TODOs where they plug in).
- Thumbnails for faster grids (Firebase "Resize Images" extension), and push notifications (Expo push tokens).
- The sceno.app domain with a join page and universal/app links, so invite links and QR codes open the app.

## Invite links and the join page (Firebase Hosting)

Invite links and QR codes are `https://sceno.app/<eventId>`. Firebase Hosting (free Spark plan) serves `web/`:

- `web/index.html`: the join page. It reads the public `invitePreviews/<eventId>` doc and shows the event name, dates, venue and the invite card (never cropped), with an English/Hindi toggle, an "Open in Sceno" button (`sceno://join/<eventId>`) and store buttons. Every path rewrites to it, so `/<eventId>` and `/join/<eventId>` both work.
- `web/.well-known/apple-app-site-association` and `web/.well-known/assetlinks.json`: let iOS and Android open these links straight in the app once it is installed.
- In the app, `src/app/+native-intent.tsx` turns `https://sceno.app/<eventId>` into `/join/<eventId>`; `app.json` has `ios.associatedDomains` and an Android `intentFilters` entry for `sceno.app`.

Local test: `npm run emulators` now also starts the hosting emulator on port 5002, so open `http://localhost:5002/aarav-meera` after `npm run seed`. On localhost the page reads the Firestore emulator (port 8085). In Expo Go, test the app side with `exp://127.0.0.1:8081/--/join/aarav-meera`; universal links (https) only work in a real build.

## Domain setup (what you must buy and set)

1. **Buy the domain `sceno.app`** (any registrar; `.app` needs HTTPS, which Firebase Hosting provides free).
2. **Connect it to Hosting**: Firebase console → Hosting → Add custom domain → `sceno.app` (add `www.sceno.app` as a redirect to it). Add the DNS records the console shows at your registrar (usually two `A` records, plus a `TXT` record to verify ownership). The SSL certificate is issued automatically, which can take up to 24 h.
3. **Deploy**: `firebase deploy --only hosting`.
4. **Apple Team ID**: from developer.apple.com → Membership details (10 characters, e.g. `AB12CD34EF`). In `web/.well-known/apple-app-site-association` replace `REPLACE_WITH_APPLE_TEAM_ID` so it reads `AB12CD34EF.com.sceno.app`. Associated Domains is turned on for the app ID automatically by EAS when it sees `ios.associatedDomains`.
5. **Android SHA-256**: if you use Play App Signing, copy the "App signing key certificate" SHA-256 from Play Console → Test and release → App integrity; otherwise run `npx eas-cli@latest credentials -p android` and copy the SHA-256 of the upload keystore. Replace `REPLACE_WITH_ANDROID_SHA256_FINGERPRINT` in `web/.well-known/assetlinks.json` (format `AA:BB:...`; you can list both keys).
6. **Store links**: once the apps are live, replace `idREPLACE_WITH_APP_STORE_ID` in `web/index.html` with the App Store ID (the Play link already uses `com.sceno.app`).
7. **Check**: `https://sceno.app/.well-known/apple-app-site-association` and `https://sceno.app/.well-known/assetlinks.json` must return the JSON directly (no redirect), then rebuild the apps with EAS so the new entitlements and intent filters are included.

## Meta setup (free WhatsApp login)

Login is free: the guest *sends* `Sceno code 482913` to Sceno's WhatsApp number (user-started chats cost nothing on Meta's Cloud API) and our "You're in ✅" reply falls inside the free 24-hour window. Code: `functions/src/waLogin.ts`. In the emulator (or with `META_WA_TOKEN=dev`) no Meta account is needed: the app shows a "Test: pretend I sent it" button, and `npm run test:backend` sends signed fake webhooks.

What you create (developers.facebook.com):
1. A Meta app of type **Business**, add the **WhatsApp** product. Meta gives you a free **test number** (fine for now; add your own phone as a test recipient). Later, add Sceno's real number.
2. **System user token** (Business settings → System users → generate token with `whatsapp_business_messaging`), not the 24 h temporary one.
3. Webhook: callback URL `https://asia-south1-<project-id>.cloudfunctions.net/waWebhook`, verify token = any random string you choose, subscribe to the **messages** field.

What you set (never paste these into chat or commit them):
```bash
firebase functions:secrets:set META_WA_TOKEN       # system user token
firebase functions:secrets:set META_APP_SECRET     # App settings → Basic → App secret (signs webhooks)
firebase functions:secrets:set META_WA_PHONE_ID    # WhatsApp → API setup → Phone number ID
firebase functions:secrets:set META_VERIFY_TOKEN   # the random string you typed in the webhook form
firebase functions:secrets:set SCENO_WA_NUMBER     # the number guests message, digits only, e.g. 15551234567
```
Deploy functions (and `firestore:indexes`) **before** pressing Verify in Meta's webhook form. If WhatsApp login can't start (secrets missing), the app falls back to the typed-code screen.
