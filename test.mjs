// Valide le solveur à trie contre l'algorithme du site (filtre par lettres + recherche de chemin).
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { PrefixTrie, solve, computeLevels, levelFor, wordPoints, counters, dayNumber, gridForDay } from "./game.js";

const words = readFileSync(new URL("./words.txt", import.meta.url), "utf8").split("\n").filter(Boolean);
const data = JSON.parse(readFileSync(new URL("./grids.json", import.meta.url), "utf8"));
const trie = new PrefixTrie(words);

function pathExists(grid, word) {
  const used = new Array(16).fill(false);
  const go = (cell, i) => {
    if (grid[cell] !== word[i]) return false;
    if (i === word.length - 1) return true;
    used[cell] = true;
    const r = Math.floor(cell / 4), c = cell % 4;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc, n = rr * 4 + cc;
        if ((dr || dc) && rr >= 0 && rr < 4 && cc >= 0 && cc < 4 && !used[n] && go(n, i + 1)) { used[cell] = false; return true; }
      }
    used[cell] = false;
    return false;
  };
  for (let i = 0; i < 16; i++) if (go(i, 0)) return true;
  return false;
}

let t0 = performance.now();
for (const grid of data.grids) {
  const mine = solve([...grid], trie);
  const ref = words.filter((w) => [...w].every((ch) => grid.includes(ch))).filter((w) => pathExists([...grid], w));
  assert.deepEqual(mine, ref, `grille ${grid}`);
}
console.log(`ok : ${data.grids.length} grilles identiques à l'algo du site (${Math.round(performance.now() - t0)} ms)`);

assert.deepEqual([4, 5, 6, 7, 8, 9].map((n) => wordPoints("A".repeat(n))), [1, 5, 6, 7, 8, 9]);

const today = new Date();
const grid = gridForDay(data, dayNumber(today));
const sol = solve([...grid], trie);
const { total, thresholds } = computeLevels(sol, today);
console.log("grille du jour", grid, "mots", sol.length, "points", total, "seuils", thresholds);
assert.equal(levelFor(0, thresholds), 0);
assert.equal(levelFor(total, thresholds), 9);
const c = counters(sol, sol.slice(0, 3));
assert.equal(Object.values(c.byLength).reduce((s, x) => s + x.total, 0), sol.length);
console.log("tous les tests passent");
