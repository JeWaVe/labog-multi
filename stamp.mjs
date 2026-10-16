// Écrit dans index.html un numéro de version dérivé du contenu des fichiers : le navigateur
// recharge un fichier dès qu'il change (GitHub Pages sert tout avec max-age=600).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const files = ["app.js", "game.js", "net.js", "firebase-config.js", "style.css", "words.txt", "grids.json"];
const h = createHash("sha1");
for (const f of files) h.update(readFileSync(new URL(`./${f}`, import.meta.url)));
const v = h.digest("hex").slice(0, 8);

const path = new URL("./index.html", import.meta.url);
const html = readFileSync(path, "utf8");
const out = html.replace(/\?v=[0-9a-f]+/g, `?v=${v}`);
if (out !== html) writeFileSync(path, out);
console.log(`version ${v}`);
