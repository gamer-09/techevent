/* TECHEVENT frontend — fetches /api/events, renders the grid of doom */

const state = {
  events: [],
  category: '',
  month: '',
  q: '',
  upcomingOnly: true,
  includeTba: false,
};

const $ = (sel) => document.querySelector(sel);

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/* ---------- helpers ---------- */

function mapsDirections(event) {
  const dest = encodeURIComponent(`${event.venue}, ${event.address}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

function mapsPlace(event) {
  const q = encodeURIComponent(`${event.venue}, ${event.address}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  return { day: String(d.getDate()).padStart(2, '0'), month: MONTHS[d.getMonth()], iso: dateStr };
}

function fmtTime(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function countdownTo(dateStr) {
  const target = new Date(dateStr + 'T00:00:00').getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) return 'NOW / PAST';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 60) return `${days}D`;
  return `${days}D ${String(hours).padStart(2, '0')}H ${String(mins).padStart(2, '0')}M`;
}

/* ---------- rose window svg ---------- */

const ROSE_SVG = `
<svg class="rose" viewBox="0 0 48 48" aria-hidden="true">
  <circle class="spoke" cx="24" cy="24" r="22"/>
  <circle class="spoke" cx="24" cy="24" r="14"/>
  <circle class="petal" cx="24" cy="3.5" r="3.2"/>
  <circle class="petal" cx="24" cy="44.5" r="3.2"/>
  <circle class="petal" cx="3.5" cy="24" r="3.2"/>
  <circle class="petal" cx="44.5" cy="24" r="3.2"/>
  <circle class="petal" cx="9.5" cy="9.5" r="3.2"/>
  <circle class="petal" cx="38.5" cy="9.5" r="3.2"/>
  <circle class="petal" cx="9.5" cy="38.5" r="3.2"/>
  <circle class="petal" cx="38.5" cy="38.5" r="3.2"/>
  <circle class="center" cx="24" cy="24" r="6"/>
  <circle class="core" cx="24" cy="24" r="1.8"/>
</svg>`;

/* ---------- rendering ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function cardHTML(e) {
  const d = fmtDate(e.date);
  const t = fmtTime(e.time);
  const tEnd = fmtTime(e.timeEnd);
  const recurring = e.date === null || e.tags?.includes('recurring');
  const tags = (e.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const costTag = `<span class="tag cost">${esc(e.cost || 'see listing')}</span>`;

  const dateBlock = d
    ? `<div class="date-block">
         <div class="d-day">${d.day}</div>
         <div class="d-mon">${d.month}</div>
         <div class="d-sub">${e.dateEnd && e.dateEnd !== e.date ? 'MULTI-DAY' : ''}</div>
       </div>`
    : `<div class="date-block">
         <div class="d-tba">TBA</div>
         <div class="d-sub">NEXT DATE PENDING</div>
       </div>`;

  const countdown = d
    ? `<div class="countdown"><span class="tminus">T-MINUS</span><span class="clock" data-cd="${e.date}">${countdownTo(e.date)}</span></div>`
    : `<div class="countdown"><span class="tminus">STATUS</span><span class="clock" style="color:var(--gold)">RECURRING</span></div>`;

  const timeStr = t ? `<div class="meta">⏱ ${t}${tEnd ? ' – ' + tEnd : ''}</div>` : '';

  return `
  <article class="card" data-id="${esc(e.id)}">
    <div class="card-head">
      ${ROSE_SVG}
      ${dateBlock}
      ${countdown}
    </div>
    <div class="card-body">
      <h3 class="card-title">${esc(e.name)}</h3>
      <div class="meta">
        <span class="venue">${esc(e.venue)}</span>
        <span class="addr">${esc(e.address)}</span>
      </div>
      ${timeStr}
      <p class="desc">${esc(e.description || '')}</p>
      <div class="tag-row">${tags}${costTag}</div>
    </div>
    <div class="card-actions">
      <button class="btn" data-act="details">DETAILS</button>
      <a class="btn btn-acid" href="${mapsDirections(e)}" target="_blank" rel="noopener">⟶ DIRECTIONS</a>
    </div>
  </article>`;
}

function render() {
  const grid = $('#grid');
  const empty = $('#empty');
  let list = state.events.slice();

  if (state.upcomingOnly) {
    const today = new Date().toISOString().slice(0, 10);
    list = list.filter((e) => e.date && e.date >= today);
  }
  if (!state.includeTba) {
    list = list.filter((e) => e.date !== null);
  }
  if (state.category) list = list.filter((e) => e.category === state.category);
  if (state.month) list = list.filter((e) => e.date && e.date.startsWith(state.month));
  if (state.q) {
    const q = state.q.toLowerCase();
    list = list.filter((e) => [e.name, e.venue, e.address, e.organizer, ...(e.tags || [])].join(' ').toLowerCase().includes(q));
  }

  const dated = list.filter((e) => e.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const undated = list.filter((e) => !e.date).sort((a, b) => a.name.localeCompare(b.name));

  grid.innerHTML = dated.concat(undated).map(cardHTML).join('');

  const cat = state.category ? ` <span class="r-cat">[${state.category.toUpperCase()}]</span>` : '';
  $('#readout').innerHTML = `▮ SIGNALS LOCKED: <b>${dated.length + undated.length}</b>${cat} ${state.q ? `— searching “<span class="r-cat">${esc(state.q)}</span>”` : ''}`;

  empty.classList.toggle('hidden', dated.length + undated.length > 0);
}

/* ---------- filters ---------- */

function buildFilters(meta) {
  const chips = $('#chips');
  chips.innerHTML = '<button class="chip is-active" data-cat="" type="button">ALL</button>' +
    meta.categories.map((c) => `<button class="chip" data-cat="${esc(c)}" type="button">${esc(c)}</button>`).join('');

  chips.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.chip');
    if (!btn) return;
    state.category = btn.dataset.cat;
    chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c === btn));
    render();
  });

  const sel = $('#month-filter');
  sel.innerHTML = '<option value="">ALL MONTHS</option>' +
    meta.months.map((m) => {
      const [y, mo] = m.split('-');
      return `<option value="${m}">${MONTHS[Number(mo) - 1]} ${y}</option>`;
    }).join('');
  sel.addEventListener('change', () => { state.month = sel.value; render(); });

  $('#toggle-upcoming').addEventListener('click', (ev) => {
    state.upcomingOnly = !state.upcomingOnly;
    ev.target.classList.toggle('is-on', state.upcomingOnly);
    render();
  });

  $('#toggle-tba').addEventListener('click', (ev) => {
    state.includeTba = !state.includeTba;
    ev.target.classList.toggle('is-on', state.includeTba);
    render();
  });
}

/* ---------- ticker ---------- */

function renderTicker() {
  const upcoming = state.events
    .filter((e) => e.date && e.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const inner = upcoming.slice(0, 12).map((e) => {
    const d = fmtDate(e.date);
    return `<span>${d ? `<span class="t-date">${d.month} ${d.day}</span>` : 'TBA'} <b>${esc(e.name)}</b> <span class="t-cat">// ${esc(e.category)}</span></span>`;
  }).join('');
  $('#ticker').innerHTML = `<div class="ticker-inner">${inner}${inner}</div>`;
}

/* ---------- modal ---------- */

function openModal(e) {
  $('#modal-title').textContent = e.name;
  const d = fmtDate(e.date);
  const t = fmtTime(e.time);
  const tEnd = fmtTime(e.timeEnd);

  const dateRow = d
    ? `<b>DATE</b><span>${d.month} ${d.day}, ${d.iso.slice(0, 4)}${e.dateEnd && e.dateEnd !== e.date ? ' – ' + fmtDate(e.dateEnd).month + ' ' + fmtDate(e.dateEnd).day : ''}${t ? ' · ' + t + (tEnd ? ' – ' + tEnd : '') : ''}</span>`
    : `<b>DATE</b><span>Recurring — next date TBA, check the organizer's site</span>`;

  $('#modal-body').innerHTML = `
    <div class="row">${dateRow}</div>
    <div class="row"><b>LOCATION</b><span>${esc(e.venue)} — ${esc(e.address)}</span></div>
    <div class="row"><b>ORGANIZER</b><span>${esc(e.organizer || '—')}</span></div>
    <div class="row"><b>COST</b><span>${esc(e.cost || 'see listing')}</span></div>
    <div class="row"><b>WHAT IT IS</b><span>${esc(e.description || '—')}</span></div>
    <div class="row"><b>GETTING THERE</b><span>${esc(e.directions || 'Open the map for directions.')}</span></div>
    <div class="row"><b>SOURCE</b><span class="mono">${esc(e.url || '—')}</span></div>`;

  const reg = $('#modal-register');
  if (e.url) { reg.href = e.url; reg.classList.remove('hidden'); } else reg.classList.add('hidden');
  $('#modal-directions').href = mapsDirections(e);

  $('#modal-backdrop').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('#modal-backdrop').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ---------- boot sequence ---------- */

function boot() {
  const lines = document.querySelectorAll('.boot-line');
  lines.forEach((line, i) => line.style.animationDelay = `${i * 0.22}s`);
  const n = $('#boot-n');
  fetch('/api/health').then((r) => r.json()).then((h) => { n.textContent = h.eventsLoaded; }).catch(() => { n.textContent = '?'; });
}

/* ---------- init ---------- */

async function init() {
  boot();

  try {
    const [evRes, metaRes] = await Promise.all([fetch('/api/events'), fetch('/api/meta')]);
    const evData = await evRes.json();
    const meta = await metaRes.json();
    state.events = evData.events;
    buildFilters(meta);
    renderTicker();
    render();
  } catch (err) {
    $('#grid').innerHTML = `<p class="dim">SIGNAL LOST — could not reach /api/events. is the server running?</p>`;
  }

  // search input (debounced)
  let t;
  $('#search').addEventListener('input', (ev) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = ev.target.value.trim(); render(); }, 160);
  });

  // delegation: details buttons
  $('#grid').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act="details"]');
    if (!btn) return;
    const card = btn.closest('.card');
    const evt = state.events.find((e) => e.id === card.dataset.id);
    if (evt) openModal(evt);
  });

  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-backdrop').addEventListener('click', (ev) => { if (ev.target.id === 'modal-backdrop') closeModal(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeModal(); });

  // live countdowns
  setInterval(() => {
    document.querySelectorAll('.clock[data-cd]').forEach((el) => {
      el.textContent = countdownTo(el.dataset.cd);
    });
  }, 30000);
}

document.addEventListener('DOMContentLoaded', init);
