/**
 * TECHEVENT — Fredericton Tech Event Signal Node
 * -------------------------------------------------
 * Zero-dependency Node.js server.
 *
 *   node server.js          -> http://localhost:3000
 *   PORT=8080 node server.js
 *
 * Routes
 *   GET  /                      -> futuristic-gothic frontend
 *   GET  /api/health            -> uptime + event count
 *   GET  /api/events            -> all events (sorted by date)
 *        ?upcoming=1            -> only events today or later
 *        ?category=cybersecurity-> filter by category
 *        ?month=2026-10         -> filter by month (YYYY-MM)
 *        ?q=ai                  -> search name/tags/venue
 *   GET  /api/events/:id        -> single event
 *   GET  /api/meta              -> categories, months, counts, city info
 *
 * Data lives in data/events.json — edit that file and restart (or use
 * `npm run dev` with --watch) and the API + frontend pick it up.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'events.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);

function loadEvents() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch (err) {
    log('ERROR loading events:', err.message);
    return [];
  }
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function filterEvents(events, query) {
  let out = events.slice();

  if (query.upcoming === '1' || query.upcoming === 'true') {
    const today = todayStr();
    out = out.filter((e) => e.date && e.date >= today);
  }

  if (query.category) {
    out = out.filter((e) => e.category === query.category);
  }

  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
    out = out.filter((e) => e.date && e.date.startsWith(query.month));
  }

  if (query.q) {
    const q = query.q.toLowerCase();
    out = out.filter((e) =>
      [e.name, e.venue, e.address, e.organizer, ...(e.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }

  // null dates (recurring/TBA) go last, sorted by name
  const dated = out.filter((e) => e.date);
  const undated = out.filter((e) => !e.date).sort((a, b) => a.name.localeCompare(b.name));
  dated.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return dated.concat(undated);
}

function buildMeta(events) {
  const categories = {};
  const months = {};
  let dated = 0;
  for (const e of events) {
    categories[e.category] = (categories[e.category] || 0) + 1;
    if (e.date) {
      dated++;
      const m = e.date.slice(0, 7);
      months[m] = (months[m] || 0) + 1;
    }
  }
  return {
    city: 'Fredericton',
    region: 'New Brunswick',
    country: 'Canada',
    coords: [45.9636, -66.6431],
    eventCount: events.length,
    datedCount: dated,
    recurringCount: events.length - dated,
    categories: Object.keys(categories).sort(),
    categoryCounts: categories,
    months: Object.keys(months).sort(),
    monthCounts: months,
    sources: [
      'https://allevents.in/fredericton/technology',
      'https://myignite.ca/events',
      'https://events.startupatlantic.ca/',
      'https://www.frederictonmakerspace.ca/',
      'https://www.unb.ca/cic/',
    ],
  };
}

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function serveStatic(res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(ROOT, 'public', rel));

  if (!filePath.startsWith(path.join(ROOT, 'public'))) {
    res.writeHead(403);
    return res.end('403: path traversal detected. stay in your lane.');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404: SIGNAL LOST — file not found in the void.');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = parsed;
  const query = Object.fromEntries(parsed.searchParams.entries());

  // API
  if (pathname.startsWith('/api/')) {
    const events = loadEvents();
    const parts = pathname.split('/').filter(Boolean); // e.g. ['api','events','id']

    if (pathname === '/api/health') {
      return sendJSON(res, 200, {
        status: 'OK',
        node: 'TECHEVENT.SIGNAL_NODE',
        uptime: process.uptime().toFixed(1) + 's',
        eventsLoaded: events.length,
        dataFile: path.basename(DATA_FILE),
        updated: new Date().toISOString(),
      });
    }

    if (parts[1] === 'events') {
      if (parts.length === 2) {
        return sendJSON(res, 200, {
          count: filterEvents(events, query).length,
          total: events.length,
          events: filterEvents(events, query),
        });
      }
      if (parts.length === 3) {
        const found = events.find((e) => e.id === parts[2]);
        if (!found) return sendJSON(res, 404, { error: 'event_not_found', id: parts[2] });
        return sendJSON(res, 200, found);
      }
    }

    if (parts[1] === 'meta') {
      return sendJSON(res, 200, buildMeta(events));
    }

    return sendJSON(res, 404, { error: 'unknown_api_route', hint: 'try /api/events' });
  }

  // Frontend + static assets
  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(res, pathname);
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('405: method not permitted by the elder protocols.');
});

server.listen(PORT, HOST, () => {
  log(`TECHEVENT signal node online: http://${HOST}:${PORT}`);
  log(`Events loaded: ${loadEvents().length}`);
});
