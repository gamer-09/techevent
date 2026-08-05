# ⛧ TECHEVENT — Fredericton Tech Signal Node ⛧

A **zero-dependency Node.js server** that tracks tech events happening in
**Fredericton, New Brunswick, Canada** — with dates, locations, and
click-to-navigate directions.

Design: **futuristic + gothic… and a little cracked.** Void-black cathedral
palette, blackletter glitch title, neon magenta/acid-green signal cards,
CRT scanlines, and cards that are ever so slightly tilted. By design. 🕸

---

## 🚀 Run it

Requires **Node.js 14+**. No `npm install` needed — this is the whole point.

```bash
node server.js
# or
npm start
```

Then open **http://localhost:3000**

Want auto-reload while editing `data/events.json`?

```bash
npm run dev        # node --watch server.js
```

Different port: `PORT=8080 node server.js`

---

## 🧩 What's inside

```
techevent/
├── server.js            # zero-dependency HTTP server + JSON API
├── data/
│   └── events.json      # ← ALL EVENT DATA LIVES HERE. edit this.
├── public/
│   ├── index.html       # page shell
│   ├── css/style.css    # futuristic gothic styling (the good stuff)
│   └── js/app.js        # rendering, filters, countdowns, modal
└── README.md
```

## 📡 API

| Route | What it does |
|---|---|
| `GET /api/health` | node status, uptime, event count |
| `GET /api/events` | all events, sorted by date (TBA last) |
| `GET /api/events?upcoming=1` | only events today or later |
| `GET /api/events?category=cybersecurity` | filter by category |
| `GET /api/events?month=2026-10` | filter by month (`YYYY-MM`) |
| `GET /api/events?q=hackathon` | search name / tags / venue |
| `GET /api/events/:id` | single event |
| `GET /api/meta` | categories, months, counts, sources |

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
  "directions": "How to get there / parking / bus."
}
```

- `"date": null` → renders as **TBA / recurring** (great for recurring meetups).
- Keep `id` unique — it's used by `/api/events/:id`.
- Restart the server (or use `npm run dev`) to pick up changes.

## 🧭 Directions

Every card ships a **GET DIRECTIONS** button that opens Google Maps turn-by-turn
directions to the exact venue address. The DETAILS modal also includes parking,
transit, and "getting there" notes per venue.

## 🗞 Data sources (cross-referenced 2026-08-05)

- allevents.in/fredericton/technology
- myignite.ca/events · events.startupatlantic.ca (Ignite / Planet Hatch)
- frederictonmakerspace.ca
- unb.ca/cic (Canadian Institute for Cybersecurity)

⚠️ Event dates move. Always confirm on the organizer's page before travelling —
this node is a community board, not an oracle.

## 🎨 Design notes

- **Gothic:** UnifrakturMaguntia blackletter title, rose-window glyphs, arched
  card seams, cathedral purple/void palette.
- **Futuristic:** Orbitron display type, neon magenta + acid green signal
  language, scanlines, noise, boot-sequence terminal.
- **A little cracked:** RGB-split glitch title, grain flicker, tilted cards
  (`:nth-child(3n)` …), corrupted footer stamp `0xFEEDBEEF`, a scan bar that
  sweeps the page every 9 seconds, and random one-off glitch bursts on cards.
- **Animated & alive:** drifting aurora glow behind the page, floating signal
  motes, 3D card tilt that follows your cursor, light-sweep shimmers on cards
  and buttons, staggered card entrances, scroll reveals, a pulsing countdown,
  ticker that pauses on hover, and animated modal open/close — all with
  `prefers-reduced-motion` support.

MIT — build, fork, corrupt it further.
