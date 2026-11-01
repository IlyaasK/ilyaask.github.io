#!/usr/bin/env node
/*
 * prerender.js — writes every route of the archive as static HTML using the
 * exact same render.js the browser uses. The client router re-renders on
 * boot, so navigation stays instant, but every URL is a real, shareable,
 * crawler-readable file.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const BUILD = path.join(__dirname, 'build');
const R = require(path.join(SRC, 'render.js'));

// The browser loads build/assets/render.js + app.js, and the prerendered HTML
// must come from exactly the same renderer — so copy the shared sources in
// before generating anything. Forgetting this shipped a stale router once.
function copySharedIntoBuild() {
  const pairs = [
    ['render.js', 'assets/render.js'],
    ['app.js', 'assets/app.js'],
    ['style.mine.css', 'assets/style.css'],
  ];
  for (const [src, dest] of pairs) {
    const from = path.join(SRC, src);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(path.join(BUILD, dest)), { recursive: true });
    fs.copyFileSync(from, path.join(BUILD, dest));
  }
}
copySharedIntoBuild();

const data = JSON.parse(fs.readFileSync(path.join(BUILD, 'data', 'site.json'), 'utf8'));
const POSTS = R.postsSorted(data);

const BASE_URL = process.env.SITE_URL || 'https://ilya.as/mom/';
const BASE = BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/';

const pad = (n) => (n < 10 ? '0' : '') + n;
const written = [];

function write(rel, html) {
  const dir = path.join(BUILD, rel);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, html);
  written.push(rel || './');
}

function depth(rel) {
  // number of directories the document lives under, i.e. how many ../ are needed
  const clean = rel.replace(/\/$/, '');
  return clean === '' ? 0 : clean.split('/').length;
}

function page(rel, view, canonical, bodyClass) {
  const html = R.renderDocument(data, view, {
    base: BASE,
    canonical,
    bodyClass: bodyClass || ''
  }).replace('</head>',
    // All references are relative to <base href="SITE_URL/">, so they work at
    // /mom/ or at a domain root, and at any directory depth.
    '  <script src="data/site.json.js"></script>\n' +
    '  <script src="assets/render.js"></script>\n' +
    '  <script src="assets/app.js" defer></script>\n' +
    '</head>');
  write(rel, html);
}

/* ---- home + paged home ---- */
const pageCount = R.paginate(POSTS).length;
for (let p = 1; p <= pageCount; p++) {
  const rel = p === 1 ? '' : 'page/' + p + '/';
  const view = R.renderHome(data, p, BASE);
  page(rel, view, BASE + (p === 1 ? '' : 'page/' + p + '/'),
       p === 1 ? 'home blog' : 'paged paged-' + p);
}

/* ---- single posts ---- */
for (const post of POSTS) {
  const view = R.renderSingle(data, post, BASE);
  page('post/' + post.ID + '/', view, post.URL, 'single single-post');
}

/* ---- static pages (namespaced so /page/<n>/ stays pagination) ---- */
for (const pg of data.pages) {
  const view = R.renderPage(data, pg, BASE);
  page('static/' + pg.ID + '/', view, pg.URL, 'page');
}

/* ---- categories ---- */
const cats = {};
for (const p of POSTS) (p.categories || []).forEach((c) => { cats[c.slug] = c; });
for (const slug of Object.keys(cats)) {
  const view = R.renderCategory(data, slug, BASE);
  page('category/' + slug + '/', view, BASE + 'category/' + slug + '/', 'archive category');
}

/* ---- date archives: months present, years, and days with posts ---- */
const months = new Set(), years = new Set(), days = new Set();
for (const p of POSTS) {
  const y = p.date.slice(0, 4), m = p.date.slice(5, 7), d = p.date.slice(8, 10);
  years.add(y); months.add(y + '/' + m); days.add(y + '/' + m + '/' + d);
}
for (const y of [...years].sort()) {
  page('date/' + y + '/', R.renderYear(data, +y, BASE), BASE + y + '/', 'archive date');
}
for (const ym of [...months].sort()) {
  const [y, m] = ym.split('/').map(Number);
  page('date/' + y + '/' + pad(m) + '/', R.renderMonth(data, y, m, BASE),
       BASE + y + '/' + pad(m) + '/', 'archive date');
}
for (const ymd of [...days].sort()) {
  const [y, m, d] = ymd.split('/').map(Number);
  page('date/' + y + '/' + pad(m) + '/' + pad(d) + '/', R.renderDay(data, y, m, d, BASE),
       BASE + y + '/' + pad(m) + '/' + pad(d) + '/', 'archive date');
}

/* ---- 404 (served by GitHub Pages for any unknown path) ---- */
write('404', R.renderDocument(data, R.notFound(data, BASE), {
  base: BASE, canonical: BASE, bodyClass: 'error404'
}).replace('</head>', '  <script src="assets/app.js" defer></script>\n</head>'));

fs.writeFileSync(path.join(BUILD, '404.html'),
  fs.readFileSync(path.join(BUILD, '404', 'index.html')));
fs.rmSync(path.join(BUILD, '404'), { recursive: true, force: true });

/* ---- JSONP twin of the data so the whole site works from file:// ---- */
const json = fs.readFileSync(path.join(BUILD, 'data', 'site.json'), 'utf8');
fs.writeFileSync(path.join(BUILD, 'data', 'site.json.js'),
  'window.MOM_DATA = ' + json + ';\n');

/* ---- sitemap ---- */
const urls = POSTS.map((p) => '<url><loc>' + p.URL + '</loc><lastmod>' +
  (p.modified || p.date).slice(0, 10) + '</lastmod></url>').join('\n');
fs.writeFileSync(path.join(BUILD, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls + '\n</urlset>\n');

console.log('prerendered ' + written.length + ' documents + 404.html (home pages: ' + pageCount + ')');
