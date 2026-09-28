// Run with: node --test test-hreflang.js
// Public language pairs are prepared for launch; staging noindex is intentionally
// left in place. Builder remains non-indexable even after launch, as do 404 pages.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { JSDOM } = require("jsdom");

const origin = "https://hyprframe.com/";
const pages = [
    "index.html",
    "legacy.html",
    ...fs.readdirSync(__dirname).filter(file => /^project-.*\.html$/.test(file)).sort(),
];

function readPage(file) {
    const dom = new JSDOM(fs.readFileSync(path.join(__dirname, file), "utf8"));
    const doc = dom.window.document;
    const result = {
        lang: doc.documentElement.lang,
        canonical: [...doc.querySelectorAll('link[rel="canonical"]')].map(link => link.getAttribute("href")),
        alternates: [...doc.querySelectorAll('link[hreflang]')].map(link => ({
            lang: link.getAttribute("hreflang"),
            href: link.getAttribute("href"),
            rel: link.getAttribute("rel"),
            inHead: doc.head.contains(link),
        })),
        robots: [...doc.querySelectorAll('meta[name="robots"]')].map(meta => meta.content),
    };
    dom.window.close();
    return result;
}

for (const page of pages) {
    test(`${page}: reciprocal EN/ES links use existing canonical targets`, () => {
        const urls = {
            en: origin + (page === "index.html" ? "" : page),
            es: origin + "es/" + page,
        };
        const versions = { en: readPage(page), es: readPage("es/" + page) };
        for (const [lang, version] of Object.entries(versions)) {
            assert.equal(version.lang, lang);
            assert.deepEqual(version.canonical, [urls[lang]]);
            assert.equal(version.alternates.length, 2, "Exactly one EN and one ES alternate");
            const links = Object.fromEntries(version.alternates.map(link => [link.lang, link.href]));
            assert.deepEqual(links, urls, "Include self-reference and matching translation");
            for (const link of version.alternates) {
                assert.equal(link.rel, "alternate");
                assert.equal(link.inHead, true);
                assert.equal(link.href, versions[link.lang].canonical[0]);
                const backLink = versions[link.lang].alternates.find(item => item.lang === lang);
                assert.equal(backLink?.href, urls[lang], "Target must link back to this language version");
            }
        }
    });
}

for (const file of ["builder.html", "es/builder.html", "404.html", "es/404.html"]) {
    test(`${file}: excluded from hreflang and remains noindex`, () => {
        const page = readPage(file);
        assert.equal(page.alternates.length, 0);
        assert.ok(page.robots.some(content => /\bnoindex\b/i.test(content)));
    });
}
