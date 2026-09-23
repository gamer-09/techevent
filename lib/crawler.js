/**
 * TECHEVENT live crawler — zero-dependency event fetcher.
 * -------------------------------------------------------
 * Pulls current events from real Fredericton event sources and normalizes
 * them into the app's event schema (same shape as data/events.json).
 *
 * Sources
 *   1. allevents.in/fredericton/technology  — schema.org JSON-LD <Event> blocks
 *   2. myignite.ca/events (Squarespace)     — eventlist-* HTML markup
 *
 * Fetched events are cached in data/live-events.json so restarts serve
 * instantly and re-fetch only on schedule. Nothing in data/events.json is
 * ever modified — manual entries always win on dedupe.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIVE_CACHE_FILE = path.join(ROOT, 'data', 'live-events.json');
const REFRESH_MS = 6 * 60 * 60 * 1000; // re-fetch every 6 hours

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-CA,en;q=0.9',
};

/* ---------------- module state ---------------- */

const liveCache = {
  fetchedAt: null,   // ISO timestamp of last successful fetch
  events: [],        // normalized live events
  lastError: null,   // last fetch error message (null when healthy)
};

/* ---------------- small helpers ---------------- */

async function fetchWithRetry(url, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, { headers: UA, redirect: 'follow', signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (i < tries) await new Promise((r) => setTimeout(r, 1200 * i));
    }
  }
  throw lastErr;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function inferCategory(text) {
  const t = String(text || '').toLowerCase();
  if (/hackathon|code|coding|developer|devfest|build/.test(t)) return 'hackathon';
  if (/cyber|security|privacy/.test(t)) return 'cybersecurity';
  if (/ai|artificial intelligence|machine learning|data science/.test(t)) return 'ai';
  if (/startup|pitch|entrepreneur|founder|venture/.test(t)) return 'startup';
  if (/workshop|training|bootcamp|certification|course/.test(t)) return 'training';
  if (/unb|nbcc|university|college|student|campus/.test(t)) return 'university';
  if (/maker|3d print|robot|stem/.test(t)) return 'maker';
  if (/networking|community|meetup|social/.test(t)) return 'community';
  return 'tech';
}

/* ---------------- normalizers ---------------- */

function pickVenue(loc) {
  if (!loc) return 'TBA — see listing';
  return String(loc.name || loc.streetAddress || loc.address || 'TBA — see listing');
}

function fromAllevents(sc) {
  if (!sc.name || !sc.startDate) return null;
  const end = sc.endDate || sc.startDate;

  const m = String(sc.url || '').match(/(\d{6,})\/?$/);
  const locAddr = sc.location && sc.location.address;
  const addr = locAddr
    ? [locAddr.streetAddress, locAddr.addressLocality, locAddr.addressRegion].filter(Boolean).join(', ')
    : 'Fredericton, NB (see listing)';
  const text = `${sc.name} ${stripTags(sc.description || '')}`;

  return {
    id: `ae-${m ? m[1] : Date.now()}`,
    name: String(sc.name).trim(),
    date: sc.startDate.slice(0, 10),
    time: sc.startDate.length > 10 ? sc.startDate.slice(11, 16) : null,
    dateEnd: end.slice(0, 10),
    timeEnd: sc.endDate && sc.endDate.length > 10 ? sc.endDate.slice(11, 16) : null,
    category: inferCategory(text),
    tags: ['live', 'allevents'],
    cost: (sc.isAccessibleForFree === true) ? 'FREE'
      : (sc.offers && sc.offers[0] && sc.offers[0].price != null) ? `$${sc.offers[0].price}`
      : 'see listing',
    venue: pickVenue(sc.location),
    address: addr,
    organizer: Array.isArray(sc.organizer) ? stripTags(sc.organizer[0] && sc.organizer[0].name)
      : sc.organizer ? stripTags(sc.organizer.name || sc.organizer) : 'see listing',
    url: sc.url,
    description: stripTags(sc.description || '').slice(0, 600) || 'Live-fetched from allevents.in — open the listing for details.',
    directions: '',
    registration: 'see-listing',
    registrationNote: 'Fetched live from the public listing — confirm details with the organizer.',
    registrationCost: sc.isAccessibleForFree === true ? 'free' : 'see-listing',
    goodFor: [],
  };
}

function fromMyignite(html) {
  const out = [];
  // each upcoming event owns one eventlist-title anchor; split blocks on it
  const blocks = html.split(/<h1 class="eventlist-title"/g).slice(1);

  for (const b of blocks) {
    const hrefM = b.match(/href="([^"]+)"/);
    const dateM = b.match(/<time class="event-date" datetime="(\d{4}-\d{2}-\d{2})"/);
    if (!hrefM || !dateM) continue;

    const startM = b.match(/event-time-localized-start" datetime="[^"]*">([^<]+)</);
    const endM = b.match(/event-time-localized-end" datetime="[^"]*">([^<]+)</);
    const addrM = b.match(/eventlist-meta-address event-meta-item">\s*([^<]+)</);
    const exM = b.match(/eventlist-excerpt">([\s\S]*?)<\/div>/);
    const mapM = b.match(/maps\.google\.com\?q=([^"]+)"/);

    const to24 = (t) => {
      if (!t) return null;
      const m = String(t).trim().match(/^(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.)?/i);
      if (!m) return null;
      let h = Number(m[1]);
      if (m[3] && /p/i.test(m[3]) && h < 12) h += 12;
      if (m[3] && /a/i.test(m[3]) && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${m[2]}`;
    };

    const slug = hrefM[1].replace(/^\/events\//, '').replace(/\/$/, '');
    const addr = addrM ? decodeEntities(addrM[1]).trim() + ', Fredericton, NB' : 'Fredericton, NB (see map link)';
    const mapQ = mapM ? decodeEntities(mapM[1]) : null;
    const desc = stripTags(exM ? exM[1] : '').slice(0, 600);
    const title = stripTags(b.slice(0, 400).match(/eventlist-title-link">([^<]+)</)?.[1] || slug);

    out.push({
      id: `ig-${slug}`,
      name: title,
      date: dateM[1],
      time: to24(startM && startM[1]),
      dateEnd: null,
      timeEnd: to24(endM && endM[1]),
      category: inferCategory(`${title} ${desc}`),
      tags: ['live', 'ignite'],
      cost: 'see listing',
      venue: addrM ? decodeEntities(addrM[1]).trim() : 'see listing',
      address: mapQ || addr,
      organizer: 'Ignite Fredericton / Planet Hatch',
      url: `https://myignite.ca${hrefM[1]}`,
      description: desc || 'Live-fetched from the Ignite Fredericton events calendar.',
      directions: '',
      registration: 'see-listing',
      registrationNote: 'Fetched live from the organizer calendar — confirm details on the event page.',
      registrationCost: 'see-listing',
      goodFor: [],
    });
  }
  return out;
}

/* ---------------- source orchestration ---------------- */

async function fetchEvents() {
  const jobs = [
    fetchWithRetry('https://allevents.in/fredericton/technology').then(fromAlleventsJsonLd),
    fetchWithRetry('https://myignite.ca/events').then(fromMyignite),
  ];
  const settled = await Promise.allSettled(jobs);

  const events = [];
  const errors = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') events.push(...s.value.filter(Boolean));
    else errors.push(String(s.reason && s.reason.message || s.reason));
  }

  if (!events.length && errors.length) throw new Error(errors.join(' | '));

  // dedupe within fetched set (same event listed on both sources)
  const seen = new Set();
  const merged = events.filter((e) => {
    const k = e.name.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  liveCache.fetchedAt = new Date().toISOString();
  liveCache.events = merged;
  liveCache.lastError = errors.length ? errors.join(' | ') : null;

  // persist cache (best-effort)
  try {
    fs.writeFileSync(LIVE_CACHE_FILE, JSON.stringify({
      fetchedAt: liveCache.fetchedAt,
      lastError: liveCache.lastError,
      events: merged,
    }, null, 2));
  } catch (err) {
    console.error('[crawler] cache write failed:', err.message);
  }

  console.log(`[crawler] live fetch ok — ${merged.length} events from ${settled.filter(s => s.status === 'fulfilled').length}/2 sources` +
    (liveCache.lastError ? ` (errors: ${liveCache.lastError})` : ''));
  return merged;
}

function fromAlleventsJsonLd(html) {
  const out = [];
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const blk of blocks) {
    try {
      const j = JSON.parse(blk[1].trim());
      const nodes = Array.isArray(j) ? j : (j['@graph'] || [j]);
      for (const n of nodes) {
        if (String(n['@type'] || '').includes('Event')) {
          const e = fromAllevents(n);
          if (e) out.push(e);
        }
      }
    } catch { /* malformed block — skip */ }
  }
  return out;
}

/* ---------------- merge with manual data ---------------- */

/**
 * Manual events always win. A fetched event is skipped when:
 *  - its id is already present, or
 *  - an event with the same normalized name exists (case-insensitive,
 *    same calendar month) — covers id drift between fetches.
 */
function mergeEvents(manual, fetched) {
  const manualKeys = new Set(manual.map((e) => e.id));
  const nameMonths = new Set(manual.map((e) => `${(e.name || '').toLowerCase().replace(/\s+/g, ' ')}|${(e.date || 'tba').slice(0, 7)}`));
  const added = [];
  let skipped = 0;

  for (const e of fetched || []) {
    const nameKey = `${e.name.toLowerCase().replace(/\s+/g, ' ')}|${(e.date || 'tba').slice(0, 7)}`;
    if (manualKeys.has(e.id) || nameMonths.has(nameKey)) { skipped++; continue; }
    manualKeys.add(e.id);
    nameMonths.add(nameKey);
    added.push(e);
  }
  return { added, skipped };
}

/* ---------------- load persisted cache on boot ---------------- */

function loadCache() {
  try {
    const j = JSON.parse(fs.readFileSync(LIVE_CACHE_FILE, 'utf8'));
    if (Array.isArray(j.events)) {
      liveCache.events = j.events;
      liveCache.fetchedAt = j.fetchedAt || null;
      liveCache.lastError = j.lastError || null;
      console.log(`[crawler] loaded cached live events: ${j.events.length} (fetched ${j.fetchedAt || 'unknown'})`);
    }
  } catch { /* no cache yet — fine */ }
}
loadCache();

module.exports = { fetchEvents, mergeEvents, liveCache, REFRESH_MS };
