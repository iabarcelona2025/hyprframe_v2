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

// sitemap: parseo y contraste con los canonicals.
// builder.html queda fuera a propósito: es accesible pero no indexable, así que
// no debe anunciarse en el sitemap (los buscadores lo descubren por enlaces).
const sm = fs.readFileSync("sitemap.xml", "utf8");
const locs = [...sm.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
const canon = pages
  .filter(f => f !== "builder.html")
  .map(f => f === "index.html" ? "https://hyprframe.com/" : `https://hyprframe.com/${f}`);
const missingInSitemap = canon.filter(c => !locs.includes(c));
const unexpectedInSitemap = locs.filter(l => /\/builder\.html$/.test(l));
console.log(`${missingInSitemap.length === 0 ? "OK  " : "FAIL"} sitemap cubre los ${canon.length} canonical EN indexables; faltan: ${missingInSitemap.length ? missingInSitemap.join(", ") : "ninguna"}`);
console.log(`${unexpectedInSitemap.length === 0 ? "OK  " : "FAIL"} sitemap sin páginas no indexables; builder listado: ${unexpectedInSitemap.length ? unexpectedInSitemap.join(", ") : "no"}`);
console.log(`     sitemap: ${locs.length} URLs, ${locs.filter(l => l.includes("/es/")).length} en /es/`);
if (missingInSitemap.length) fail++;

console.log(fail === 0 ? "\nRESULTADO: TODO OK" : `\nRESULTADO: ${fail} FALLOS`);
process.exit(fail === 0 ? 0 : 1);
