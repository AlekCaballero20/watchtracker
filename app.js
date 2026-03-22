/* ==========================================================================
   Watch Tracker · app.js v3
   Perfiles, modal de edición, plataforma, tags, póster, fechas,
   recomendaciones, rating con estrellas, stats visuales, confirmación inline.
   Sin dependencias. Sin backend. Solo orden.
========================================================================== */

const STORAGE_KEY  = "watch_tracker_v1";
const PROFILE_KEY  = "watch_tracker_profile";

// ---- DOM helpers ----
const el  = (id)          => document.getElementById(id);
const qs  = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---- Enums / labels ----
const STATUS = ["pendiente", "viendo", "terminada", "en-pausa", "abandonada"];
const STATUS_LABEL = {
  pendiente: "Pendiente", viendo: "Viendo", terminada: "Terminada",
  "en-pausa": "En pausa", abandonada: "Abandonada",
};
const TYPE_LABEL = {
  serie: "Serie", pelicula: "Película", anime: "Anime", documental: "Documental",
};
const PLATFORM_LABEL = {
  netflix: "Netflix", max: "Max", prime: "Prime", disney: "Disney+",
  apple: "Apple TV+", crunchyroll: "Crunchyroll", mubi: "MUBI",
  youtube: "YouTube", otro: "Otro",
};
const STATUS_COLOR = {
  pendiente: "#fbbf24", viendo: "#34d399", terminada: "#a855f7",
  "en-pausa": "#3b7dff", abandonada: "#f43f5e",
};

// ---- State ----
let items         = [];
let activeProfile = localStorage.getItem(PROFILE_KEY) || "all";
let editingId     = null;
let modalRating   = null;
let modalTags     = [];

// ---- Storage ----
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

function uid() {
  return crypto?.randomUUID?.() ?? (Date.now().toString(16) + Math.random().toString(16).slice(2));
}

// ---- Normalization / migration ----
function normalizeItem(it) {
  if (!it || typeof it !== "object") return null;
  const now  = new Date().toISOString();
  const title = String(it.title ?? "").trim();
  if (!title) return null;

  return {
    id:            String(it.id ?? uid()),
    title,
    type:          normalizeType(it.type),
    status:        normalizeStatus(it.status),
    season:        toInt(it.season, 0),
    episode:       toInt(it.episode, 0),
    rating:        toRating(it.rating),
    notes:         String(it.notes ?? "").trim(),
    createdAt:     isoOr(it.createdAt, now),
    updatedAt:     isoOr(it.updatedAt, now),
    // v3 fields
    profile:       normalizeProfile(it.profile),
    platform:      normalizePlatform(it.platform),
    tags:          normalizeTags(it.tags),
    poster:        String(it.poster ?? "").trim(),
    recommendedBy: String(it.recommendedBy ?? "").trim(),
    dateStarted:   isoOrNull(it.dateStarted),
    dateFinished:  isoOrNull(it.dateFinished),
    nextDate:      isoOrNull(it.nextDate),
  };
}

function normalizeType(v) {
  const s = String(v ?? "").toLowerCase().trim();
  if (["serie","pelicula","anime","documental"].includes(s)) return s;
  if (s.includes("peli")) return "pelicula";
  if (s.includes("doc"))  return "documental";
  if (s.includes("anim")) return "anime";
  return "serie";
}

function normalizeStatus(v) {
  const s = String(v ?? "").toLowerCase().trim().replace(/\s+/g, "-");
  if (STATUS.includes(s)) return s;
  if (s === "terminado" || s === "finalizada" || s === "finalizado") return "terminada";
  if (s === "pausado" || s === "pausada" || s === "en pausa") return "en-pausa";
  if (s === "abandonado") return "abandonada";
  // legacy capitalized
  const up = String(v ?? "").trim();
  const map = { Pendiente: "pendiente", Viendo: "viendo", Terminado: "terminada",
    Terminada: "terminada", Pausado: "en-pausa", Pausada: "en-pausa",
    Abandonado: "abandonada", Abandonada: "abandonada" };
  return map[up] ?? "pendiente";
}

function normalizeProfile(v) {
  const s = String(v ?? "").toLowerCase().trim();
  return ["alek","cata","shared"].includes(s) ? s : "shared";
}

function normalizePlatform(v) {
  const s = String(v ?? "").toLowerCase().trim();
  return ["netflix","max","prime","disney","apple","crunchyroll","mubi","youtube","otro"].includes(s) ? s : "";
}

function normalizeTags(v) {
  if (Array.isArray(v)) return v.map(t => String(t).trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split(",").map(t => t.trim()).filter(Boolean);
  return [];
}

function isoOr(value, fallback) {
  const s = String(value ?? "").trim();
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d.toISOString();
}

function isoOrNull(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function toRating(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, Math.round(n * 2) / 2));
}

// ---- Init & migrate ----
function initItems() {
  const raw = load();
  if (!Array.isArray(raw)) return [];
  const migrated = raw.map(normalizeItem).filter(Boolean);
  if (JSON.stringify(raw) !== JSON.stringify(migrated)) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch {}
  }
  return migrated;
}

// ---- CRUD ----
function addItem(data) {
  const now = new Date().toISOString();
  const item = normalizeItem({ ...data, id: uid(), createdAt: now, updatedAt: now });
  if (!item) return;
  items.unshift(item);
  save();
  render();
}

function updateItem(id, patch) {
  const i = items.findIndex(x => x.id === id);
  if (i === -1) return;
  items[i] = normalizeItem({ ...items[i], ...patch, updatedAt: new Date().toISOString() }) || items[i];
  save();
  render();
}

function deleteItem(id) {
  items = items.filter(x => x.id !== id);
  save();
  render();
}

function clearAll() {
  items = [];
  save();
  render();
}

// ---- Profile ----
function setProfile(profile) {
  activeProfile = profile;
  localStorage.setItem(PROFILE_KEY, profile);
  qsa(".profile-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.profile === profile)
  );
  // Sync form default
  const fp = el("formProfile");
  if (fp) fp.value = profile === "all" ? "shared" : profile;
  render();
}

// ---- Filtering & sorting ----
function getFiltered() {
  const q  = (el("search")?.value || "").toLowerCase().trim();
  const fs = el("filterStatus")?.value  || "";
  const ft = el("filterType")?.value    || "";
  const fp = el("filterPlatform")?.value|| "";

  let out = items.filter(it => {
    // Profile
    if (activeProfile !== "all") {
      if (it.profile !== "shared" && it.profile !== activeProfile) return false;
    }
    // Search
    if (q) {
      const haystack = [
        it.title, it.notes, it.recommendedBy,
        ...(it.tags || []), TYPE_LABEL[it.type] || "",
        PLATFORM_LABEL[it.platform] || "",
      ].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (fs && it.status   !== fs) return false;
    if (ft && it.type     !== ft) return false;
    if (fp && it.platform !== fp) return false;
    return true;
  });

  const sort = el("sortBy")?.value || "updated_desc";
  out.sort((a, b) => {
    if (sort === "updated_desc") return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    if (sort === "created_desc") return (b.createdAt || "").localeCompare(a.createdAt || "");
    if (sort === "title_asc")    return a.title.localeCompare(b.title, "es", { sensitivity: "base" });
    if (sort === "rating_desc")  return (b.rating ?? -1) - (a.rating ?? -1);
    if (sort === "status_asc")   return STATUS.indexOf(a.status) - STATUS.indexOf(b.status);
    return 0;
  });

  return out;
}

// ---- Formatters ----
function escHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)     return "hace un momento";
  if (diff < 3600)   return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400)  return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} días`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

function fmtDateShort(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

function isoToDateInput(iso) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function dateInputToIso(str) {
  if (!str) return null;
  const d = new Date(str + "T12:00:00");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function formatProgress(it) {
  const s = it.season || 0;
  const e = it.episode || 0;
  if (!s && !e) return "";
  if (s && e) return `T${s}·E${e}`;
  if (s)      return `T${s}`;
  return `E${e}`;
}

function starsDisplay(rating) {
  if (rating == null) return "";
  const n = Math.round(rating / 2);
  return `<span class="stars-display" title="${rating}/10">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
}

function nextStatus(current) {
  const idx = STATUS.indexOf(current);
  return STATUS[(idx + 1) % STATUS.length] || "pendiente";
}

// ---- Stats ----
function renderStats() {
  const statsEl = el("stats");
  if (!statsEl) return;
  const total = items.length;

  if (!total) {
    statsEl.innerHTML = '<span class="stat-pill">Nada aquí todavía 🎬</span>';
    return;
  }

  const byStatus   = Object.fromEntries(STATUS.map(s => [s, 0]));
  const byPlatform = {};
  const byProfile  = { alek: 0, cata: 0, shared: 0 };
  const rated      = [];

  for (const it of items) {
    byStatus[it.status] = (byStatus[it.status] || 0) + 1;
    if (it.platform) byPlatform[it.platform] = (byPlatform[it.platform] || 0) + 1;
    byProfile[it.profile || "shared"]++;
    if (it.rating != null) rated.push(it.rating);
  }

  const avgRating = rated.length
    ? Math.round(rated.reduce((s, r) => s + r, 0) / rated.length * 10) / 10
    : null;

  const topPlatform = Object.entries(byPlatform).sort((a, b) => b[1] - a[1])[0];

  const segments = STATUS
    .map(s => {
      const pct = (byStatus[s] / total * 100).toFixed(1);
      return `<div class="stat-seg" data-status="${s}" style="width:${pct}%" title="${STATUS_LABEL[s]}: ${byStatus[s]}"></div>`;
    }).join("");

  const pills = [
    `<span class="stat-pill">Total: ${total}</span>`,
    ...STATUS.filter(s => byStatus[s] > 0).map(s =>
      `<span class="stat-pill" style="border-color:${STATUS_COLOR[s]}44;color:${STATUS_COLOR[s]}">${STATUS_LABEL[s]}: ${byStatus[s]}</span>`
    ),
    avgRating != null ? `<span class="stat-pill">⭐ ${avgRating}/10</span>` : "",
    topPlatform ? `<span class="stat-pill">🏆 ${PLATFORM_LABEL[topPlatform[0]] || topPlatform[0]}: ${topPlatform[1]}</span>` : "",
  ].filter(Boolean).join("");

  statsEl.innerHTML = `
    <div class="stat-progress">${segments}</div>
    <div class="pills-wrap">${pills}</div>
    <div class="profile-stats mini">
      <span style="color:#5b83ff">A: ${byProfile.alek}</span> ·
      <span style="color:#f472b6">C: ${byProfile.cata}</span> ·
      <span style="color:#34d399">Juntos: ${byProfile.shared}</span>
    </div>`;
}

// ---- Render item ----
function renderItem(it) {
  const color    = STATUS_COLOR[it.status] || "#888";
  const prog     = formatProgress(it);
  const stars    = starsDisplay(it.rating);
  const updated  = timeAgo(it.updatedAt);
  const hasPoster = Boolean(it.poster);

  const posterHtml = hasPoster
    ? `<div class="item-poster">
         <img src="${escHtml(it.poster)}" alt="${escHtml(it.title)}" loading="lazy"
              onerror="this.parentElement.innerHTML='<div class=poster-placeholder>${escHtml(it.title[0] || "?")}</div>'" />
       </div>`
    : "";

  const platformHtml = it.platform
    ? `<span class="platform-badge" data-platform="${it.platform}">${escHtml(PLATFORM_LABEL[it.platform] || it.platform)}</span>`
    : "";

  const profileHtml = it.profile !== "shared"
    ? `<span class="profile-tag" data-profile="${it.profile}">${it.profile === "alek" ? "Alek" : "Cata"}</span>`
    : "";

  const tagsHtml = it.tags?.length
    ? `<div class="tags-row">
         ${it.tags.slice(0, 4).map(t => `<span class="tag-chip">${escHtml(t)}</span>`).join("")}
         ${it.tags.length > 4 ? `<span class="tag-chip muted">+${it.tags.length - 4}</span>` : ""}
       </div>`
    : "";

  const recHtml = it.recommendedBy
    ? `<span class="rec-badge">💬 ${escHtml(it.recommendedBy)}</span>`
    : "";

  const nextDateHtml = it.nextDate && new Date(it.nextDate) > new Date()
    ? `<span class="next-date-badge">📅 ${fmtDateShort(it.nextDate)}</span>`
    : "";

  const notesHtml = it.notes
    ? `<div class="meta notes-line">"${escHtml(it.notes.slice(0, 100))}${it.notes.length > 100 ? "…" : ""}"</div>`
    : "";

  const metaItems = [
    escHtml(TYPE_LABEL[it.type] || it.type),
    platformHtml,
    prog ? `<span>${escHtml(prog)}</span>` : "",
    stars,
    profileHtml,
    recHtml,
    nextDateHtml,
  ].filter(Boolean).join("");

  return `
    <div class="item${hasPoster ? " has-poster" : ""}" data-id="${it.id}">
      ${posterHtml}
      <div class="item-body">
        <h3 title="${escHtml(it.title)}">${escHtml(it.title)}</h3>
        <div class="meta">${metaItems}</div>
        ${tagsHtml}
        ${notesHtml}
        <div class="meta time-line">${escHtml(updated)}</div>
      </div>
      <div class="controls">
        <span class="badge" style="--dot-color:${color}">
          <span class="dot"></span>
          ${escHtml(STATUS_LABEL[it.status] || it.status)}
        </span>
        <select class="small status-select" data-action="setStatus" data-id="${it.id}" aria-label="Cambiar estado">
          ${STATUS.map(s =>
            `<option value="${s}"${it.status === s ? " selected" : ""}>${STATUS_LABEL[s]}</option>`
          ).join("")}
        </select>
        <div class="ctrl-row">
          <button class="small ok"     data-action="incEp"   data-id="${it.id}" title="+1 episodio (Alt+E)">+E</button>
          <button class="small warn"   data-action="toggle"  data-id="${it.id}" title="Ciclar estado (Alt+T)">↻</button>
          <button class="small"        data-action="edit"    data-id="${it.id}">Editar</button>
          <button class="small danger" data-action="delete"  data-id="${it.id}">Borrar</button>
        </div>
      </div>
    </div>`;
}

// ---- Main render ----
function render() {
  renderStats();

  const listEl = el("list");
  if (!listEl) return;

  const data = getFiltered();
  el("listCount").textContent = data.length ? `${data.length} item${data.length !== 1 ? "s" : ""}` : "";

  if (!data.length) {
    const hasFilters = el("search")?.value || el("filterStatus")?.value ||
                       el("filterType")?.value || el("filterPlatform")?.value;
    listEl.innerHTML = `
      <div class="empty-state">
        <h3>${hasFilters ? "Nada que coincida" : "Lista vacía"}</h3>
        <p>${hasFilters ? "Probá cambiando los filtros o la búsqueda." : "Agregá algo y aparecerá aquí."}</p>
      </div>`;
    return;
  }

  listEl.innerHTML = data.map(renderItem).join("");
}

// ---- Modal ---- //
function openModal(id) {
  const it = items.find(x => x.id === id);
  if (!it) return;

  editingId = id;
  el("modalTitle").textContent = it.title;

  el("mTitle").value         = it.title;
  el("mType").value          = it.type;
  el("mStatus").value        = it.status;
  el("mPlatform").value      = it.platform || "";
  el("mProfile").value       = it.profile  || "shared";
  el("mSeason").value        = it.season   || "";
  el("mEpisode").value       = it.episode  || "";
  el("mPoster").value        = it.poster   || "";
  el("mRecommendedBy").value = it.recommendedBy || "";
  el("mDateStarted").value   = isoToDateInput(it.dateStarted);
  el("mDateFinished").value  = isoToDateInput(it.dateFinished);
  el("mNextDate").value      = isoToDateInput(it.nextDate);
  el("mNotes").value         = it.notes    || "";

  modalTags   = [...(it.tags || [])];
  modalRating = it.rating;

  renderTagsPreview();
  renderStarInput();

  el("modalOverlay").hidden = false;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => el("mTitle").focus());
}

function closeModal() {
  el("modalOverlay").hidden = true;
  document.body.style.overflow = "";
  editingId = null;
}

function saveModal() {
  if (!editingId) return;
  const title = el("mTitle").value.trim();
  if (!title) { el("mTitle").focus(); return; }

  updateItem(editingId, {
    title,
    type:          el("mType").value,
    status:        el("mStatus").value,
    platform:      el("mPlatform").value,
    profile:       el("mProfile").value,
    season:        el("mSeason").value,
    episode:       el("mEpisode").value,
    rating:        modalRating,
    tags:          [...modalTags],
    poster:        el("mPoster").value.trim(),
    recommendedBy: el("mRecommendedBy").value.trim(),
    dateStarted:   dateInputToIso(el("mDateStarted").value),
    dateFinished:  dateInputToIso(el("mDateFinished").value),
    nextDate:      dateInputToIso(el("mNextDate").value),
    notes:         el("mNotes").value.trim(),
  });

  closeModal();
}

// ---- Star Input ----
function renderStarInput() {
  const container = el("mStars");
  if (!container) return;
  const filled = modalRating != null ? Math.round(modalRating / 2) : 0;

  container.innerHTML = [1, 2, 3, 4, 5].map(i =>
    `<button type="button" class="star-btn${i <= filled ? " filled" : ""}" data-star="${i}" aria-label="${i} estrella${i > 1 ? "s" : ""}">${i <= filled ? "★" : "☆"}</button>`
  ).join("") +
  (modalRating != null
    ? `<button type="button" class="star-clear" data-star="0" title="Quitar rating">✕ ${modalRating}/10</button>`
    : `<span style="font-size:.75rem;color:var(--muted);margin-left:4px">Sin rating</span>`
  );
}

el("mStars")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-star]");
  if (!btn) return;
  const v = Number(btn.dataset.star);
  modalRating = v === 0 ? null : v * 2;
  renderStarInput();
});

// ---- Tags Input ----
function renderTagsPreview() {
  const preview = el("mTagsPreview");
  if (!preview) return;
  preview.innerHTML = modalTags.map((t, i) =>
    `<span class="tag-pill">${escHtml(t)}<button type="button" class="tag-remove" data-idx="${i}" aria-label="Quitar tag">×</button></span>`
  ).join("");
}

function addModalTag(raw) {
  const tag = raw.trim().replace(/,$/, "").trim();
  if (!tag || modalTags.includes(tag)) return false;
  modalTags.push(tag);
  renderTagsPreview();
  return true;
}

el("mTags")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    if (addModalTag(e.target.value)) e.target.value = "";
  }
});

el("mTags")?.addEventListener("blur", (e) => {
  if (e.target.value.trim()) {
    if (addModalTag(e.target.value)) e.target.value = "";
  }
});

el("mTagsPreview")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tag-remove");
  if (!btn) return;
  modalTags.splice(Number(btn.dataset.idx), 1);
  renderTagsPreview();
});

// ---- Export / Import ----
function exportData() {
  const payload = { schema: 3, exportedAt: new Date().toISOString(), items };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `watch-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData() {
  const input    = document.createElement("input");
  input.type     = "file";
  input.accept   = "application/json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data     = JSON.parse(String(reader.result || ""));
        const incoming = Array.isArray(data) ? data : data?.items;
        if (!Array.isArray(incoming)) { alert("Archivo inválido 😅"); return; }

        const normalized = incoming.map(normalizeItem).filter(Boolean);
        const map = new Map(items.map(x => [x.id, x]));
        for (const it of normalized) {
          const prev = map.get(it.id);
          if (!prev || (it.updatedAt || "") > (prev.updatedAt || "")) map.set(it.id, it);
        }
        items = Array.from(map.values())
          .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
        save();
        render();
        alert(`¡Importado! ${normalized.length} items sincronizados. ✅`);
      } catch { alert("No pude leer ese JSON. Está roto o corrupto."); }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ---- Event handlers ----

// Form submit (add)
el("form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  addItem({
    title:         el("title").value,
    type:          el("type").value,
    status:        el("status").value,
    platform:      el("platform").value,
    profile:       el("formProfile").value,
    season:        el("season").value,
    episode:       el("episode").value,
    rating:        el("rating").value,
    tags:          normalizeTags(el("tags").value),
    poster:        el("poster").value,
    recommendedBy: el("recommendedBy").value,
    notes:         el("notes").value,
  });
  el("form").reset();
  el("title").focus();
});

// List delegation (clicks)
el("list")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const id     = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === "edit") {
    openModal(id);
    return;
  }

  if (action === "incEp") {
    const it = items.find(x => x.id === id);
    if (!it) return;
    updateItem(id, {
      episode: (it.episode || 0) + 1,
      status: it.status === "pendiente" ? "viendo" : it.status,
    });
    return;
  }

  if (action === "toggle") {
    const it = items.find(x => x.id === id);
    if (!it) return;
    updateItem(id, { status: nextStatus(it.status) });
    return;
  }

  if (action === "delete") {
    const itemEl = btn.closest(".item");
    if (!itemEl) return;

    if (itemEl.dataset.confirmDelete) {
      // Second click → confirmed
      deleteItem(id);
      return;
    }

    // First click → ask for confirmation inline
    itemEl.dataset.confirmDelete = "1";
    btn.textContent = "¿Seguro?";
    btn.classList.add("confirm-yes");

    const noBtn = document.createElement("button");
    noBtn.className = "small ghost";
    noBtn.textContent = "No";
    noBtn.dataset.action = "cancelDelete";
    noBtn.dataset.id = id;
    btn.after(noBtn);

    // Auto-cancel after 4 seconds
    setTimeout(() => {
      if (itemEl.dataset.confirmDelete) {
        delete itemEl.dataset.confirmDelete;
        btn.textContent = "Borrar";
        btn.classList.remove("confirm-yes");
        noBtn.remove();
      }
    }, 4000);
    return;
  }

  if (action === "cancelDelete") {
    const itemEl = btn.closest(".item");
    if (!itemEl) return;
    delete itemEl.dataset.confirmDelete;
    const delBtn = itemEl.querySelector("[data-action='delete']");
    if (delBtn) { delBtn.textContent = "Borrar"; delBtn.classList.remove("confirm-yes"); }
    btn.remove();
    return;
  }
});

// List delegation (select change)
el("list")?.addEventListener("change", (e) => {
  const sel = e.target.closest("select[data-action='setStatus']");
  if (!sel) return;
  updateItem(sel.dataset.id, { status: sel.value });
});

// Modal events
el("modalClose")?.addEventListener("click", closeModal);
el("modalCancel")?.addEventListener("click", closeModal);
el("modalSave")?.addEventListener("click", saveModal);
el("modalOverlay")?.addEventListener("click", (e) => {
  if (e.target === el("modalOverlay")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !el("modalOverlay").hidden) closeModal();
});

// Profile toggle
qsa(".profile-btn").forEach(btn => {
  btn.addEventListener("click", () => setProfile(btn.dataset.profile));
});

// Filters
["search", "filterStatus", "filterType", "filterPlatform", "sortBy"].forEach(id => {
  el(id)?.addEventListener(id === "search" ? "input" : "change", render);
});

// Clear all
el("clearAll")?.addEventListener("click", () => {
  if (items.length && confirm("¿Borrar todo? Sí, todo. 😬")) clearAll();
});

// Export / Import
el("exportBtn")?.addEventListener("click", exportData);
el("importBtn")?.addEventListener("click", importData);

// Keyboard shortcuts (Alt+E / Alt+T)
let selectedId = null;
el("list")?.addEventListener("mousedown", (e) => {
  const item = e.target.closest(".item[data-id]");
  if (item) selectedId = item.dataset.id;
});

document.addEventListener("keydown", (e) => {
  if (!e.altKey || !selectedId || !el("modalOverlay").hidden) return;
  const it = items.find(x => x.id === selectedId);
  if (!it) return;

  if (e.key.toLowerCase() === "e") {
    e.preventDefault();
    updateItem(selectedId, {
      episode: (it.episode || 0) + 1,
      status: it.status === "pendiente" ? "viendo" : it.status,
    });
  }
  if (e.key.toLowerCase() === "t") {
    e.preventDefault();
    updateItem(selectedId, { status: nextStatus(it.status) });
  }
});

// ---- Boot ----
items = initItems();
setProfile(activeProfile); // sets active button + syncs form
render();
