# 🌴 YaraSpeak

An AI-powered spoken English coach for the host of **Yara Retreat**, Hiriketiya, Sri Lanka.

Practise real guest conversations out loud with **David**, a polite British tourist played by Google Gemini. You speak into the microphone, David speaks back in a British voice, and after every turn the YaraSpeak coach gives one short, gentle tip.

## Stack

| Piece | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Icons | lucide-react |
| AI | Google Gemini Flash via `generativelanguage.googleapis.com` (server-side `fetch`, no SDK) |
| Speech → text | Browser Web Speech API (`webkitSpeechRecognition`), `en-GB` |
| Text → speech | Browser `window.speechSynthesis`, British voice preferred |

The API key never reaches the browser: the key is only read inside `app/api/chat/route.ts`, which runs on the server.

## Features

- Pulsating mic button with four states: idle, listening, thinking, speaking.
- Live transcript preview while you speak.
- Automatic playback of David's reply, with a mute toggle.
- **Hands free** mode: the mic reopens by itself after David stops talking, like a phone call.
- Fallback text input for devices without speech recognition.
- Four practice scenarios plus free chat, each with an opening line from David:
  - 🏨 Check-in & Welcome Drink (King Coconut)
  - 🛵 Scooter Rental & Hiriketiya Beach / Surfing
  - 🍳 Breakfast & Wi-Fi Details
  - 🚕 Check-out & Airport Taxi
- 💡 **YaraSpeak Coach Tip** card under each of David's replies.

## Local setup

```bash
npm install
cp .env.example .env.local   # then paste your real key into .env.local
npm run dev
```

Open http://localhost:3000 and allow microphone access.

Get a free key at https://aistudio.google.com/app/apikey.

```
GEMINI_API_KEY=AIza...
# GEMINI_MODEL=gemini-3.8-flash   # optional override
```

### A note on the model

The default is `gemini-3.5-flash`. Gemini 1.5 Flash and 2.5 Flash are both
retired for new API keys ("no longer available to new users"), so asking for
them returns a 404.

Gemini 3.x models reason before answering, and those hidden thinking tokens
come out of `maxOutputTokens` — unconstrained they eat the whole budget and the
JSON reply arrives truncated. The route therefore sends
`thinkingConfig: { thinkingLevel: "low" }` for any `gemini-3*` model, which
David does not need anyway for two friendly sentences. The field is skipped for
other models, since older ones reject it.

If you see `Google AI returned 404`, set `GEMINI_MODEL` to a model your key can
use and restart. To list them:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models"   -H "x-goog-api-key: $GEMINI_API_KEY"
```

Flash models sometimes answer 503 under load; the route retries once
automatically.

## Deploy to Vercel

```bash
git add -A
git commit -m "YaraSpeak"
gh repo create yaraspeak --private --source=. --push
```

Then on vercel.com: **Add New → Project → import the repo**, add the
`GEMINI_API_KEY` environment variable (Production, Preview and Development),
and deploy. Voice input needs HTTPS, which every Vercel URL already provides.

## Browser notes

Speech recognition is a Chrome/Edge/Safari feature. On Firefox the mic button is
disabled and the typing box is shown instead. Available TTS voices come from the
operating system, so David sounds different on Android, iOS, Windows and macOS.
# YaraSpeak
