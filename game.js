// Moteur du jeu : trie de préfixes, solveur, points, niveaux. Aucune dépendance DOM.

export const LEVELS = [
  "C'est parti", "Pas mal", "En progrès", "Bien", "Fortiche",
  "Joli", "Super", "Épatant", "Génial 🥳", "Formidable !",
];
export const GENIAL = 8; // indice du niveau à partir duquel on voit les mots des autres
const LEVEL_PERCENTS = [0, 2, 5, 8, 15, 25, 39, 49, 69, 100];
const DAY_FACTORS = [0.8, 0.74, 0.77, 0.8, 0.83, 0.86, 0.89]; // selon le jour UTC (0 = dimanche)
const EPOCH = Date.UTC(2022, 9, 1);

export const MIN_LEN = 4;
export const MAX_LEN = 9;

export function wordPoints(word) {
  return [1, 5, 6, 7, 8, 9][word.length - MIN_LEN] ?? 0;
}

// --- Trie de préfixes (même idée que PrefixDictionary) ---
export class PrefixTrie {
  constructor(words = []) {
    this.root = { c: new Map(), w: false };
    for (const w of words) this.add(w);
  }
  add(word) {
    let node = this.root;
    for (const ch of word) {
      let next = node.c.get(ch);
      if (!next) node.c.set(ch, (next = { c: new Map(), w: false }));
      node = next;
    }
    node.w = true;
  }
}

const NEIGHBORS = Array.from({ length: 16 }, (_, i) => {
  const r = Math.floor(i / 4), c = i % 4, out = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < 4 && cc >= 0 && cc < 4) out.push(rr * 4 + cc);
    }
  return out;
});

export function areAdjacent(a, b) {
  return NEIGHBORS[a].includes(b);
}

/** Tous les mots du dictionnaire présents dans la grille (16 lettres), triés. */
export function solve(letters, trie) {
  const found = new Set();
  const used = new Array(16).fill(false);
  const visit = (cell, node, prefix) => {
    const next = node.c.get(letters[cell]);
    if (!next) return; // préfixe absent du dictionnaire : on élague
    const word = prefix + letters[cell];
    if (next.w && word.length >= MIN_LEN) found.add(word);
    if (word.length >= MAX_LEN) return;
    used[cell] = true;
    for (const n of NEIGHBORS[cell]) if (!used[n]) visit(n, next, word);
    used[cell] = false;
  };
  for (let i = 0; i < 16; i++) visit(i, trie.root, "");
  return [...found].sort();
}

// --- Grille du jour ---
export function dayNumber(date = new Date()) {
  return Math.ceil((date.getTime() - EPOCH) / 864e5);
}

/** `data` = contenu de grids.json : { first, grids }. Au-delà de la liste, on boucle. */
export function gridForDay(data, day) {
  const n = data.grids.length;
  const idx = (((day - data.first) % n) + n) % n;
  return data.grids[idx];
}

// --- Niveaux ---
export function computeLevels(words, date = new Date()) {
  const total = words.reduce((s, w) => s + wordPoints(w), 0);
  const target = Math.floor(total * DAY_FACTORS[date.getUTCDay()]);
  const thresholds = LEVEL_PERCENTS.map((p) => Math.floor((p * target) / 100));
  thresholds[LEVELS.length - 1] = total;
  return { total, thresholds };
}

export function levelFor(score, thresholds) {
  let level = 0;
  for (let i = 0; i < thresholds.length; i++) if (score >= thresholds[i]) level = i;
  return level;
}

// --- Compteurs permanents ---
/** Par lettre initiale et par longueur : { total, found } pour chaque entrée. */
export function counters(solutions, foundWords) {
  const found = new Set(foundWords);
  const byLetter = {}, byLength = {};
  for (const w of solutions) {
    const l = (byLetter[w[0]] ??= { total: 0, found: 0 });
    const n = (byLength[w.length] ??= { total: 0, found: 0 });
    l.total++; n.total++;
    if (found.has(w)) { l.found++; n.found++; }
  }
  return { byLetter, byLength };
}
