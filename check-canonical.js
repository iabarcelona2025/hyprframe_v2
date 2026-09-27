const fs = require("fs");
const { JSDOM } = require("jsdom");

const pages = ["index.html","legacy.html","builder.html","project-asics.html","project-deep.html",
"project-distant.html","project-exit.html","project-farewell.html","project-iad.html",
"project-node.html","project-polestar5.html","project-ryuu.html","project-stained.html"];

let fail = 0;
for (const f of pages) {
  const dom = new JSDOM(fs.readFileSync(f, "utf8"));
  const doc = dom.window.document;
  const expected = f === "index.html" ? "https://hyprframe.com/" : `https://hyprframe.com/${f}`;
  const links = doc.querySelectorAll('link[rel="canonical"]');
  const href = links[0] ? links[0].getAttribute("href") : null;
  const inHead = links[0] ? links[0].parentNode.tagName === "HEAD" : false;
  const ok = links.length === 1 && href === expected && inHead;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FAIL"} ${f.padEnd(23)} n=${links.length} head=${inHead} href=${href}`);
}

// 404.html NO debe llevar canonical
const d404 = new JSDOM(fs.readFileSync("404.html", "utf8")).window.document;
const n404 = d404.querySelectorAll('link[rel="canonical"]').length;
const robots404 = d404.querySelector('meta[name="robots"]')?.getAttribute("content");
console.log(`${n404 === 0 ? "OK  " : "FAIL"} 404.html               canonical=${n404} (esperado 0) robots="${robots404}"`);
if (n404 !== 0) fail++;

// sitemap: parseo y contraste con los canonicals
const sm = fs.readFileSync("sitemap.xml", "utf8");
const locs = [...sm.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
const canon = pages.map(f => f === "index.html" ? "https://hyprframe.com/" : `https://hyprframe.com/${f}`);
const missingInSitemap = canon.filter(c => !locs.includes(c));
console.log(`${missingInSitemap.length === 0 ? "OK  " : "FAIL"} sitemap cubre los 13 canonical EN; faltan: ${missingInSitemap.length ? missingInSitemap.join(", ") : "ninguna"}`);
if (missingInSitemap.length) fail++;

// Sin <loc> repetidos. Este check no existía y por eso el merge de la PR #45
// coló un project-node.html duplicado: el commit 6e8f5e1 lo había añadido por
// su cuenta y el mío también, y al caer en regiones distintas del fichero git
// se quedó los dos sin dar conflicto.
const dupes = [...new Set(locs.filter((l, i) => locs.indexOf(l) !== i))];
console.log(`${dupes.length === 0 ? "OK  " : "FAIL"} sitemap sin URLs duplicadas${dupes.length ? ": " + dupes.join(", ") : ""}`);
if (dupes.length) fail++;

console.log(`     sitemap: ${locs.length} URLs, ${locs.filter(l => l.includes("/es/")).length} en /es/`);

console.log(fail === 0 ? "\nRESULTADO: TODO OK" : `\nRESULTADO: ${fail} FALLOS`);
process.exit(fail === 0 ? 0 : 1);
