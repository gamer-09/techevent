# ⛧ TECHEVENT — Fredericton Tech Signal Node ⛧

A **zero-dependency Node.js server** that tracks tech events happening in
**Fredericton, New Brunswick, Canada** — with dates, locations, and
click-to-navigate directions.

Design: **clean futuristic.** Deep-space palette, electric cyan/blue accents,
soft glass panels, geometric hex/ring motifs, a live WebGL particle field, and
smooth motion throughout — no gothic, no glitch, no cracks. 🛰

---

## 🚀 Run it

Requires **Node.js 14+**. No `npm install` needed — this is the whole point.

**First time:**

```bash
# 1. get the code
git clone https://github.com/gamer-09/techevent.git
cd techevent

# 2. start the server
node server.js
```

You'll see:

```
TECHEVENT signal node online: http://0.0.0.0:6001
Events loaded: 18
```

**3. Open http://localhost:6001** in your browser — the site is served right
from the server (frontend + JSON API, one process).

Other ways to run:

```bash
npm start            # same as: node server.js
npm run dev          # auto-restarts when you edit data/events.json (node --watch)
PORT=8080 node server.js   # different port
```

Troubleshooting:
- **Port already in use?** `EADDRINUSE` → pick another: `PORT=8080 node server.js`
- **Node too old?** `npx node@20 server.js` (or install Node 14+ from nodejs.org)
- To stop the server: `Ctrl+C` in the terminal that's running it.

---

## 🧩 What's inside

```
techevent/
├── server.js            # zero-dependency HTTP server + JSON API
├── lib/
│   └── crawler.js       # LIVE FETCHER — pulls events from real sources
├── data/
│   ├── events.json      # manual/curated events. edit this.
│   └── live-events.json # crawler cache (auto-managed, do not edit)
├── public/
│   ├── index.html       # page shell
│   ├── css/style.css    # futuristic styling (the good stuff)
│   └── js/
│       ├── app.js       # rendering, filters, countdowns, modal
│       └── particles.js # WebGL particle field & canvas fallback
└── README.md
```

## 🛰 Live event crawler

The server doesn't wait for you to edit JSON — it **fetches real events from
the source sites** and mixes them into the API automatically:

| Source | Method |
|---|---|
| `allevents.in/fredericton/technology` | schema.org JSON-LD `<Event>` blocks |
| `myignite.ca/events` (Squarespace) | `eventlist-*` markup parse |

- Runs **on boot + every 6 hours**; results cached in `data/live-events.json`
  so restarts serve instantly even if a source is down.
- Live events get ids like `ae-…` / `ig-…` and a `live` tag on their cards.
- **Manual entries always win** — a fetched event with the same id or the
  same name+month as a `data/events.json` entry is skipped.
- `/api/health` reports `liveEvents`, `liveFetchedAt` and `liveError`.

Known limits: **mlh.io** and **hackatlantic.ca** (Hack Atlantic) are
JavaScript-rendered and block bots, so that hackathon can't be auto-fetched —
add it manually to `data/events.json` if you want it on the board.

## 📡 API

| Route | What it does |
|---|---|
| `GET /api/health` | node status, uptime, event count, live-crawler status |
| `GET /api/events` | all events, sorted by date (TBA last) |
| `GET /api/events?upcoming=1` | only events today or later |
| `GET /api/events?category=cybersecurity` | filter by category |
| `GET /api/events?month=2026-10` | filter by month (`YYYY-MM`) |
| `GET /api/events?q=hackathon` | search name / tags / venue |
| `GET /api/events/:id` | single event |
| `GET /api/meta` | categories, months, counts, city info |
| `GET /api/events.ics` | **iCalendar feed** — subscribe in Google Calendar, Apple Calendar, Outlook |
| `GET /api/events.rss` | **RSS 2.0 feed** for feed readers |

Both feeds are generated live from `data/events.json` — every event with a
date gets a calendar entry (timed events carry `TZID=America/Moncton`;
all-day events use `VALUE=DATE`). Recurring/TBA events are included in RSS but
skipped in iCal (no fixed date to pin).

## ✍️ Adding an event

Open `data/events.json` and add an object to `events`:

```json
{
  "id": "my-event",
  "name": "My Event",
  "date": "2026-11-20",
  "time": "18:00",
  "dateEnd": "2026-11-20",
  "timeEnd": "21:00",
  "category": "startup",
  "tags": ["networking", "free"],
  "cost": "FREE",
  "venue": "Venue Name",
  "address": "123 Street, Fredericton, NB",
  "organizer": "Who runs it",
  "url": "https://registration.link",
  "description": "What it is.",
  "directions": "How to get there / parking / bus.",
  "registration": "required",
  "registrationNote": "How to sign up — or that it's walk-in friendly.",
  "registrationCost": "free",
  "goodFor": ["Cybersecurity", "Software Engineering"]
}
```

- `"date": null` → renders as **TBA / recurring** (great for recurring meetups).
- `"registration"` → one of `required` / `recommended` / `dropin`:
  - `required` — must register/ticket before attending (red badge: "REGISTRATION REQUIRED")
  - `recommended` — free but RSVP helps organizers (blue badge: "REGISTER RECOMMENDED")
  - `dropin` — just show up, no registration (green badge: "JUST SHOW UP")
- `"registrationCost"` → whether you **pay to register/attend**: `free` (green "FREE TO REGISTER"), `paid` (amber "PAID REGISTRATION"), or `donation`.
- `"goodFor"` → array of courses/programs the event is beneficial for. Shown as "GOOD FOR" pills on the card.
- Keep `id` unique — it's used by `/api/events/:id`.

## 🧭 Directions

Every card ships a **GET DIRECTIONS** button that opens Google Maps turn-by-turn
directions to the exact venue address. The DETAILS modal also includes parking,
transit, and "getting there" notes per venue.

## 🗞 Data sources (cross-referenced 2026-08-05)

- allevents.in/fredericton/technology
- myignite.ca/events · events.startupatlantic.ca (Ignite / Planet Hatch)
- frederictonmakerspace.ca
- unb.ca/cic (Canadian Institute for Cybersecurity)
- unb.ca/fredericton/cs
- unb.ca/fredericton/management/ibec/apex
- nbif.ca
- fredericton.ca/en/arts-culture-and-recreation/library
- scienceeast.nb.ca
- witnb.ca
- nbcc.ca

⚠️ Event dates move. Always confirm on the organizer's page before travelling.

## 🎨 Design notes

- **Futuristic:** deep-space blue-black, electric cyan→blue gradient accents,
  Space Grotesk + JetBrains Mono, glass panels, geometric hex/ring motifs.
- **WebGL particle field:** 260 drifting point-sprite embers (cyan/blue/indigo)
  with additive blending and subtle mouse parallax — with a 2D-canvas fallback.
- **Scroll parallax:** hero layers and decorative shapes shift at different rates.
- **Animated "signal lost" state:** radar sweep animation when filters match zero events.
- **Motion:** staggered entrances, hover lift, gradient title flow, ticker marquee.

MIT — build, fork, corrupt it further.
