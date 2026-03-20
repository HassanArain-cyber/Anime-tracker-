/* ═══════════════════════════════════════════════════════════
   ANIMEVAULT — app.js
   Complete anime tracker with localStorage & Jikan API
═══════════════════════════════════════════════════════════ */

/* ─── STORAGE KEYS ─── */
const KEY_WATCHED   = 'av_watched';
const KEY_WATCHLIST = 'av_watchlist';
const KEY_THEME     = 'av_theme';

/* ─── STATE ─── */
let watchedList   = [];
let watchlistData = [];
let currentRating = 0;
let editRating    = 0;
let selectedAnime = null;
let sugFocusIdx   = -1;
let searchDebounce;
let currentFilter = 'All';
let currentSort   = 'newest';
let editId        = null;
let editStatus    = 'Watching';
let addStatus     = 'Watching';

/* ═══════════════════════════════════════════
   STORAGE
═══════════════════════════════════════════ */
function loadData() {
  try { watchedList   = JSON.parse(localStorage.getItem(KEY_WATCHED)   || '[]'); } catch { watchedList = []; }
  try { watchlistData = JSON.parse(localStorage.getItem(KEY_WATCHLIST) || '[]'); } catch { watchlistData = []; }
}
function saveWatched()   { localStorage.setItem(KEY_WATCHED,   JSON.stringify(watchedList));   }
function saveWatchlist() { localStorage.setItem(KEY_WATCHLIST, JSON.stringify(watchlistData)); }

/* ═══════════════════════════════════════════
   THEME
═══════════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem(KEY_THEME) || 'dark';
  applyTheme(saved);
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : '');
  localStorage.setItem(KEY_THEME, t);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = t === 'light' ? '🌙' : '☀️';
}
function toggleTheme() {
  const cur = localStorage.getItem(KEY_THEME) || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

/* ═══════════════════════════════════════════
   MOBILE NAV
═══════════════════════════════════════════ */
function toggleMobileMenu() {
  const m = document.getElementById('mobileMenu');
  if (m) m.classList.toggle('open');
}

/* ═══════════════════════════════════════════
   PAGE LOADER
═══════════════════════════════════════════ */
function hideLoader() {
  setTimeout(() => {
    const l = document.getElementById('loader');
    if (l) l.classList.add('hide');
  }, 1300);
}

/* ═══════════════════════════════════════════
   JIKAN API (MyAnimeList — free, no key needed)
═══════════════════════════════════════════ */
async function fetchAnimeSuggestions(query) {
  try {
    // Search both by title and English title simultaneously
    const [res1, res2] = await Promise.all([
      fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=8&sfw=true`),
      fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=8&sfw=true&letter=${encodeURIComponent(query[0])}`)
    ]);
    const d1 = res1.ok ? (await res1.json()).data || [] : [];
    // Deduplicate by mal_id
    const seen = new Set(d1.map(a => a.mal_id));
    const d2 = res2.ok ? ((await res2.json()).data || []).filter(a => !seen.has(a.mal_id)) : [];
    const combined = [...d1, ...d2].slice(0, 10);
    // Sort: exact/startsWith matches first, then partial
    const q = query.toLowerCase();
    return combined.sort((a, b) => {
      const ta = (a.title || '').toLowerCase();
      const tb = (b.title || '').toLowerCase();
      const ea = (a.title_english || '').toLowerCase();
      const eb = (b.title_english || '').toLowerCase();
      const scoreA = (ta.startsWith(q) || ea.startsWith(q)) ? 0 : (ta.includes(q) || ea.includes(q)) ? 1 : 2;
      const scoreB = (tb.startsWith(q) || eb.startsWith(q)) ? 0 : (tb.includes(q) || eb.includes(q)) ? 1 : 2;
      return scoreA - scoreB;
    });
  } catch { return []; }
}

/* ═══════════════════════════════════════════
   SEARCH / SUGGESTIONS (shared logic)
═══════════════════════════════════════════ */
function initSearchInput(inputId, sugId, spinId, onSelect) {
  const inp  = document.getElementById(inputId);
  const sugs = document.getElementById(sugId);
  const spin = document.getElementById(spinId);
  if (!inp || !sugs) return;

  inp.addEventListener('input', () => {
    const q = inp.value.trim();
    selectedAnime = null;
    clearTimeout(searchDebounce);
    if (q.length < 2) { closeSugs(sugs); return; }
    if (spin) spin.classList.add('on');
    searchDebounce = setTimeout(async () => {
      const results = await fetchAnimeSuggestions(q);
      if (spin) spin.classList.remove('on');
      renderSugs(sugs, results, inp, onSelect);
    }, 500);
  });

  inp.addEventListener('keydown', (e) => {
    const items = sugs.querySelectorAll('.sug-item');
    if (e.key === 'ArrowDown') { sugFocusIdx = Math.min(sugFocusIdx + 1, items.length - 1); hilite(items); e.preventDefault(); }
    if (e.key === 'ArrowUp')   { sugFocusIdx = Math.max(sugFocusIdx - 1, 0); hilite(items); e.preventDefault(); }
    if (e.key === 'Enter')     { if (sugFocusIdx >= 0 && items[sugFocusIdx]) items[sugFocusIdx].click(); }
    if (e.key === 'Escape')    { closeSugs(sugs); }
  });
}

function renderSugs(box, results, inp, onSelect) {
  sugFocusIdx = -1;
  if (!results.length) {
    box.innerHTML = '<div class="sug-item"><div><div class="sug-title">No results found</div></div></div>';
    box.classList.add('open'); return;
  }
  box.innerHTML = results.map((a, i) => {
    const img   = a.images?.jpg?.image_url || '';
    const yr    = a.year || (a.aired?.from ? new Date(a.aired.from).getFullYear() : '');
    const eps   = a.episodes ? a.episodes + ' eps' : '';
    const score = a.score ? '⭐ ' + a.score : '';
    const genre = (a.genres || []).slice(0, 2).map(g => g.name).join(', ');
    const enTitle = a.title_english && a.title_english !== a.title ? `<div class="sug-meta" style="color:var(--blue);font-weight:700">${a.title_english}</div>` : '';
    return `<div class="sug-item" data-i="${i}">
      <img src="${img}" onerror="this.style.display='none'" loading="lazy"/>
      <div>
        <div class="sug-title">${a.title || '?'}</div>
        ${enTitle}
        <div class="sug-meta">${[yr, eps, genre].filter(Boolean).join(' · ')}</div>
        <div class="sug-score">${score}</div>
      </div>
    </div>`;
  }).join('');
  box.dataset.results = JSON.stringify(results);
  box.classList.add('open');

  box.querySelectorAll('.sug-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      const data = JSON.parse(box.dataset.results || '[]');
      if (data[i]) { selectedAnime = data[i]; inp.value = data[i].title || ''; onSelect && onSelect(data[i]); }
      closeSugs(box);
    });
  });
}

function closeSugs(box) { if (box) box.classList.remove('open'); }
function hilite(items) { items.forEach((el, i) => el.classList.toggle('focused', i === sugFocusIdx)); if (items[sugFocusIdx]) items[sugFocusIdx].scrollIntoView({ block: 'nearest' }); }

document.addEventListener('click', e => {
  document.querySelectorAll('.sug-list').forEach(box => {
    if (!e.target.closest('.anime-search-wrap')) closeSugs(box);
  });
  // close mobile menu
  if (!e.target.closest('.nav') && !e.target.closest('.mobile-menu')) {
    const m = document.getElementById('mobileMenu');
    if (m) m.classList.remove('open');
  }
});

/* ═══════════════════════════════════════════
   STAR RATING
═══════════════════════════════════════════ */
function initStars(containerId, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.sp').forEach(star => {
    star.addEventListener('click', () => {
      const v = parseInt(star.dataset.v);
      const cur = parseInt(container.dataset.val || 0);
      const newVal = cur === v ? 0 : v;
      container.dataset.val = newVal;
      renderStarPick(container, newVal);
      onChange && onChange(newVal);
    });
  });
}
function renderStarPick(container, val) {
  container.querySelectorAll('.sp').forEach((s, i) => s.classList.toggle('on', i < val));
}
function setStarVal(containerId, val) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.dataset.val = val;
  renderStarPick(c, val);
}

/* ═══════════════════════════════════════════
   STATUS CHIP BUTTONS
═══════════════════════════════════════════ */
function initStatusChips(groupId, onChange) {
  document.querySelectorAll(`#${groupId} .status-chip-btn`).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`#${groupId} .status-chip-btn`).forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      onChange && onChange(btn.dataset.status);
    });
  });
}
function setStatusChip(groupId, val) {
  document.querySelectorAll(`#${groupId} .status-chip-btn`).forEach(b => {
    b.classList.toggle('on', b.dataset.status === val);
  });
}

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 2800);
}

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function starsHTML(n, size = 12) {
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="s ${i < n ? 'on' : 'off'}" style="font-size:${size}px">★</span>`
  ).join('');
}
function statusClass(s) {
  const map = { 'Watching': 'status-watching', 'Completed': 'status-completed', 'Pending': 'status-pending', 'Dropped': 'status-dropped', 'Plan to Watch': 'status-plantowatch' };
  return map[s] || 'status-watching';
}
function fmtDate(iso) { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
function genreOf(a) { return (a.genres || []).join(', ') || 'Unknown'; }

/* ═══════════════════════════════════════════
   UPDATE WATCHLIST BADGE
═══════════════════════════════════════════ */
function updateBadge() {
  document.querySelectorAll('.wl-badge').forEach(el => {
    el.textContent = watchlistData.length;
    el.style.display = watchlistData.length ? '' : 'none';
  });
}

/* ═══════════════════════════════════════════
   ════════════════════════════════════════════
   INDEX PAGE (Watched Anime)
   ════════════════════════════════════════════
═══════════════════════════════════════════ */
function initIndexPage() {
  loadData();
  initTheme();
  hideLoader();
  updateBadge();

  // FAB → open add modal
  const fab = document.getElementById('fab');
  if (fab) fab.addEventListener('click', openAddModal);

  // Random btn
  const randBtn = document.getElementById('randomBtn');
  if (randBtn) randBtn.addEventListener('click', openRandomModal);

  // Search box
  const searchBox = document.getElementById('searchBox');
  if (searchBox) searchBox.addEventListener('input', renderWatched);

  // Sort select
  const sortSel = document.getElementById('sortSel');
  if (sortSel) { sortSel.addEventListener('change', () => { currentSort = sortSel.value; renderWatched(); }); }

  // Genre filter
  const genreFilter = document.getElementById('genreFilter');
  if (genreFilter) genreFilter.addEventListener('change', () => { currentFilter = genreFilter.value; renderWatched(); });

  // Add Modal
  initSearchInput('addSearch', 'addSugs', 'addSpin');
  initStars('addStarPick', v => { currentRating = v; });
  initStatusChips('addStatusGroup', v => { addStatus = v; });

  const addForm = document.getElementById('addForm');
  if (addForm) addForm.addEventListener('submit', handleAdd);

  // Edit Modal
  initStars('editStarPick', v => { editRating = v; });
  initStatusChips('editStatusGroup', v => { editStatus = v; });
  const editForm = document.getElementById('editForm');
  if (editForm) editForm.addEventListener('submit', handleEdit);

  renderWatched();
  renderStats();
  populateGenreFilter();
}

/* ── ADD MODAL ── */
function openAddModal() {
  document.getElementById('addModal').classList.add('open');
  document.getElementById('addSearch').value = '';
  document.getElementById('addNotes').value  = '';
  document.getElementById('addEpsW').value   = '';
  document.getElementById('addEpsT').value   = '';
  currentRating = 0; selectedAnime = null; addStatus = 'Watching';
  setStarVal('addStarPick', 0);
  setStatusChip('addStatusGroup', 'Watching');
}
function closeAddModal() { document.getElementById('addModal').classList.remove('open'); }

function handleAdd(e) {
  e.preventDefault();
  const title = document.getElementById('addSearch').value.trim();
  if (!title) { toast('⚠️ Please search for an anime!', 'error'); return; }
  const epw   = parseInt(document.getElementById('addEpsW').value) || 0;
  const ept   = selectedAnime?.episodes || parseInt(document.getElementById('addEpsT').value) || 0;
  const notes = document.getElementById('addNotes').value.trim();

  const entry = {
    id:      Date.now(),
    num:     watchedList.length + 1,
    title:   selectedAnime?.title || title,
    titleEn: selectedAnime?.title_english || '',
    poster:  selectedAnime?.images?.jpg?.large_image_url || selectedAnime?.images?.jpg?.image_url || '',
    genres:  (selectedAnime?.genres || []).map(g => g.name),
    malScore: selectedAnime?.score || null,
    malId:   selectedAnime?.mal_id || null,
    status:  addStatus,
    rating:  currentRating,
    epw, ept, notes, fav: false,
    date: new Date().toISOString(),
  };

  watchedList.unshift(entry);
  renumberList();
  saveWatched();
  closeAddModal();
  renderWatched();
  renderStats();
  populateGenreFilter();
  toast('🎌 Anime added to your list!', 'success');
}

/* ── EDIT MODAL ── */
function openEditModal(id) {
  const a = watchedList.find(x => x.id === id);
  if (!a) return;
  editId = id;
  document.getElementById('editTitle').textContent = '✏️ ' + a.title;
  document.getElementById('editNotes').value = a.notes || '';
  document.getElementById('editEpsW').value  = a.epw || '';
  document.getElementById('editEpsT').value  = a.ept || '';
  editRating = a.rating || 0;
  editStatus = a.status || 'Watching';
  setStarVal('editStarPick', editRating);
  setStatusChip('editStatusGroup', editStatus);
  document.getElementById('editModal').classList.add('open');
}
function closeEditModal() { document.getElementById('editModal').classList.remove('open'); editId = null; }

function handleEdit(e) {
  e.preventDefault();
  const a = watchedList.find(x => x.id === editId);
  if (!a) return;
  a.status = editStatus;
  a.rating = editRating;
  a.epw    = parseInt(document.getElementById('editEpsW').value) || 0;
  a.ept    = parseInt(document.getElementById('editEpsT').value) || a.ept || 0;
  a.notes  = document.getElementById('editNotes').value.trim();
  saveWatched();
  closeEditModal();
  renderWatched();
  toast('✅ Anime updated!', 'success');
}

/* ── DELETE ── */
function deleteAnime(id) {
  if (!confirm('Remove this anime from your list?')) return;
  watchedList = watchedList.filter(a => a.id !== id);
  renumberList();
  saveWatched();
  renderWatched();
  renderStats();
  populateGenreFilter();
  toast('🗑️ Anime removed', 'info');
}

/* ── FAVOURITE ── */
function toggleFav(id) {
  const a = watchedList.find(x => x.id === id);
  if (a) { a.fav = !a.fav; saveWatched(); renderWatched(); toast(a.fav ? '❤️ Added to favourites' : '💔 Removed from favourites', 'info'); }
}

/* ── MOVE TO WATCHLIST ── */
function moveToWatchlist(id) {
  const a = watchedList.find(x => x.id === id);
  if (!a) return;
  watchlistData.unshift({ ...a, id: Date.now(), status: 'Plan to Watch' });
  watchedList = watchedList.filter(x => x.id !== id);
  renumberList();
  saveWatched();
  saveWatchlist();
  renderWatched();
  renderStats();
  updateBadge();
  toast('📋 Moved to Watchlist!', 'info');
}

/* ── RENUMBER ── */
function renumberList() { watchedList.forEach((a, i) => a.num = i + 1); }

/* ── FILTER / SORT ── */
function getFiltered() {
  const q   = (document.getElementById('searchBox')?.value || '').toLowerCase();
  const gen = document.getElementById('genreFilter')?.value || 'All';
  let list  = [...watchedList];
  if (gen !== 'All') list = list.filter(a => (a.genres || []).includes(gen));
  if (q) list = list.filter(a => a.title.toLowerCase().includes(q) || (a.notes || '').toLowerCase().includes(q));
  switch (currentSort) {
    case 'oldest': list.sort((a, b) => a.id - b.id); break;
    case 'az':     list.sort((a, b) => a.title.localeCompare(b.title)); break;
    case 'za':     list.sort((a, b) => b.title.localeCompare(a.title)); break;
    case 'rating': list.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
    default:       /* newest — already unshifted */ break;
  }
  return list;
}

/* ── RENDER WATCHED ── */
function renderWatched() {
  const grid = document.getElementById('animeGrid');
  if (!grid) return;
  const items = getFiltered();
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state">
      <span class="ei">🎌</span>
      <h3>YOUR LIST IS EMPTY</h3>
      <p>Start adding anime you've watched or are watching right now!</p>
      <button class="cta" onclick="openAddModal()">＋ Add Your First Anime</button>
    </div>`;
    return;
  }
  grid.innerHTML = items.map((a, idx) => {
    const ep = a.ept ? `${a.epw || 0}/${a.ept}` : (a.epw ? `EP ${a.epw}` : '');
    return `<div class="anime-card" style="animation-delay:${idx * 0.04}s">
      <div class="card-num">${a.num}</div>
      <span class="card-status ${statusClass(a.status)}">${a.status}</span>
      <button class="card-fav ${a.fav ? 'on' : ''}" onclick="toggleFav(${a.id})" title="${a.fav ? 'Remove fave' : 'Add fave'}">${a.fav ? '❤️' : '🤍'}</button>
      <div class="card-poster">
        ${a.poster
          ? `<img src="${a.poster}" onerror="this.parentElement.innerHTML='<div class=no-poster><span>🎌</span><p>${a.title}</p></div>'" loading="lazy"/>`
          : `<div class="no-poster"><span>🎌</span><p>${a.title}</p></div>`}
      </div>
      <div class="card-overlay">
        <div class="card-title">${a.title}</div>
        <div class="card-genre">${genreOf(a)}${ep ? ' · ' + ep : ''}</div>
        ${a.rating ? `<div class="card-stars">${starsHTML(a.rating)}</div>` : ''}
        <div class="card-actions">
          <button class="card-action-btn" onclick="openEditModal(${a.id})">✏️ Edit</button>
          ${a.malId ? `<button class="card-action-btn success" onclick="window.open('https://myanimelist.net/anime/${a.malId}','_blank')">🔗 MAL</button>` : ''}
          <button class="card-action-btn danger" onclick="deleteAnime(${a.id})">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ── RENDER STATS ── */
function renderStats() {
  const total    = watchedList.length;
  const watching = watchedList.filter(a => a.status === 'Watching').length;
  const done     = watchedList.filter(a => a.status === 'Completed').length;
  const favs     = watchedList.filter(a => a.fav).length;
  const els = {
    statTotal:    total,
    statWatching: watching,
    statDone:     done,
    statFavs:     favs,
  };
  Object.entries(els).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = val; });
}

/* ── GENRE FILTER POPULATE ── */
function populateGenreFilter() {
  const sel = document.getElementById('genreFilter');
  if (!sel) return;
  const genres = [...new Set(watchedList.flatMap(a => a.genres || []))].sort();
  const cur = sel.value;
  sel.innerHTML = `<option value="All">All Genres</option>` + genres.map(g => `<option value="${g}">${g}</option>`).join('');
  if (genres.includes(cur)) sel.value = cur;
}

/* ── RANDOM ANIME ── */
function openRandomModal() {
  const all = watchedList.filter(a => a.poster);
  if (!all.length) { toast('Add some anime first! 🎌', 'info'); return; }
  const pick = all[Math.floor(Math.random() * all.length)];
  document.getElementById('randomPoster').src    = pick.poster;
  document.getElementById('randomTitle').textContent  = pick.title;
  document.getElementById('randomGenre').textContent  = genreOf(pick);
  document.getElementById('randomStars').innerHTML    = pick.rating ? starsHTML(pick.rating, 18) : '⭐ Not rated';
  document.getElementById('randomModal').classList.add('open');
}
function closeRandomModal() { document.getElementById('randomModal').classList.remove('open'); }
function rerollRandom() { closeRandomModal(); setTimeout(openRandomModal, 100); }

/* ═══════════════════════════════════════════
   ════════════════════════════════════════════
   WATCHLIST PAGE
   ════════════════════════════════════════════
═══════════════════════════════════════════ */
function initWatchlistPage() {
  loadData();
  initTheme();
  hideLoader();
  updateBadge();

  // Add to watchlist form
  initSearchInput('wlSearch', 'wlSugs', 'wlSpin');
  const wlForm = document.getElementById('wlAddForm');
  if (wlForm) wlForm.addEventListener('submit', handleWlAdd);

  const searchBox = document.getElementById('wlSearchFilter');
  if (searchBox) searchBox.addEventListener('input', renderWatchlist);

  renderWatchlist();
  renderWlStats();
}

function handleWlAdd(e) {
  e.preventDefault();
  const title = document.getElementById('wlSearch').value.trim();
  if (!title) { toast('⚠️ Search for an anime first!', 'error'); return; }
  // Check duplicate
  if (watchlistData.some(a => a.title.toLowerCase() === (selectedAnime?.title || title).toLowerCase())) {
    toast('⚠️ Already in your watchlist!', 'error'); return;
  }
  const entry = {
    id:      Date.now(),
    title:   selectedAnime?.title || title,
    poster:  selectedAnime?.images?.jpg?.large_image_url || selectedAnime?.images?.jpg?.image_url || '',
    genres:  (selectedAnime?.genres || []).map(g => g.name),
    malId:   selectedAnime?.mal_id || null,
    status:  'Plan to Watch',
    date:    new Date().toISOString(),
  };
  watchlistData.unshift(entry);
  saveWatchlist();
  selectedAnime = null;
  document.getElementById('wlSearch').value = '';
  renderWatchlist();
  renderWlStats();
  updateBadge();
  toast('📋 Added to Watchlist!', 'success');
}

function wlMarkWatched(id) {
  const a = watchlistData.find(x => x.id === id);
  if (!a) return;
  // Move to watched list
  watchedList.unshift({ ...a, id: Date.now(), num: watchedList.length + 1, status: 'Completed', rating: 0, epw: 0, date: new Date().toISOString() });
  renumberList();
  watchlistData = watchlistData.filter(x => x.id !== id);
  saveWatched(); saveWatchlist();
  renderWatchlist(); renderWlStats(); updateBadge();
  toast('✅ Moved to Watched list!', 'success');
}

function wlDelete(id) {
  watchlistData = watchlistData.filter(x => x.id !== id);
  saveWatchlist(); renderWatchlist(); renderWlStats(); updateBadge();
  toast('🗑️ Removed from Watchlist', 'info');
}

function renderWatchlist() {
  const grid = document.getElementById('watchlistGrid');
  if (!grid) return;
  const q = (document.getElementById('wlSearchFilter')?.value || '').toLowerCase();
  let items = [...watchlistData];
  if (q) items = items.filter(a => a.title.toLowerCase().includes(q));

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <span class="ei">📋</span>
      <h3>WATCHLIST IS EMPTY</h3>
      <p>Add anime you're planning to watch!</p>
    </div>`;
    return;
  }
  grid.innerHTML = items.map((a, i) => `
    <div class="wl-card" style="animation-delay:${i * 0.04}s">
      <div class="wl-poster">
        ${a.poster ? `<img src="${a.poster}" onerror="this.parentElement.innerHTML='<div class=wl-nop>🎌</div>'" loading="lazy"/>` : '<div class="wl-nop">🎌</div>'}
      </div>
      <div class="wl-body">
        <div>
          <div class="wl-title">${a.title}</div>
          <div class="wl-genre">${genreOf(a)}</div>
        </div>
        <div class="wl-btns">
          <button class="wl-btn watched" onclick="wlMarkWatched(${a.id})">✅ Watched</button>
          ${a.malId ? `<button class="wl-btn" onclick="window.open('https://myanimelist.net/anime/${a.malId}','_blank')" style="border-color:rgba(79,195,247,.4);color:#4fc3f7">🔗 MAL</button>` : ''}
          <button class="wl-btn del" onclick="wlDelete(${a.id})">🗑️</button>
        </div>
      </div>
    </div>`).join('');
}

function renderWlStats() {
  const el = document.getElementById('wlCount');
  if (el) el.textContent = watchlistData.length;
}

/* ═══════════════════════════════════════════
   ════════════════════════════════════════════
   CATEGORIES PAGE
   ════════════════════════════════════════════
═══════════════════════════════════════════ */
function initCategoriesPage() {
  loadData();
  initTheme();
  hideLoader();
  updateBadge();
  renderCategories();
}

function renderCategories(filterGenre = 'All') {
  const container = document.getElementById('catContainer');
  if (!container) return;

  // Build genre filter bar
  const allGenres = [...new Set([...watchedList, ...watchlistData].flatMap(a => a.genres || []))].sort();
  const filterBar = document.getElementById('genrePills');
  if (filterBar) {
    filterBar.innerHTML = ['All', ...allGenres].map(g =>
      `<button class="genre-pill ${g === filterGenre ? 'on' : ''}" onclick="renderCategories('${g}')">${g}</button>`
    ).join('');
  }

  // Group anime by genre
  const allAnime = [...watchedList, ...watchlistData];
  let genres = filterGenre === 'All' ? allGenres : [filterGenre];
  if (!genres.length) {
    container.innerHTML = `<div class="empty-state"><span class="ei">🎭</span><h3>NO CATEGORIES YET</h3><p>Add anime to see them grouped by genre!</p></div>`;
    return;
  }

  container.innerHTML = genres.map(genre => {
    const animeInGenre = allAnime.filter(a => (a.genres || []).includes(genre));
    if (!animeInGenre.length) return '';
    return `<div class="genre-section">
      <div class="genre-section-title">${genre} <span class="genre-count">${animeInGenre.length} anime</span></div>
      <div class="anime-grid" style="animation:none">
        ${animeInGenre.map((a, i) => `
          <div class="anime-card" style="animation-delay:${i * 0.04}s">
            <div class="card-num">${a.num || '—'}</div>
            <span class="card-status ${statusClass(a.status)}">${a.status}</span>
            <div class="card-poster">
              ${a.poster
                ? `<img src="${a.poster}" onerror="this.parentElement.innerHTML='<div class=no-poster><span>🎌</span><p>${a.title}</p></div>'" loading="lazy"/>`
                : `<div class="no-poster"><span>🎌</span><p>${a.title}</p></div>`}
            </div>
            <div class="card-overlay">
              <div class="card-title">${a.title}</div>
              <div class="card-genre">${genre}</div>
              ${a.rating ? `<div class="card-stars">${starsHTML(a.rating)}</div>` : ''}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
  }).filter(Boolean).join('');

  if (!container.innerHTML.trim()) {
    container.innerHTML = `<div class="empty-state"><span class="ei">🎭</span><h3>NOTHING HERE</h3><p>No anime in this genre yet.</p></div>`;
  }
}

/* ═══════════════════════════════════════════
   MODAL CLOSE ON BG CLICK
═══════════════════════════════════════════ */
document.addEventListener('click', e => {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});
