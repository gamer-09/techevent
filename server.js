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
    lastUpdated: (() => {
      try {
        const m = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).meta;
        return (m && m.lastUpdated) || todayStr();
      } catch {
        return todayStr();
      }
    })(),
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
      'https://www.unb.ca/fredericton/cs/',
      'https://www.unb.ca/fredericton/management/ibec/apex/',
      'https://nbif.ca/',
      'https://www.fredericton.ca/en/arts-culture-and-recreation/library',
      'https://www.scienceeast.nb.ca/',
      'https://witnb.ca/',
      'https://nbcc.ca/',
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

/* ---------------- feed builders (iCal + RSS) ---------------- */

const DAYS3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n) => String(n).padStart(2, '0');

function escXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function icalEsc(s) {
  return String(s).replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

function foldICal(text) {
  return text
    .split('\r\n')
    .map((line) => {
      const out = [];
      let cur = line;
      while (cur.length > 75) {
        out.push(cur.slice(0, 75));
        cur = ' ' + cur.slice(75);
      }
      out.push(cur);
      return out.join('\r\n');
    })
    .join('\r\n');
}

function icalDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-');
  const [hh, mi] = (timeStr || '00:00').split(':');
  return `${y}${m}${d}T${hh}${mi}00`;
}

function datePlusDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10).replace(/-/g, '');
}

function toICal(events) {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TECHEVENT//Fredericton Signal Node//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:TECHEVENT - Fredericton Tech Events',
    'X-WR-TIMEZONE:America/Moncton',
  ];
  for (const e of events) {
    if (!e.date) continue; // recurring/TBA events have no fixed date
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.id}@techevent.fredericton`);
    lines.push(`DTSTAMP:${now}Z`);
    if (e.time) {
      lines.push(`DTSTART;TZID=America/Moncton:${icalDateTime(e.date, e.time)}`);
      const endTime = e.timeEnd || addHours(e.time, 1);
      const endDate = e.dateEnd || e.date;
      lines.push(`DTEND;TZID=America/Moncton:${icalDateTime(endDate, endTime)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`);
      lines.push(`DTEND;VALUE=DATE:${datePlusDays(e.dateEnd || e.date, 1)}`);
    }
    lines.push(`SUMMARY:${icalEsc(e.name)}`);
    lines.push(`LOCATION:${icalEsc(`${e.venue}, ${e.address}`)}`);
    const desc = [
      e.description,
      `Cost: ${e.cost || 'see listing'}`,
      `Organizer: ${e.organizer || ''}`,
      `Directions: ${e.directions || ''}`,
      e.url || '',
    ].filter(Boolean).join('\\n');
    lines.push(`DESCRIPTION:${icalEsc(desc)}`);
    lines.push(`CATEGORIES:${icalEsc(e.category)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return foldICal(lines.join('\r\n'));
}

function addHours(timeStr, h) {
  const [hh, mi] = timeStr.split(':').map(Number);
  return `${pad2((hh + h) % 24)}:${pad2(mi)}`;
}

function rfc2822Atlantic(dateStr, timeStr) {
  if (!dateStr) return new Date().toUTCString();
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mi] = (timeStr || '12:00').split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mi, 0));
  return `${DAYS3[dt.getUTCDay()]}, ${pad2(dt.getUTCDate())} ${MONTHS3[dt.getUTCMonth()]} ${dt.getUTCFullYear()} ${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}:00 -0300`;
}

function toRSS(events, meta) {
  const items = events.map((e) => {
    const title = `${e.date || 'TBA'} — ${e.name}`;
    const link = e.url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.venue}, ${e.address}`)}`;
    const dateLine = e.date
      ? `${e.date}${e.time ? ` at ${e.time}` : ''}${e.dateEnd && e.dateEnd !== e.date ? ` to ${e.dateEnd}` : ''}`
      : 'Recurring — date TBA (check organizer)';
    const desc = `<b>${escXml(e.name)}</b><br/>` +
      `Date: ${escXml(dateLine)}<br/>` +
      `Location: ${escXml(e.venue)} — ${escXml(e.address)}<br/>` +
      `Cost: ${escXml(e.cost || 'see listing')}<br/>` +
      `Organizer: ${escXml(e.organizer || '—')}<br/>` +
      `${escXml(e.description || '')}<br/>` +
      `<a href="${escXml(e.url || link)}">Register / more info</a>`;
    return (
      '    <item>\n' +
      `      <title>${escXml(title)}</title>\n` +
      `      <link>${escXml(link)}</link>\n` +
      `      <guid isPermaLink="false">${escXml(e.id)}@techevent.fredericton</guid>\n` +
      `      <pubDate>${rfc2822Atlantic(e.date || meta.lastUpdated, e.time)}</pubDate>\n` +
      `      <category>${escXml(e.category)}</category>\n` +
      `      <description><![CDATA[${desc}]]></description>\n` +
      '    </item>'
    );
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0">\n' +
    '  <channel>\n' +
    `    <title>TECHEVENT - Tech Events in Fredericton, NB</title>\n` +
    `    <link>http://localhost:${PORT}/</link>\n` +
    `    <description>Tech events in Fredericton, New Brunswick — dates, locations and directions. Curated ${meta.lastUpdated}.</description>\n` +
    `    <language>en-ca</language>\n` +
    `    <lastBuildDate>${rfc2822Atlantic(meta.lastUpdated, '12:00')}</lastBuildDate>\n` +
    items.join('\n') + '\n' +
    '  </channel>\n' +
    '</rss>\n'
  );
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = parsed;
  const query = Object.fromEntries(parsed.searchParams.entries());

    // API
    if (pathname.startsWith('/api/')) {
      const events = loadEvents();
      const parts = pathname.split('/').filter(Boolean); // e.g. ['api','events','id']

      if (pathname === '/api/events.ics') {
        try {
          const body = toICal(events);
          res.writeHead(200, {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'attachment; filename="techevent-fredericton.ics"',
          });
          return res.end(body);
        } catch (err) {
          log('ERROR building .ics:', err.message);
          return sendJSON(res, 500, { error: 'ics_generation_failed', detail: err.message });
        }
      }

      if (pathname === '/api/events.rss') {
        try {
          const body = toRSS(events, buildMeta(events));
          res.writeHead(200, {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
          });
          return res.end(body);
        } catch (err) {
          log('ERROR building .rss:', err.message);
          return sendJSON(res, 500, { error: 'rss_generation_failed', detail: err.message });
        }
      }

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
