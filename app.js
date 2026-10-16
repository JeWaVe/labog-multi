import {
  LEVELS, GENIAL, MIN_LEN, MAX_LEN, PrefixTrie, solve, wordPoints, areAdjacent,
  dayNumber, gridForDay, computeLevels, levelFor,
} from "./game.js";
import { connect } from "./net.js";

// Même numéro de version que app.js (voir stamp.mjs), pour contourner le cache des données.
const V = new URL(import.meta.url).search;
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
};
const plural = (n, s) => `${n} ${s}${n > 1 ? "s" : ""}`;
const cap = (w) => w[0] + w.slice(1).toLowerCase();
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = {
  day: dayNumber(),
  gridData: null,
  trie: null,
  letters: [],
  solutions: [],
  thresholds: [],
  total: 0,
  found: [],
  failed: [],
  sel: [],
  name: "",
  others: {},
  net: null,
  locked: false, // saisie bloquée pendant une animation
};

let keys = [];
let cases = [];

// ---------- Initialisation ----------
async function init() {
  const [wordsTxt, gridData] = await Promise.all([
    fetch("words.txt" + V).then((r) => r.text()),
    fetch("grids.json" + V).then((r) => r.json()),
  ]);
  state.gridData = gridData;
  state.trie = new PrefixTrie(wordsTxt.split("\n").filter(Boolean));
  state.letters = [...gridForDay(gridData, state.day)];
  state.solutions = solve(state.letters, state.trie);
  const lv = computeLevels(state.solutions);
  state.thresholds = lv.thresholds;
  state.total = lv.total;

  const saved = store.get(`labog:${state.day}:found`);
  state.found = saved ? JSON.parse(saved).filter((w) => state.solutions.includes(w)) : [];
  state.name = store.get("labog:name") || askName();

  buildBoard();
  bindControls();
  fillInformations();
  render();
  startNetwork();
}

function askName() {
  const n = (prompt("Votre pseudo (20 caractères max) :", "") || "").trim().slice(0, 20);
  const name = n || "Anonyme";
  store.set("labog:name", name);
  return name;
}

// ---------- Plateau et saisie ----------
function buildBoard() {
  $("plateau").innerHTML = Array.from({ length: MAX_LEN }, () => '<div class="case"></div>').join("");
  cases = [...$("plateau").children];

  const grid = $("grid");
  grid.innerHTML = state.letters.map((c, i) => `<button id="key${i}">${c}<em>0</em></button>`).join("");
  keys = [...grid.children];

  let gesture = false; // un geste est en cours sur la grille
  let dragged = false; // ce geste a ajouté des lettres en glissant

  // Touche visée en (x, y), à condition d'être près de son centre : cela évite les
  // diagonales accidentelles quand le doigt coupe le coin d'une case voisine.
  const keyAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const btn = el && el.closest && el.closest("#grid button");
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const dx = Math.abs(x - (r.left + r.right) / 2), dy = Math.abs(y - (r.top + r.bottom) / 2);
    return dx < r.width * 0.38 && dy < r.height * 0.38 ? keys.indexOf(btn) : null;
  };

  // Au départ du geste, toute la surface de la touche compte (le centre n'est exigé qu'ensuite).
  const keyUnder = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const btn = el && el.closest && el.closest("#grid button");
    return btn ? keys.indexOf(btn) : null;
  };

  let prev = null; // dernier point traité du geste
  // Un glissé rapide saute des points : on teste aussi des points intermédiaires sur le segment.
  const visit = (x, y) => {
    if (prev) {
      const dist = Math.hypot(x - prev.x, y - prev.y), steps = Math.ceil(dist / 8);
      for (let s = 1; s < steps; s++) hit(keyAt(prev.x + ((x - prev.x) * s) / steps, prev.y + ((y - prev.y) * s) / steps));
    }
    hit(keyAt(x, y));
    prev = { x, y };
  };
  const hit = (i) => {
    if (i === null) return;
    const n = state.sel.length;
    if (n > 1 && i === state.sel[n - 2]) { state.sel.pop(); renderPlay(); }
    else if (canAdd(i)) { state.sel.push(i); dragged = true; renderPlay(); }
  };

  grid.addEventListener("pointerdown", (e) => {
    if (state.locked) return;
    const i = keyUnder(e.clientX, e.clientY);
    if (i === null) return;
    e.preventDefault();
    try { grid.setPointerCapture(e.pointerId); } catch { /* sans capture, les événements arrivent quand même */ }
    gesture = true;
    dragged = false;
    prev = { x: e.clientX, y: e.clientY };
    if (i === state.sel[state.sel.length - 1]) state.sel.pop();
    else if (canAdd(i)) state.sel.push(i);
    renderPlay();
  });
  grid.addEventListener("pointermove", (e) => {
    if (!gesture || state.locked) return;
    const pts = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const p of pts.length ? pts : [e]) visit(p.clientX, p.clientY);
  });
  grid.addEventListener("contextmenu", (e) => e.preventDefault());
  const end = () => {
    // on ne valide au relâchement qu'après un glissé ; un simple appui ne valide jamais
    if (gesture && dragged && state.sel.length >= 2) submit();
    gesture = false;
    dragged = false;
  };
  grid.addEventListener("pointerup", end);
  grid.addEventListener("pointercancel", () => { gesture = false; dragged = false; });
}

function canAdd(i) {
  if (state.sel.length >= MAX_LEN || state.sel.includes(i)) return false;
  return state.sel.length === 0 || areAdjacent(state.sel[state.sel.length - 1], i);
}
const currentWord = () => state.sel.map((i) => state.letters[i]).join("");
const remainingWords = () => state.solutions.filter((w) => !state.found.includes(w));

function bindControls() {
  $("enter").onclick = submit;
  $("back").onclick = back;
  $("shuffle").onclick = rotate;
  $("share").onclick = share;
  $("menu-share").onclick = () => { closePopups(); share(); };
  $("menu-rename").onclick = () => { state.name = askName(); $("pseudo").textContent = `(${state.name})`; publish(); renderPlayers(); };
  $("pseudo").textContent = `(${state.name})`;
  $("open-menu").onclick = () => openPopup("menu");
  $("open-players").onclick = () => openPopup("players");
  document.querySelectorAll("[data-open]").forEach((a) => (a.onclick = () => openPopup(a.dataset.open)));
  document.querySelectorAll(".ferme").forEach((b) => (b.onclick = closePopups));
  $("message").onclick = () => hide($("message"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (document.querySelector(".popup.open")) closePopups(); else { state.sel = []; renderPlay(); } return; }
    if (document.querySelector(".popup.open")) return;
    if (e.key === "Enter") submit();
    else if (e.key === "Backspace") back();
  });
}

function back() {
  if (state.locked) return;
  state.sel.pop();
  renderPlay();
}

function rotate() {
  if (state.sel.length || state.locked) return;
  const L = state.letters, out = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[r * 4 + c] = L[(3 - c) * 4 + r];
  state.letters = out;
  $("grid").classList.add("shake");
  setTimeout(() => { $("grid").classList.remove("shake"); renderPlay(); }, 400);
}

// ---------- Popups et messages ----------
const show = (el) => (el.style.display = "block");
const hide = (el) => (el.style.display = "none");
function openPopup(id) {
  closePopups();
  if (id === "solutions") fillSolutions();
  if (id === "players") renderPlayers();
  $(id).classList.add("open");
  $(id).scrollTop = 0;
}
function closePopups() {
  document.querySelectorAll(".popup.open").forEach((p) => p.classList.remove("open"));
}

let msgTimer;
function message(text, ms = 1500) {
  const m = $("message");
  m.innerHTML = text;
  show(m);
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => hide(m), ms);
}

function bravo(text, gold) {
  const b = $("bravo");
  b.innerHTML = `<span class="${gold ? "sept" : ""}">${text}</span>`;
  b.style.animation = "none";
  void b.offsetWidth; // relance l'animation
  b.style.animation = "";
  show(b);
  setTimeout(() => hide(b), 950);
}

function confetti() {
  const run = () => window.confetti && window.confetti();
  if (window.confetti) return run();
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.9.2/confetti.browser.min.js";
  s.onload = run;
  document.head.appendChild(s);
}

// ---------- Validation ----------
function submit() {
  const w = currentWord();
  if (state.locked || !w) return;
  if (w.length < MIN_LEN) return reject("Trop court", false);
  if (state.found.includes(w)) return reject("Déjà trouvé", false);
  if (!state.solutions.includes(w)) return reject("Mot incorrect", true);

  const before = levelFor(score(), state.thresholds);
  state.found = [...state.found, w].sort();
  store.set(`labog:${state.day}:found`, JSON.stringify(state.found));
  const pts = wordPoints(w);
  const after = levelFor(score(), state.thresholds);

  state.locked = true;
  cases.forEach((c, i) => i < w.length && c.classList.add("filled-ok"));
  setTimeout(() => {
    state.locked = false;
    state.sel = [];
    render();
    publish();
    bravo(`${pts > 6 ? "Super" : pts > 4 ? "Bravo" : "Bien"} ! <b>+${pts}</b>`, pts > 6);
    if (after > before && after === GENIAL) {
      confetti();
      message(`Victoire !<br>C'est ${LEVELS[after]}`, 6000);
    } else if (state.found.length === state.solutions.length) {
      confetti();
      message("C'est fini !<br><br>¯\\_(ツ)_/¯", 6000);
    }
  }, 300);
  render();
}

function reject(text, remember) {
  if (remember) {
    const w = currentWord();
    if (!state.failed.includes(w)) state.failed.push(w);
  }
  state.locked = true;
  cases.forEach((c, i) => i < state.sel.length && c.classList.add("filled-ko"));
  message(text, 750);
  setTimeout(() => {
    state.locked = false;
    state.sel = [];
    renderPlay();
    renderFound();
  }, 750);
}

const score = () => state.found.reduce((s, w) => s + wordPoints(w), 0);

// ---------- Rendu ----------
function render() {
  renderPlay();
  renderStatus();
  renderFound();
  renderPlayers();
}

/** Plateau (mot en cours) et touches, avec les compteurs permanents de mots restants. */
function renderPlay() {
  const remaining = remainingWords();
  const word = currentWord();
  const last = state.sel.length ? state.sel[state.sel.length - 1] : -1;

  // Cases du mot : lettre saisie + nombre de mots restants de cette longueur (dès 4 lettres).
  cases.forEach((c, n) => {
    const left = remaining.filter((w) => w.length === n + 1).length;
    const letter = word[n] ?? "";
    c.className = "case" + (letter ? " filled" : "");
    c.innerHTML = letter + (n + 1 >= MIN_LEN ? `<em>${left}</em>` : "");
    if (n === state.sel.length && !state.locked) c.innerHTML += "<span class='curseur'>_</span>";
  });

  // Touches : nombre de mots restants commençant par la lettre ; lettre grisée si plus aucun mot restant ne la contient.
  keys.forEach((k, i) => {
    const ch = state.letters[i];
    const starting = remaining.filter((w) => w[0] === ch).length;
    let cls = "key-yes";
    if (i === last) cls = "key-last";
    else if (state.sel.includes(i)) cls = "key-played";
    else if (!canAdd(i)) cls = "key-no";
    if (!remaining.some((w) => w.includes(ch))) {
      if (cls === "key-yes") cls = "key-zero";
      else if (cls === "key-no") cls += " key-zero";
    }
    k.className = cls;
    // mise à jour sur place : ne pas recréer le nœud sous le doigt pendant un geste
    k.firstChild.nodeValue = ch;
    k.lastChild.textContent = starting;
  });

  $("shuffle").className = state.sel.length ? "disable" : "";
  renderFound();
  drawTrace();
}

function drawTrace() {
  const pts = state.sel.map((i) => {
    const k = keys[i];
    return `${k.offsetLeft + k.offsetWidth / 2},${k.offsetTop + k.offsetHeight / 2}`;
  });
  document.querySelector("#svgTrace path").setAttribute("d", pts.length ? `M ${pts.join(" L ")}` : "M 0,0");
}

function renderStatus() {
  const s = score(), lv = levelFor(s, state.thresholds);
  $("niveau").textContent = LEVELS[lv];
  $("mots").textContent = plural(state.found.length, "mot");
  $("points").textContent = plural(s, "point");
  [...$("progression").children].forEach((d, n) => {
    d.className = n < lv ? (lv === 9 ? "boss" : "yes") : "";
  });
}

function renderFound() {
  const typed = currentWord();
  const words = state.found.map((w) =>
    typed && w.startsWith(typed) ? `<u>${cap(typed)}</u>${w.slice(typed.length).toLowerCase()}` : cap(w));
  let html = words.join(" ");
  if (state.failed.length) html += (html ? "<br>" : "") + state.failed.map((w) => `<del>${cap(w)}</del>`).join(" ");
  const n = state.found.length + state.failed.length;
  const el = $("reponses");
  el.className = "reponses" + (n > 75 ? " smaller" : n > 50 ? " small" : "");
  el.innerHTML = html;
  $("inside").scrollTop = $("inside").scrollHeight;
}

// ---------- Informations et solutions ----------
function fillInformations() {
  $("info-day").textContent = `#${state.day}`;
  $("info-words").textContent = state.solutions.length;
  $("info-total").textContent = state.total;
  $("info-levels").innerHTML = LEVELS.slice(1, -1).map((l, i) => `<li>${l} : ${state.thresholds[i + 1]}</li>`).join("");
}

function fillSolutions() {
  const day = state.day - 1;
  const letters = [...gridForDay(state.gridData, day)];
  const sol = solve(letters, state.trie);
  $("sol-day").textContent = `#${day}`;
  $("sol-grid").innerHTML = letters.map((c) => `<div>${c}</div>`).join("");
  const prevFound = new Set(JSON.parse(store.get(`labog:${day}:found`) || "[]"));
  let html = "";
  for (let c = 65; c <= 90; c++) {
    const ch = String.fromCharCode(c);
    const ws = sol.filter((w) => w[0] === ch);
    if (ws.length) html += `<li>${ws.map((w) => (prevFound.has(w) ? `<i>${w.toLowerCase()}</i>` : w.toLowerCase())).join(" ")}</li>`;
  }
  $("sol-list").innerHTML = html;
}

// ---------- Multijoueur ----------
async function startNetwork() {
  const tag = $("net-state");
  try {
    state.net = await connect();
  } catch (e) {
    console.error(e);
    tag.textContent = "(connexion impossible, mode solo)";
    return;
  }
  if (!state.net) { tag.textContent = "(mode solo : Firebase non configuré)"; return; }
  tag.textContent = "(en ligne)";
  state.net.subscribe(state.day, (players) => { state.others = players; renderPlayers(); });
  publish();
}

function publish() {
  if (!state.net) return;
  const s = score();
  state.net.publish(state.day, {
    name: state.name, score: s, level: levelFor(s, state.thresholds), words: state.found.join(" "),
  }).catch((e) => console.error(e));
}

function renderPlayers() {
  const s = score(), myLevel = levelFor(s, state.thresholds), canSee = myLevel >= GENIAL;
  const myUid = state.net?.uid;
  const list = Object.entries(state.others).map(([uid, p]) => ({ uid, ...p }));
  if (!myUid) list.push({ uid: "me", name: state.name, score: s, level: myLevel, words: state.found.join(" ") });
  list.sort((a, b) => b.score - a.score);
  $("players-list").innerHTML = list.map((p) => {
    const me = p.uid === myUid || p.uid === "me";
    const words = (p.words || "").split(" ").filter(Boolean);
    let detail = "";
    if (!me) {
      detail = canSee
        ? `<p class="theirs">${words.map((w) => (state.found.includes(w) ? cap(w) : `<mark>${cap(w)}</mark>`)).join(" ") || "—"}</p>`
        : `<p class="locked">Atteignez « ${LEVELS[GENIAL]} » pour voir leurs mots.</p>`;
    }
    return `<li class="${me ? "me" : ""}"><div class="head"><b>${esc(p.name)}${me ? " (vous)" : ""}</b>` +
      `<span>${LEVELS[p.level] ?? ""} · ${plural(words.length, "mot")} · ${p.score} pt</span></div>${detail}</li>`;
  }).join("");
}

// ---------- Partage ----------
async function share() {
  const s = score(), lv = levelFor(s, state.thresholds);
  const text = `LaBOG multi n°${state.day} : ${LEVELS[lv]} — ${plural(state.found.length, "mot")}, ${plural(s, "point")} sur ${state.total}\n${location.href}`;
  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (e) { if (e.name === "AbortError") return; /* sinon, repli sur la copie */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    message("Copié ✓", 1200);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) message("Copié ✓", 1200); else prompt("Copiez ce texte :", text);
  }
}

window.addEventListener("resize", drawTrace);
init().catch((e) => { console.error(e); message("Erreur de chargement.", 5000); });
