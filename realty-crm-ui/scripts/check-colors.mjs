// Fails if any component/page uses raw colors or Tailwind palette colors instead of tokens.
// Allowed: src/styles/globals.css (the token source). Run: npm run check:colors
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const SKIP = new Set(["src/styles/globals.css"]);
const PALETTE = "(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}";
const RULES = [
  { re: /#[0-9a-fA-F]{3,8}\b(?![\w-]*\))/g, why: "raw hex color" },
  { re: /\brgba?\(|\bhsla?\(|\boklch\(/g, why: "raw color function" },
  { re: new RegExp(`\\b(?:bg|text|border|fill|stroke|ring|outline|from|to|via|shadow)-${PALETTE}\\b`, "g"), why: "Tailwind palette color (use tokens)" },
];

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f).replaceAll("\\", "/");
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(p) && !SKIP.has(p)) files.push(p);
  }
})(ROOT);

let bad = 0;
for (const f of files) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    for (const r of RULES) {
      for (const m of line.matchAll(r.re)) {
        if (/url\(#/.test(line) && r.why === "raw hex color") continue;
        bad++;
        console.log(`${f}:${i + 1}  ${r.why}: ${m[0]}`);
      }
    }
  });
}
if (bad) { console.error(`\n✖ ${bad} raw color(s). Use tokens from src/styles/globals.css.`); process.exit(1); }
console.log(`✔ No raw colors in ${files.length} files.`);
