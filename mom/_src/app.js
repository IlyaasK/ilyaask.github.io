/*
 * app.js — client-side router / renderer for the archived blog.
 *
 * The whole site is one HTML document; every URL below is resolved in the
 * browser against data/site.json. Routes mirror the original WordPress
 * permalinks (relative to this directory):
 *
 *   (empty)                        /                    home, page 1
 *   page/2/                        /page/2/             home, page 2
 *   post/<ID>/                     /2006/06/19/yasir/   a single entry
 *   page/<ID>/                     /about/              a static page
 *   category/<slug>/               /category/motherhood/
 *   date/<YYYY>/                   /2006/
 *   date/<YYYY>/<MM>/              /2006/06/
 *   date/<YYYY>/<MM>/<DD>/         /2006/06/19/
 *   search/?s=<q>
 *
 * Prerendered HTML (index.html, <id>/index.html) carries the same markup
 * for crawlers and for visitors without JavaScript; once this script
 * boots it takes over and further navigation is instant.
 */
(function () {
  'use strict';

  var R = window.MomRender;
  var MOUNT = document.getElementById('content');
  var base = document.querySelector('base') ? document.querySelector('base').href : location.href;
  var BASE_PATH = new URL(base).pathname;      // e.g. "/mom/" or "/"
  var data = null;

  /* ---------------- URL <-> route ---------------- */

  function currentPath() {
    var p = location.pathname;
    if (p.indexOf(BASE_PATH) === 0) p = p.slice(BASE_PATH.length);
    else p = p.replace(/^\//, '');
    if (p.indexOf('index.html') === 0) p = p.slice('index.html'.length);
    return p.replace(/^\/+/, '');
  }

  function parseRoute(path) {
    var clean = path.split('?')[0].replace(/\/+$/, '');
    var q = new URLSearchParams(location.search);
    if (clean === '') return { name: 'home', page: 1 };
    var m;
    if ((m = clean.match(/^page\/(\d+)$/))) return { name: 'home', page: +m[1] };
    if ((m = clean.match(/^post\/(\d+)$/))) return { name: 'single', id: +m[1] };
    // NB: page/<n>/ is home pagination; static pages live under /static/<ID>/
    // (the About page's ID is 2, which would otherwise shadow page 2).
    if ((m = clean.match(/^static\/(\d+)$/))) return { name: 'page', id: +m[1] };
    if ((m = clean.match(/^category\/([^/]+)$/))) return { name: 'category', slug: decodeURIComponent(m[1]) };
    if ((m = clean.match(/^date\/(\d{4})\/(\d{2})\/(\d{2})$/))) return { name: 'day', y: +m[1], m: +m[2], d: +m[3] };
    if ((m = clean.match(/^date\/(\d{4})\/(\d{2})$/))) return { name: 'month', y: +m[1], m: +m[2] };
    if ((m = clean.match(/^date\/(\d{4})$/))) return { name: 'year', y: +m[1] };
    if ((m = clean.match(/^search$/)) && q.get('s') !== null) return { name: 'search', q: q.get('s') };
    return null;
  }

  function routeUrl(path) { return BASE_PATH + path; }

  function entryPath(post, data) {
    var isPage = (data.pages || []).some(function (p) { return p.ID === post.ID; });
    return isPage ? 'static/' + post.ID + '/'
                  : 'post/' + post.ID + '/';
  }

  /* ---------------- data loading ---------------- */

  var ready;
  function load() {
    if (ready) return ready;
    if (window.MOM_DATA) { data = window.MOM_DATA; ready = Promise.resolve(data); return ready; }
    ready = fetch(new URL('data/site.json', base))
      .then(function (r) {
        if (!r.ok) throw new Error('site data ' + r.status);
        return r.json();
      })
      .then(function (d) { data = d; return d; });
    return ready;
  }

  /* ---------------- resolving a route to a view ---------------- */

  function viewFor(route) {
    if (route.name === 'home') return R.renderHome(data, route.page, base);
    if (route.name === 'single') {
      var p = R.postById(data, route.id);
      if (!p || p.type !== 'post') return R.notFound(data, base);
      return R.renderSingle(data, p, base);
    }
    if (route.name === 'page') {
      var pg = R.postById(data, route.id);
      if (!pg || pg.type !== 'page') return R.notFound(data, base);
      return R.renderPage(data, pg, base);
    }
    if (route.name === 'category') return R.renderCategory(data, route.slug, base);
    if (route.name === 'month') return R.renderMonth(data, route.y, route.m, base);
    if (route.name === 'year') return R.renderYear(data, route.y, base);
    if (route.name === 'day') return R.renderDay(data, route.y, route.m, route.d, base);
    if (route.name === 'search') return R.renderSearch(data, route.q, base);
    return R.notFound(data, base);
  }

  function canonicalFor(route) {
    var site = data.site.url.replace(/\/$/, '');
    if (route.name === 'home') return site + '/' + (route.page > 1 ? 'page/' + route.page + '/' : '');
    if (route.name === 'single') {
      var p = R.postById(data, route.id);
      return p ? p.URL : site + '/';
    }
    if (route.name === 'page') {
      var pg = R.postById(data, route.id);
      return pg ? pg.URL : site + '/';
    }
    if (route.name === 'category') return site + '/category/' + route.slug + '/';
    if (route.name === 'month') return site + '/' + route.y + '/' + pad2(route.m) + '/';
    if (route.name === 'year') return site + '/' + route.y + '/';
    if (route.name === 'day') return site + '/' + route.y + '/' + pad2(route.m) + '/' + pad2(route.d) + '/';
    return site + '/';
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------------- rendering ---------------- */

  function renderRoute(route, opts) {
    var view = viewFor(route);
    document.title = view.title;
    MOUNT.innerHTML = view.body;

    var can = document.querySelector('link[rel="canonical"]');
    if (can) can.setAttribute('href', canonicalFor(route));

    // Scroll to top on navigation, or to the comment anchor if asked.
    if (!opts || !opts.noScroll) {
      var hash = location.hash;
      if (hash && hash.indexOf('#comment-') === 0) {
        var el = document.getElementById(hash.slice(1));
        if (el) { el.scrollIntoView(); return; }
      }
      window.scrollTo(0, 0);
    }
  }

  function navigate(href, replace) {
    var url = new URL(href, location.href);
    var path = url.pathname.indexOf(BASE_PATH) === 0 ? url.pathname.slice(BASE_PATH.length) : url.pathname.replace(/^\//, '');
    var route = parseRoute(path);
    if (!route) { location.href = url.href; return false; }
    if (replace) history.replaceState({}, '', url.href);
    else history.pushState({}, '', url.href);
    renderRoute(route);
    return true;
  }

  /* ---------------- wiring ---------------- */

  function boot() {
    load().then(function () {
      var route = parseRoute(currentPath());
      if (!route) {
        // unknown path — a prerendered 404 page may already be in place
        if (document.body.getAttribute('data-prerendered') !== '404') renderRoute({ name: 'missing' });
        return;
      }
      // Trust prerendered markup on first paint (identical output anyway),
      // but re-render so relative widget links are correct at any depth.
      renderRoute(route, { noScroll: true });

      document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target.closest ? e.target.closest('a') : null;
        if (!a || a.target || a.hasAttribute('download')) return;
        if (a.getAttribute('rel') === 'nofollow' && /wordpress\.com/.test(a.href)) return;
        var url = new URL(a.href, location.href);
        if (url.origin !== location.origin) return;
        if (url.pathname.indexOf(BASE_PATH) !== 0) return;
        var path = url.pathname.slice(BASE_PATH.length);
        if (!parseRoute(path)) return;          // let the browser handle assets etc.
        e.preventDefault();
        navigate(url.href);
      });

      window.addEventListener('popstate', function () {
        var r = parseRoute(currentPath());
        renderRoute(r || { name: 'missing' });
      });

      document.addEventListener('submit', function (e) {
        var form = e.target;
        if (form && form.id === 'searchform') {
          e.preventDefault();
          var q = (form.querySelector('input[name="s"]') || {}).value || '';
          navigate(routeUrl('search/?s=' + encodeURIComponent(q)));
        }
      });
    }).catch(function (err) {
      // Leave the prerendered document untouched; it is already correct.
      if (window.console) console.warn('mom archive: client render unavailable —', err);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.MomApp = { navigate: navigate, load: load, parseRoute: parseRoute, viewFor: viewFor, currentPath: currentPath };
}());
