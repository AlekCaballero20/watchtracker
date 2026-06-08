/* ==========================================================================
   Watch Tracker · app.js v4
   Lista compartida, personas editables, ruleta sencilla y textos menos tiesos.
========================================================================== */

const STORAGE_KEY  = "watch_tracker_v1";
const PROFILE_KEY  = "watch_tracker_profile";
const WHEEL_KEY    = "watch_tracker_roulette_v1";
const USERS_KEY    = "watch_tracker_users_v1";

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
let users         = [];
let activeProfile = localStorage.getItem(PROFILE_KEY) || "all";
let editingId     = null;
let modalRating   = null;
let modalTags     = [];
let wheelOptions  = [];
let wheelRotation = 0;
let isSpinning    = false;

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

// ---- People ----
const USER_COLORS = ["#3b7dff", "#ec4899", "#34d399", "#a855f7", "#fbbf24", "#22d3ee", "#fb923c", "#f43f5e"];
const DEFAULT_USERS = [
  { id: "alek", name: "Alek", color: "#3b7dff" },
  { id: "cata", name: "Cata", color: "#ec4899" },
];

function cleanName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
}

function makeUserId(name) {
  const base = cleanName(name)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "persona";

  let id = base.slice(0, 32);
  let i = 2;
  while (["all", "shared"].includes(id) || users.some(u => u.id === id)) {
    id = `${base.slice(0, 26)}-${i++}`;
  }
  return id;
}

function initials(name) {
  const parts = cleanName(name).split(" ").filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || "?").slice(0, 2)).toUpperCase();
}

function safeColor(color, fallback) {
  const c = String(color || "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback;
}

function normalizeUser(user, idx = 0) {
  if (!user) return null;
  const name = cleanName(typeof user === "string" ? user : user.name);
  if (!name) return null;
  const id = String(typeof user === "object" && user.id ? user.id : makeUserId(name))
    .toLowerCase().trim().replace(/[^a-z0-9-]/g, "-") || makeUserId(name);
  return {
    id,
    name,
    color: safeColor(user.color, USER_COLORS[idx % USER_COLORS.length]),
  };
}

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveUsers() {
  try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch {}
}

function initUsers() {
  const raw = loadUsers();
  const base = Array.isArray(raw) && raw.length ? raw : DEFAULT_USERS;
  const map = new Map();
  base.map(normalizeUser).filter(Boolean).forEach((u, idx) => {
    const id = ["all", "shared"].includes(u.id) ? `${u.id}-${idx + 1}` : u.id;
    if (!map.has(id)) map.set(id, { ...u, id });
  });
  const list = Array.from(map.values());
  try { localStorage.setItem(USERS_KEY, JSON.stringify(list)); } catch {}
  return list;
}

function getUser(id) {
  return users.find(u => u.id === id);
}

function getProfileName(profile) {
  if (profile === "shared") return "Compartido";
  return getUser(profile)?.name || "Alguien misterioso";
}

function validProfile(profile) {
  return profile === "all" || profile === "shared" || Boolean(getUser(profile));
}

function showUserNote(text) {
  const note = el("userNote");
  if (note) note.textContent = text;
}

function populateProfileSelects(preferred) {
  const options = [
    `<option value="shared">Compartido 🫶</option>`,
    ...users.map(u => `<option value="${escHtml(u.id)}">${escHtml(u.name)}</option>`),
  ].join("");

  ["formProfile", "mProfile"].forEach(id => {
    const select = el(id);
    if (!select) return;
    const current = preferred || select.value || (activeProfile !== "all" ? activeProfile : "shared");
    select.innerHTML = options;
    select.value = current === "all" ? "shared" : (validProfile(current) ? current : "shared");
  });
}

function renderPeople() {
  const host = el("profileToggle");
  if (!host) return;
  const buttons = [
    { id: "all", name: "Todo", icon: "🍿", color: "#34d399" },
    { id: "shared", name: "Compartido", icon: "🫶", color: "#a855f7" },
    ...users.map(u => ({ id: u.id, name: u.name, icon: initials(u.name), color: u.color })),
  ];

  host.innerHTML = buttons.map(p => `
    <button type="button" class="profile-btn${activeProfile === p.id ? " active" : ""}" data-profile="${escHtml(p.id)}" title="Ver ${escHtml(p.name)}">
      <span class="avatar" style="--avatar-bg:${escHtml(p.color)}">${escHtml(p.icon)}</span>
      <span>${escHtml(p.name)}</span>
    </button>`).join("");
}

function addUser(name) {
  const clean = cleanName(name);
  if (!clean) {
    showUserNote("Ponle nombre al humano. Hasta la ruleta tiene más identidad. 🫠");
    return;
  }

  const existing = users.find(u => u.name.toLowerCase() === clean.toLowerCase());
  if (existing) {
    setProfile(existing.id);
    showUserNote(`${existing.name} ya estaba invitado a este desorden audiovisual.`);
    return;
  }

  const user = {
    id: makeUserId(clean),
    name: clean,
    color: USER_COLORS[users.length % USER_COLORS.length],
  };
  users.push(user);
  saveUsers();
  populateProfileSelects(user.id);
  setProfile(user.id);
  showUserNote(`${user.name} agregado. Otro criterio humano entrando al chat. 🎟️`);
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
  const raw = String(v ?? "").trim();
  const s = raw.toLowerCase();
  if (["shared", "juntos", "compartido", "todos"].includes(s)) return "shared";
  const byId = users.find(u => u.id === s);
  if (byId) return byId.id;
  const byName = users.find(u => u.name.toLowerCase() === s);
  if (byName) return byName.id;
  return "shared";
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


// ---- Roulette ----
const WHEEL_COLORS = [
  "#3b7dff", "#a855f7", "#ec4899", "#34d399", "#fbbf24",
  "#22d3ee", "#fb923c", "#f43f5e", "#7c3aed", "#14b8a6"
];
const WHEEL_MESSAGES = [
  "La ruleta habló y nadie aquí tiene la energía para contradecirla:",
  "Se acabó la democracia audiovisual. Hoy se ve:",
  "El destino dio vueltas como adulto pagando recibos y eligió:",
  "Felicitaciones, ya no tienen que discutir durante 40 minutos. Ganó:",
  "La rueda, esa gerente mediocre pero decidida, propone:",
  "La bolita invisible del destino decretó plan oficial:",
];

function loadWheel() {
  try {
    const raw = localStorage.getItem(WHEEL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveWheel() {
  try { localStorage.setItem(WHEEL_KEY, JSON.stringify(wheelOptions)); } catch {}
}

function normalizeWheelOption(opt) {
  if (!opt || typeof opt !== "object") return null;
  const title = String(opt.title ?? "").trim();
  if (!title) return null;
  const now = new Date().toISOString();
  return {
    id:           String(opt.id ?? uid()),
    title,
    sourceItemId: opt.sourceItemId ? String(opt.sourceItemId) : "",
    createdAt:    isoOr(opt.createdAt, now),
  };
}

function initWheelOptions() {
  const raw = loadWheel();
  if (!Array.isArray(raw)) return [];
  const migrated = raw.map(normalizeWheelOption).filter(Boolean);
  if (JSON.stringify(raw) !== JSON.stringify(migrated)) {
    try { localStorage.setItem(WHEEL_KEY, JSON.stringify(migrated)); } catch {}
  }
  return migrated;
}

function wheelOptionFromItem(it) {
  return normalizeWheelOption({
    title: it.title,
    sourceItemId: it.id,
  });
}

function addWheelOption(data) {
  const option = normalizeWheelOption(data);
  if (!option) return false;

  const exists = wheelOptions.some(x =>
    (option.sourceItemId && x.sourceItemId === option.sourceItemId) ||
    x.title.toLowerCase() === option.title.toLowerCase()
  );
  if (exists) {
    showWheelResult("Esa opción ya estaba en la ruleta. La repetición es útil en la música, no tanto aquí. 🫠");
    return false;
  }

  wheelOptions.push(option);
  saveWheel();
  renderWheel();
  return true;
}

function deleteWheelOption(id) {
  wheelOptions = wheelOptions.filter(x => x.id !== id);
  saveWheel();
  renderWheel();
}

function clearWheelOptions() {
  wheelOptions = [];
  wheelRotation = 0;
  saveWheel();
  renderWheel();
}

function shuffleWheelOptions() {
  for (let i = wheelOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wheelOptions[i], wheelOptions[j]] = [wheelOptions[j], wheelOptions[i]];
  }
  saveWheel();
  renderWheel();
  showWheelResult("Listo, opciones mezcladas. El caos ahora usa zapatos bonitos. 🔀");
}

function addPendingToWheel() {
  const base = getFiltered().length ? getFiltered() : items;
  const pool = base.filter(it => !["terminada", "abandonada"].includes(it.status));
  const source = pool.length ? pool : base;
  let added = 0;

  for (const it of source) {
    const option = wheelOptionFromItem(it);
    if (!option) continue;
    const exists = wheelOptions.some(x => x.sourceItemId === it.id || x.title.toLowerCase() === option.title.toLowerCase());
    if (!exists) {
      wheelOptions.push(option);
      added++;
    }
  }

  saveWheel();
  renderWheel();
  showWheelResult(added
    ? `Agregué ${added} pendiente${added !== 1 ? "s" : ""} a la ruleta. Ahora sí, que decida el círculo dramático. 🎡`
    : "No encontré pendientes nuevos para sumar. Trágico: tocará escribir como civilización antigua. ✍️"
  );
}

function renderWheel() {
  const wheel = el("rouletteWheel");
  const optionsEl = el("wheelOptions");
  const countEl = el("wheelCount");
  const spinBtn = el("spinWheel");
  if (!wheel || !optionsEl) return;

  const n = wheelOptions.length;
  if (countEl) countEl.textContent = `${n}`;
  if (spinBtn) spinBtn.disabled = n < 2 || isSpinning;

  const slice = n ? 360 / n : 360;
  const gradient = n
    ? wheelOptions.map((_, i) => {
        const color = WHEEL_COLORS[i % WHEEL_COLORS.length];
        return `${color} ${i * slice}deg ${(i + 1) * slice}deg`;
      }).join(", ")
    : "rgba(255,255,255,.08) 0deg 360deg";

  wheel.style.background = `conic-gradient(${gradient})`;
  wheel.style.transform = `rotate(${wheelRotation}deg)`;
  wheel.querySelector(".roulette-center").textContent = n ? `${n} opciones` : "Vacía";

  optionsEl.innerHTML = n
    ? wheelOptions.map((opt, i) => `
        <div class="wheel-option" style="--wheel-color:${WHEEL_COLORS[i % WHEEL_COLORS.length]}">
          <span class="wheel-dot"></span>
          <div class="wheel-option-body">
            <strong>${escHtml(opt.title)}</strong>
            <span>Opción ${i + 1}. Breve, como debería ser todo trámite humano.</span>
          </div>
          <button type="button" class="small danger" data-wheel-delete="${opt.id}" aria-label="Quitar opción">Quitar</button>
        </div>`).join("")
    : `<div class="wheel-empty mini muted">Sin opciones todavía. Una ruleta vacía es solo decoración con complejo de importancia.</div>`;
}

function showWheelResult(html) {
  const result = el("wheelResult");
  if (result) result.innerHTML = html;
}

function winnerHtml(opt, prefix) {
  return `
    <strong>${escHtml(prefix)}</strong>
    <span class="winner-title">${escHtml(opt.title)}</span>
    <span class="winner-note">Ahora a verla, sin abrir otra pestaña para seguir dudando. Qué milagro. 🍿</span>
  `;
}

function spinWheel() {
  if (wheelOptions.length < 2 || isSpinning) return;

  const wheel = el("rouletteWheel");
  const spinBtn = el("spinWheel");
  if (!wheel) return;

  const n = wheelOptions.length;
  const winnerIndex = Math.floor(Math.random() * n);
  const slice = 360 / n;
  const current = ((wheelRotation % 360) + 360) % 360;
  const targetAngle = 360 - (winnerIndex * slice + slice / 2);
  const extraTurns = 360 * (5 + Math.floor(Math.random() * 3));
  wheelRotation += extraTurns + targetAngle - current;

  isSpinning = true;
  if (spinBtn) spinBtn.disabled = true;
  wheel.classList.add("spinning");
  wheel.style.transform = `rotate(${wheelRotation}deg)`;
  showWheelResult("Girando… que el universo trabaje un poquito, para variar. 🌀");

  window.setTimeout(() => {
    isSpinning = false;
    wheel.classList.remove("spinning");
    if (spinBtn) spinBtn.disabled = wheelOptions.length < 2;
    const winner = wheelOptions[winnerIndex];
    const prefix = WHEEL_MESSAGES[Math.floor(Math.random() * WHEEL_MESSAGES.length)];
    showWheelResult(winnerHtml(winner, prefix));
  }, 3100);
}

// ---- Profile ----
function setProfile(profile) {
  activeProfile = validProfile(profile) ? profile : "all";
  localStorage.setItem(PROFILE_KEY, activeProfile);
  renderPeople();
  populateProfileSelects(activeProfile === "all" ? "shared" : activeProfile);
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
    statsEl.innerHTML = '<span class="stat-pill">Nada todavía. La lista está más limpia que la conciencia de un villano. 🎬</span>';
    return;
  }

  const byStatus   = Object.fromEntries(STATUS.map(s => [s, 0]));
  const byPlatform = {};
  const byProfile  = { shared: 0 };
  users.forEach(u => byProfile[u.id] = 0);
  const rated      = [];

  for (const it of items) {
    byStatus[it.status] = (byStatus[it.status] || 0) + 1;
    if (it.platform) byPlatform[it.platform] = (byPlatform[it.platform] || 0) + 1;
    const profile = normalizeProfile(it.profile);
    byProfile[profile] = (byProfile[profile] || 0) + 1;
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

  const profileBits = [
    byProfile.shared ? `<span style="color:#34d399">Compartido: ${byProfile.shared}</span>` : "",
    ...users.filter(u => byProfile[u.id] > 0).map(u =>
      `<span style="color:${escHtml(u.color)}">${escHtml(u.name)}: ${byProfile[u.id]}</span>`
    ),
  ].filter(Boolean).join(" · ");

  statsEl.innerHTML = `
    <div class="stat-progress">${segments}</div>
    <div class="pills-wrap">${pills}</div>
    <div class="profile-stats mini">${profileBits || "Nadie ha reclamado nada. Sospechoso."}</div>`;
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

  const profileHtml = `<span class="profile-tag" data-profile-kind="${it.profile === "shared" ? "shared" : "user"}">${escHtml(getProfileName(it.profile))}</span>`;

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
        <p>${hasFilters ? "Cambia la búsqueda y fingimos que esto nunca pasó." : "Agrega algo y la lista deja de mirar al vacío."}</p>
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
  populateProfileSelects(it.profile || "shared");
  el("mProfile").value       = normalizeProfile(it.profile || "shared");
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
  const payload = { savedAt: new Date().toISOString(), users, items, roulette: wheelOptions };
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
        if (!Array.isArray(incoming)) { alert("Ese archivo viene raro. No lo voy a fingir: no pude usarlo. 😅"); return; }

        if (Array.isArray(data?.users)) {
          const userMap = new Map(users.map(u => [u.id, u]));
          data.users.map(normalizeUser).filter(Boolean).forEach(u => {
            if (!userMap.has(u.id)) userMap.set(u.id, u);
          });
          users = Array.from(userMap.values());
          saveUsers();
          renderPeople();
          populateProfileSelects();
        }

        const normalized = incoming.map(normalizeItem).filter(Boolean);
        const map = new Map(items.map(x => [x.id, x]));
        for (const it of normalized) {
          const prev = map.get(it.id);
          if (!prev || (it.updatedAt || "") > (prev.updatedAt || "")) map.set(it.id, it);
        }
        items = Array.from(map.values())
          .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

        if (Array.isArray(data?.roulette)) {
          const incomingWheel = data.roulette.map(normalizeWheelOption).filter(Boolean);
          const wheelMap = new Map(wheelOptions.map(x => [x.id, x]));
          for (const opt of incomingWheel) wheelMap.set(opt.id, opt);
          wheelOptions = Array.from(wheelMap.values());
          saveWheel();
        }

        save();
        render();
        renderWheel();
        alert(`¡Listo! Rescaté ${normalized.length} cosa${normalized.length !== 1 ? "s" : ""} para la lista. ✅`);
      } catch { alert("No pude leer ese archivo. Está roto, triste o ambos."); }
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
  populateProfileSelects(activeProfile === "all" ? "shared" : activeProfile);
  el("title").focus();
});


// Roulette events
el("wheelForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const added = addWheelOption({
    title: el("wheelTitle").value,
  });
  if (!added) return;
  el("wheelForm").reset();
  el("wheelTitle").focus();
  showWheelResult("Opción agregada. La indecisión acaba de recibir munición. ✅");
});

el("wheelFromList")?.addEventListener("click", addPendingToWheel);
el("wheelClear")?.addEventListener("click", () => {
  if (wheelOptions.length && confirm("¿Vaciar la ruleta? Mira que después toca pensar otra vez.")) clearWheelOptions();
});
el("spinWheel")?.addEventListener("click", spinWheel);
el("shuffleWheel")?.addEventListener("click", shuffleWheelOptions);
el("wheelOptions")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-wheel-delete]");
  if (!btn) return;
  deleteWheelOption(btn.dataset.wheelDelete);
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

// People
el("profileToggle")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".profile-btn");
  if (!btn) return;
  setProfile(btn.dataset.profile);
});

el("userForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  addUser(el("newUserName")?.value);
  el("newUserName").value = "";
  el("newUserName").focus();
});

// Filters
["search", "filterStatus", "filterType", "filterPlatform", "sortBy"].forEach(id => {
  el(id)?.addEventListener(id === "search" ? "input" : "change", render);
});

// Clear all
el("clearAll")?.addEventListener("click", () => {
  if (items.length && confirm("¿Borrar toda la lista? Decisión fuerte para un botón tan pequeño. 😬")) clearAll();
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
users = initUsers();
items = initItems();
wheelOptions = initWheelOptions();
renderPeople();
populateProfileSelects();
setProfile(activeProfile);
renderWheel();
render();
