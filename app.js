import {
  LEVELS, GENIAL, MIN_LEN, PrefixTrie, solve, wordPoints, areAdjacent,
  dayNumber, gridForDay, computeLevels, levelFor, counters,
} from "./game.js";
import { connect } from "./net.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
};
const plural = (n, s) => `${n} ${s}${n > 1 ? "s" : ""}`;
const cap = (w) => w[0] + w.slice(1).toLowerCase();

const state = {
  day: dayNumber(),
  letters: [],
  solutions: [],
  thresholds: [],
  total: 0,
  found: [],
  sel: [],
  name: "",
  others: {},
  net: null,
};

// ---------- Initialisation ----------
async function init() {
  const [wordsTxt, gridData] = await Promise.all([
    fetch("words.txt").then((r) => r.text()),
    fetch("grids.json").then((r) => r.json()),
  ]);
  const trie = new PrefixTrie(wordsTxt.split("\n").filter(Boolean));
  state.letters = [...gridForDay(gridData, state.day)];
  state.solutions = solve(state.letters, trie);
  const lv = computeLevels(state.solutions);
  state.thresholds = lv.thresholds;
  state.total = lv.total;

  const saved = store.get(`labog:${state.day}:found`);
  state.found = saved ? JSON.parse(saved).filter((w) => state.solutions.includes(w)) : [];
  state.name = store.get("labog:name") || askName();

  buildBoard();
  bindControls();
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
let cells = [];
function buildBoard() {
  const board = $("board");
  board.innerHTML = "";
  cells = state.letters.map((ch, i) => {
    const b = document.createElement("button");
    b.className = "cell";
    b.dataset.i = i;
    board.appendChild(b);
    return b;
  });
  let dragging = false;
  const cellAt = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || !el.classList.contains("cell")) return null;
    const r = el.getBoundingClientRect();
    // tolérance : il faut viser le centre de la case pour éviter les diagonales accidentelles
    const dx = Math.abs(e.clientX - (r.left + r.right) / 2), dy = Math.abs(e.clientY - (r.top + r.bottom) / 2);
    return dx < r.width * 0.32 && dy < r.height * 0.32 ? +el.dataset.i : null;
  };
  board.addEventListener("pointerdown", (e) => {
    const i = cellAt(e);
    if (i === null) return;
    board.setPointerCapture(e.pointerId);
    dragging = false;
    if (state.sel.length === 0) { state.sel = [i]; dragging = true; }
    else if (i === state.sel[state.sel.length - 1]) state.sel.pop();
    else if (canAdd(i)) { state.sel.push(i); dragging = true; }
    renderSelection();
  });
  board.addEventListener("pointermove", (e) => {
    if (!dragging || e.buttons === 0 && e.pointerType === "mouse") return;
    const i = cellAt(e);
    if (i === null) return;
    const n = state.sel.length;
    if (n > 1 && i === state.sel[n - 2]) { state.sel.pop(); renderSelection(); }
    else if (canAdd(i)) { state.sel.push(i); renderSelection(); }
  });
  board.addEventListener("pointerup", () => {
    if (dragging && state.sel.length >= 2) submit();
    dragging = false;
  });
}

function canAdd(i) {
  if (state.sel.includes(i)) return false;
  return state.sel.length === 0 || areAdjacent(state.sel[state.sel.length - 1], i);
}
const currentWord = () => state.sel.map((i) => state.letters[i]).join("");

function bindControls() {
  $("enter").onclick = submit;
  $("back").onclick = () => { state.sel.pop(); renderSelection(); };
  $("shuffle").onclick = rotate;
  $("share").onclick = share;
  $("rename").onclick = () => { state.name = askName(); publish(); render(); };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
    else if (e.key === "Backspace") { state.sel.pop(); renderSelection(); }
    else if (e.key === "Escape") { state.sel = []; renderSelection(); }
  });
}

function rotate() {
  if (state.sel.length) return;
  const L = state.letters, out = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[r * 4 + c] = L[(3 - c) * 4 + r];
  state.letters = out;
  const board = $("board");
  board.classList.add("shake");
  setTimeout(() => { board.classList.remove("shake"); renderBoard(); }, 400);
}

// ---------- Validation ----------
let msgTimer;
function say(text, good = false) {
  const m = $("message");
  m.textContent = text;
  m.className = good ? "good" : "";
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (m.textContent = ""), 1800);
}

function submit() {
  const w = currentWord();
  if (!w) return;
  if (w.length < MIN_LEN) return fail("Trop court");
  if (state.found.includes(w)) return fail("Déjà trouvé");
  if (!state.solutions.includes(w)) return fail("Mot incorrect");
  const before = levelFor(score(), state.thresholds);
  state.found = [...state.found, w].sort();
  store.set(`labog:${state.day}:found`, JSON.stringify(state.found));
  const pts = wordPoints(w);
  say(`${pts >= 7 ? "Super" : pts >= 5 ? "Bravo" : "Bien"} ! +${pts}`, true);
  state.sel = [];
  const after = levelFor(score(), state.thresholds);
  if (after > before) say(`Niveau : ${LEVELS[after]}`, true);
  render();
  publish();
}
function fail(msg) {
  say(msg);
  state.sel = [];
  renderSelection();
}

const score = () => state.found.reduce((s, w) => s + wordPoints(w), 0);

// ---------- Rendu ----------
function render() {
  renderBoard();
  renderStatus();
  renderCounters();
  renderFound();
  renderPlayers();
}

function renderBoard() {
  const c = counters(state.solutions, state.found);
  cells.forEach((b, i) => {
    const ch = state.letters[i];
    const left = (c.byLetter[ch]?.total ?? 0) - (c.byLetter[ch]?.found ?? 0);
    b.innerHTML = `${ch}<em>${left}</em>`;
    b.classList.toggle("zero", left === 0);
  });
  renderSelection();
}

function renderSelection() {
  cells.forEach((b, i) => {
    b.classList.toggle("sel", state.sel.includes(i));
    b.classList.toggle("last", state.sel[state.sel.length - 1] === i);
  });
  $("current").textContent = currentWord() || " ";
}

function renderStatus() {
  const s = score(), lv = levelFor(s, state.thresholds);
  $("level").textContent = LEVELS[lv];
  $("words").textContent = plural(state.found.length, "mot");
  $("score").textContent = plural(s, "point");
  $("progress").innerHTML = LEVELS.slice(0, -1)
    .map((_, n) => `<div class="${n < lv ? (lv === 9 ? "boss" : "yes") : ""}" title="${LEVELS[n + 1]} : ${state.thresholds[n + 1]} pts"></div>`)
    .join("");
}

// Compteurs toujours affichés : trouvés / total par lettre initiale et par longueur.
function renderCounters() {
  const c = counters(state.solutions, state.found);
  const chip = (label, v) =>
    `<div class="chip${v.found === v.total ? " done" : ""}"><b>${label}</b><span>${v.found}/${v.total}</span></div>`;
  $("by-letter").innerHTML = Object.keys(c.byLetter).sort().map((k) => chip(k, c.byLetter[k])).join("");
  $("by-length").innerHTML = Object.keys(c.byLength).sort((a, b) => a - b)
    .map((k) => chip(`${k} lettres`, c.byLength[k])).join("");
}

function renderFound() {
  $("found-list").textContent = state.found.map(cap).join(" ") || "Aucun mot pour l'instant.";
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
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  $("players").innerHTML = list.map((p) => {
    const me = p.uid === myUid || p.uid === "me";
    const words = (p.words || "").split(" ").filter(Boolean);
    let detail = "";
    if (!me) {
      detail = canSee
        ? `<p class="theirs">${words.map((w) => (state.found.includes(w) ? cap(w) : `<mark>${cap(w)}</mark>`)).join(" ") || "—"}</p>`
        : `<p class="locked">Atteignez « ${LEVELS[GENIAL]} » pour voir leurs mots.</p>`;
    }
    return `<li class="${me ? "me" : ""}"><div class="head"><span>${esc(p.name)}${me ? " (vous)" : ""}</span>` +
      `<span>${LEVELS[p.level] ?? ""} · ${plural(words.length, "mot")} · ${p.score} pt</span></div>${detail}</li>`;
  }).join("");
}

// ---------- Partage ----------
async function share() {
  const s = score(), lv = levelFor(s, state.thresholds);
  const text = `LaBOG multi n°${state.day} : ${LEVELS[lv]} — ${plural(state.found.length, "mot")}, ${plural(s, "point")} sur ${state.total}\n${location.href}`;
  try { await navigator.clipboard.writeText(text); say("Copié dans le presse-papier", true); }
  catch { prompt("Copiez ce texte :", text); }
}

init().catch((e) => { console.error(e); $("message").textContent = "Erreur de chargement."; });
