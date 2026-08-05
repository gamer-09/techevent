/* TECHEVENT frontend — clean futuristic signal board */

const state = {
  events: [],
  meta: null,
  category: '',
  month: '',
  q: '',
  upcomingOnly: true,
  includeTba: false,
};

const $ = (sel) => document.querySelector(sel);
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const PREFERS_REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- helpers ---------------- */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function mapsDirections(e) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${e.venue}, ${e.address}`)}`;
}

function fmtDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return { day: String(d).padStart(2, '0'), month: MONTHS[m - 1], year: y, iso: s };
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
  const diff = target - Date.now();
  if (diff <= 0) return null; // ended
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 60) return `${days}D`;
  return `${days}D ${String(hours).padStart(2, '0')}H`;
}

function isUpcoming(e) {
  return e.date && e.date >= new Date().toISOString().slice(0, 10);
}

/* ---------------- card rendering ---------------- */

function costClass(cost) {
  const c = String(cost || '').toLowerCase();
  if (c.includes('free')) return 'cost-free';
  if (c.includes('paid') || c.includes('$') || c.includes('usd') || c.includes('cad')) return 'cost-paid';
  return '';
}

/* registration badge — "must register" vs "just show up" */
function regBadge(e) {
  const r = String(e.registration || '').toLowerCase();
  if (r === 'required') return '<span class="tag reg-required">◈ REGISTRATION REQUIRED</span>';
  if (r === 'recommended') return '<span class="tag reg-recommended">◈ REGISTER RECOMMENDED</span>';
  return '<span class="tag reg-dropin">✓ JUST SHOW UP — NO REGISTRATION</span>';
}

function regLabel(e) {
  const r = String(e.registration || '').toLowerCase();
  if (r === 'required') return 'REGISTRATION REQUIRED';
  if (r === 'recommended') return 'REGISTRATION RECOMMENDED';
  return 'NO REGISTRATION — JUST SHOW UP';
}

function cardHTML(e, i) {
  const d = fmtDate(e.date);
  const t = fmtTime(e.time);
  const tEnd = fmtTime(e.timeEnd);
  const recurring = e.date === null;
  const upcoming = isUpcoming(e);
  const multi = e.dateEnd && e.dateEnd !== e.date;

  const dateBlock = d
    ? `<div class="date-block">
         <div class="d-day">${esc(d.day)}${multi ? '–' + esc(fmtDate(e.dateEnd).day) : ''}</div>
         <div class="d-mon">${esc(d.month)} ${esc(d.year)}</div>
         <div class="d-sub">${multi ? 'MULTI-DAY' : d.day === '01' ? '' : ''}</div>
       </div>`
    : `<div class="date-block"><div class="d-tba">TBA</div><div class="d-sub">NEXT DATE</div></div>`;

  const clock = recurring
    ? '<div class="countdown"><span class="tminus">STATUS</span><span class="clock recurring">RECURRING</span></div>'
    : upcoming
      ? `<div class="countdown"><span class="tminus">T-MINUS</span><span class="clock" data-cd="${esc(e.date)}">${countdownTo(e.date)}</span></div>`
      : '<div class="countdown"><span class="tminus">STATUS</span><span class="clock ended">ENDED</span></div>';

  const tags = (e.tags || []).map((tg) => `<span class="tag">${esc(tg)}</span>`).join('');
  const costTag = `<span class="tag ${costClass(e.cost)}">${esc(e.cost || 'SEE LISTING')}</span>`;
  const recTag = recurring ? '<span class="tag rec">RECURRING</span>' : '';
  const regNote = e.registrationNote ? `<p class="reg-note">${esc(e.registrationNote)}</p>` : '';

  return `
  <article class="card" data-id="${esc(e.id)}" style="animation-delay:${Math.min(i * 50, 500)}ms">
    <div class="card-head">
      ${dateBlock}
      ${clock}
    </div>
    <div class="card-body">
      <h3 class="card-title">${esc(e.name)}</h3>
      <div class="meta">
        <span class="venue">${esc(e.venue)}</span>
        <span class="addr">${esc(e.address)}</span>
      </div>
      ${e.organizer ? `<div class="meta mono">BY ${esc(e.organizer)}</div>` : ''}
      ${t ? `<div class="meta mono">${t}${tEnd ? ' – ' + tEnd : ''}</div>` : ''}
      <p class="desc">${esc(e.description || '')}</p>
      ${regNote}
      <div class="tag-row">${regBadge(e)}${recTag}${costTag}</div>
    </div>
    <div class="card-actions">
      <button class="btn" data-act="details" type="button">DETAILS</button>
      <a class="btn btn-primary" href="${mapsDirections(e)}" target="_blank" rel="noopener">⟶ DIRECTIONS</a>
    </div>
  </article>`;
}

/* ---------------- filtering + render ---------------- */

function filtered(opts = {}) {
  let list = state.events.slice();

  if (!opts.all) {
    if (state.upcomingOnly) list = list.filter((e) => !e.date || isUpcoming(e));
    if (!state.includeTba) list = list.filter((e) => e.date !== null);
  }
  if (!opts.skipCategory && state.category) list = list.filter((e) => e.category === state.category);
  if (state.month) list = list.filter((e) => e.date && e.date.startsWith(state.month));
  if (state.q) {
    const q = state.q.toLowerCase();
    list = list.filter((e) =>
      [e.name, e.venue, e.address, e.organizer, ...(e.tags || [])].join(' ').toLowerCase().includes(q));
  }
  return list;
}

/* how many events each chip would show, given the CURRENT toggle/search state */
function chipCounts() {
  const counts = {};
  for (const e of filtered({ skipCategory: true })) {
    counts[e.category] = (counts[e.category] || 0) + 1;
  }
  return counts;
}

function updateChipCounts() {
  const counts = chipCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  document.querySelectorAll('#chips .chip').forEach((chip) => {
    const span = chip.querySelector('.chip-cnt');
    if (span) span.textContent = chip.dataset.cat ? (counts[chip.dataset.cat] || 0) : total;
  });
}

function render() {
  try {
    const list = filtered();
    const dated = list.filter((e) => e.date).sort((a, b) => (a.date < b.date ? -1 : 1));
    const undated = list.filter((e) => !e.date).sort((a, b) => a.name.localeCompare(b.name));
    const all = dated.concat(undated);

    $('#grid').innerHTML = all.map((e, i) => cardHTML(e, i)).join('');
    $('#empty').classList.toggle('hidden', all.length > 0);

    if (all.length === 0) {
      // is the only thing hiding results the TBA toggle?
      const wouldHave = filtered({ all: true });
      const tbaHidden = !state.includeTba && wouldHave.some((e) => e.date === null);
      $('#show-tba').classList.toggle('hidden', !tbaHidden);

      const bits = [];
      if (state.q) bits.push(`search “${state.q}”`);
      if (state.category) bits.push(`category ${state.category}`);
      if (state.month) bits.push(`month ${state.month}`);
      const scope = bits.length ? bits.join(' + ') : 'current filters';

      $('#empty-detail').textContent = tbaHidden
        ? `${scope} matches only recurring/TBA events. flip +TBA to see them.`
        : `zero events match ${scope}. try widening the filters.`;
    } else {
      $('#show-tba').classList.add('hidden');
    }

    const cat = state.category ? ` · <span class="mono">${esc(state.category.toUpperCase())}</span>` : '';
    const q = state.q ? ` · search “${esc(state.q)}”` : '';
    $('#readout').innerHTML = `SIGNALS <b>${all.length}</b> / ${state.events.length} TRACKED${cat}${q}`;

    updateChipCounts();
  } catch (err) {
    $('#grid').innerHTML = `<p style="color:var(--danger)">render error: ${esc(err.message)}</p>`;
    console.error('TECHEVENT render error:', err);
  }
}

/* ---------------- filters UI ---------------- */

function buildFilters(meta) {
  const chips = $('#chips');
  chips.innerHTML = '<button class="chip is-active" data-cat="" type="button">ALL <span class="chip-cnt">0</span></button>' +
    meta.categories
      .map((c) => `<button class="chip" data-cat="${esc(c)}" type="button">${esc(c)} <span class="chip-cnt">0</span></button>`)
      .join('');
  updateChipCounts();

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
    ev.currentTarget.classList.toggle('is-on', state.upcomingOnly);
    render();
  });

  $('#toggle-tba').addEventListener('click', (ev) => {
    state.includeTba = !state.includeTba;
    ev.currentTarget.classList.toggle('is-on', state.includeTba);
    render();
  });

  let debounce;
  $('#search').addEventListener('input', (ev) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = ev.target.value.trim(); render(); }, 160);
  });

  $('#reset-filters').addEventListener('click', () => {
    state.category = ''; state.month = ''; state.q = '';
    state.upcomingOnly = true; state.includeTba = false;
    $('#search').value = '';
    $('#month-filter').value = '';
    $('#toggle-upcoming').classList.add('is-on');
    $('#toggle-tba').classList.remove('is-on');
    chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c.dataset.cat === ''));
    render();
  });

  $('#show-tba').addEventListener('click', () => {
    state.includeTba = true;
    $('#toggle-tba').classList.add('is-on');
    render();
  });
}

/* ---------------- ticker ---------------- */

function renderTicker() {
  const next = state.events
    .filter((e) => e.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 14);
  const inner = next.map((e) => {
    const d = fmtDate(e.date);
    return `<span><span class="t-date">${d.month} ${d.day}</span> <b>${esc(e.name)}</b> <span class="t-cat mono">${esc(e.category)}</span></span>`;
  }).join('');
  $('#ticker').innerHTML = inner + inner; // seamless loop
}

/* ---------------- stats + status ---------------- */

function renderStats(meta) {
  const upcoming = state.events.filter((e) => isUpcoming(e)).length;
  $('#stats').innerHTML = `
    <span class="stat">EVENTS <b>${meta.eventCount}</b></span>
    <span class="stat">UPCOMING <b>${upcoming}</b></span>
    <span class="stat">CATEGORIES <b>${meta.categories.length}</b></span>
    <span class="stat">UPDATED <b>${(meta.lastUpdated || '').slice(0, 10)}</b></span>`;
}

function setStatus(text, mode) {
  const pill = $('#status');
  pill.classList.remove('online', 'offline');
  if (mode) pill.classList.add(mode);
  pill.querySelector('.status-text').textContent = text;
}

function renderSources() {
  const sources = state.meta && state.meta.sources ? state.meta.sources : [];
  $('#sources').innerHTML = sources
    .map((s) => `<li><a href="${esc(s)}" target="_blank" rel="noopener">+ ${esc(s.replace(/^https?:\/\/(www\.)?/, ''))}</a></li>`)
    .join('') || '<li class="dim">no sources recorded</li>';
}

/* ---------------- modal ---------------- */

function openModal(e) {
  const d = fmtDate(e.date);
  const t = fmtTime(e.time);
  const tEnd = fmtTime(e.timeEnd);
  const multi = e.dateEnd && e.dateEnd !== e.date;

  $('#modal-title').textContent = e.name;
  $('#modal-body').innerHTML = `
    <div class="row"><b>DATE</b><span>${d ? `${d.month} ${d.day}, ${d.year}${multi ? ' – ' + fmtDate(e.dateEnd).month + ' ' + fmtDate(e.dateEnd).day : ''}${t ? ' · ' + t + (tEnd ? ' – ' + tEnd : '') : ''}` : 'Recurring — next date TBA, check the organizer site'}</span></div>
    <div class="row"><b>LOCATION</b><span>${esc(e.venue)} — ${esc(e.address)}</span></div>
    <div class="row"><b>ORGANIZER</b><span>${esc(e.organizer || '—')}</span></div>
    <div class="row"><b>COST</b><span>${esc(e.cost || 'see listing')}</span></div>
    <div class="row"><b>REGISTRATION</b><span>${regLabel(e)}${e.registrationNote ? ` — ${esc(e.registrationNote)}` : ''}${e.url ? ` <a class="modal-link" href="${esc(e.url)}" target="_blank" rel="noopener">(register/source)</a>` : ''}</span></div>
    <div class="row"><b>WHAT IT IS</b><span>${esc(e.description || '—')}</span></div>
    <div class="row"><b>GETTING THERE</b><span>${esc(e.directions || 'Open the map for directions.')}</span></div>
    <div class="row"><b>SOURCE</b><span class="mono" style="word-break:break-all">${esc(e.url || '—')}</span></div>`;

  const reg = $('#modal-register');
  if (e.url) { reg.href = e.url; reg.classList.remove('hidden'); } else reg.classList.add('hidden');
  $('#modal-directions').href = mapsDirections(e);

  $('#modal-backdrop').classList.remove('hidden', 'closing');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const bd = $('#modal-backdrop');
  if (bd.classList.contains('closing')) return;
  bd.classList.add('closing');
  setTimeout(() => {
    bd.classList.add('hidden');
    bd.classList.remove('closing');
    document.body.style.overflow = '';
  }, 300);
}

/* ---------------- scroll parallax ---------------- */

function initParallax() {
  if (PREFERS_REDUCED) return;
  const els = Array.from(document.querySelectorAll('[data-plx-x], [data-plx-y]'));
  if (!els.length) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const sc = window.scrollY;
      for (const el of els) {
        const x = parseFloat(el.dataset.plxX || 0);
        const y = parseFloat(el.dataset.plxY || 0);
        el.style.transform = `translate3d(${(-sc * x).toFixed(1)}px, ${(-sc * y).toFixed(1)}px, 0)`;
      }
      ticking = false;
    });
  }, { passive: true });
}

/* ---------------- scroll reveal ---------------- */

function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (PREFERS_REDUCED || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('reveal-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        en.target.classList.add('reveal-in');
        io.unobserve(en.target);
      }
    }
  }, { threshold: 0.1 });
  els.forEach((el) => io.observe(el));
}

/* ---------------- countdown refresh ---------------- */

setInterval(() => {
  document.querySelectorAll('.clock[data-cd]').forEach((el) => {
    const c = countdownTo(el.dataset.cd);
    el.textContent = c === null ? 'ENDED' : c;
    if (c === null) el.classList.add('ended');
  });
}, 60000);

/* ---------------- init ---------------- */

async function init() {
  try {
    const [evRes, metaRes] = await Promise.all([fetch('/api/events'), fetch('/api/meta')]);
    if (!evRes.ok || !metaRes.ok) throw new Error(`API status ${evRes.status}/${metaRes.status}`);
    const evData = await evRes.json();
    const meta = await metaRes.json();

    state.events = evData.events || [];
    state.meta = meta;

    buildFilters(meta);
    renderStats(meta);
    renderSources();
    renderTicker();
    render();

    setStatus(`ONLINE · ${meta.eventCount} EVENTS`, 'online');
  } catch (err) {
    console.error('TECHEVENT init error:', err);
    setStatus('OFFLINE', 'offline');
    $('#grid').innerHTML = `<p style="color:var(--danger);max-width:560px;margin:40px auto;text-align:center">SIGNAL LOST — could not reach the API.<br>Is the server running? (<span class="mono">node server.js</span>)<br><span style="color:var(--muted)">${esc(err.message)}</span></p>`;
  }

  // grid delegation
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

initParallax();
initReveal();
