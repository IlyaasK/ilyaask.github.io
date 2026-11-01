/*
 * render.js — port of the WordPress "Simpla" theme + WordPress loop,
 * reduced to the handful of templates this blog actually rendered.
 *
 *   index.php          -> home page (paged, POSTS_PER_PAGE = 10)
 *   single.php         -> one entry + its comment thread
 *   page.php           -> a static page
 *   archive.php        -> date archives (year / month / day) + category
 *   search.php         -> search results (client-side only)
 *   404                -> "Sorry, but you are looking for something that
 *                         isn't here."
 *
 * Runs unchanged in the browser, in Node (for prerendering) and as a
 * string in a hand-rolled test runner. No dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MomRender = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug',
    'Sep', 'Oct', 'Nov', 'Dec'];

  /* ------------------------------------------------------------------
   * escaping / formatting helpers
   * ------------------------------------------------------------------ */
  var ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ENT[c]; });
  }
  function attr(s) { return esc(s); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // The site ran with timezone UTC; mirror PHP's date() on UTC values.
  function parseUTC(iso) { return new Date(iso); }

  /** "June 19, 2006" (the_archive_title / entry date) */
  function dateLong(iso) {
    var d = parseUTC(iso);
    return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  }
  /** "June 23, 2006 at 11:17 pm"  (comment metadata) */
  function dateComment(iso) {
    var d = parseUTC(iso);
    var h = d.getUTCHours();
    var ampm = h >= 12 ? 'pm' : 'am';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return dateLong(iso) + ' at ' + h12 + ':' + pad(d.getUTCMinutes()) + ' ' + ampm;
  }
  /** 2006-06-19  (rfc-ish, for <time datetime>) */
  function dateISO(iso) { return parseUTC(iso).toISOString().slice(0, 10); }

  function pluralize(n, one, many) { return n === 1 ? one : many; }

  /* ------------------------------------------------------------------
   * site model helpers
   * ------------------------------------------------------------------ */
  function byDateDesc(a, b) {
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  }
  function postsSorted(data) { return data.posts.slice().sort(byDateDesc); }

  function postById(data, id) {
    var all = data.posts.concat(data.pages);
    for (var i = 0; i < all.length; i++) if (all[i].ID === id) return all[i];
    return null;
  }

  function featuredImage(data, post) {
    if (post.featured_image) return post.featured_image;
    // WordPress fell back to the first <img> in the body — usually not set
    // on this blog, but keep the behaviour faithful.
    return null;
  }

  /* ------------------------------------------------------------------
   * partials
   * ------------------------------------------------------------------ */
  function header(data, base) {
    return '' +
      '<div id="header">\n' +
      '\t\t<h1><a href="' + attr(base) + '">' + esc(data.site.title) + '</a></h1>\n' +
      '\t\t<p class="description">' + esc(data.site.description) + '</p>\n' +
      '\t\t\t</div><!-- / #header -->\n';
  }

  function categoryLinks(post) {
    var cats = post.categories || [];
    if (!cats.length) return '';
    return cats.map(function (c) {
      return '<a href="category/' + attr(c.slug) + '/" rel="category tag">' + esc(c.title || c.name) + '</a>';
    }).join(', ');
  }

  function commentCountLink(post) {
    var n = post.comments.length;
    var href = 'post/' + post.ID + '/#comments';
    if (n === 0) {
      return '<a href="post/' + post.ID + '/#respond" class="commentslink">' +
        'Leave a Comment &raquo;</a>';
    }
    return '<a href="' + attr(href) + '" class="commentslink">' +
      n + ' ' + pluralize(n, 'Comment', 'Comments') + ' &raquo;</a>';
  }

  function entryMeta(post, base) {
    var author = (post.author && (post.author.name || post.author.display_name || post.author.nice_name)) || '';
    var cats = categoryLinks(post);
    return '' +
      '\t<div class="entrymeta">\n' +
      '\t<div class="postinfo">\n' +
      '\t\t<span class="postedby">Posted by ' + esc(author) + '</span><br />\n' +
      (cats ? '\t\t\t\t\t<span class="filedto">Filed in ' + cats + '</span><br />\n' : '') +
      '\t\t\t\t\t\t\t</div>\n' +
      '\t' + commentCountLink(post) + '\t</div>\n';
  }

  /** index.php entry: title is a permalink, body is the_content() */
  function entryArchive(data, post, base, counter) {
    var title = post.title || '';
    return '' +
      '<div class="entry entry-' + counter + ' post-' + post.ID +
      ' post type-post status-publish format-standard hentry" id="post-' + post.ID + '">\n' +
      '\t<div class="entrytitle">\n' +
      '\t\t<h2>\n' +
      '\t\t\t\t\t<a href="post/' + post.ID + '/" rel="bookmark">' + title + '</a>\n' +
      '\t\t\t\t</h2>\n' +
      '\t\t<h3>' + dateLong(post.date) + '</h3>\n' +
      '\t</div>\n' +
      '\t<div class="entrybody">\n' +
      '\t\t' + post.content + '\t\t\t</div>\n\n' +
      entryMeta(post, base) +
      '\n</div>\n' +
      '<div class="commentsblock">\n' +
      '\t' + (data.settings && data.settings.ads ? '' : '') + '</div>\n';
  }

  /** single.php entry: plain title, body + comment thread */
  function entrySingle(data, post, base) {
    var title = post.title || '';
    return '' +
      '<div class="entry entry-1 post-' + post.ID +
      ' post type-post status-publish format-standard hentry" id="post-' + post.ID + '">\n' +
      '\t<div class="entrytitle">\n' +
      '\t\t<h2>\n' +
      '\t\t\t\t\t' + title + '\n' +
      '\t\t\t\t</h2>\n' +
      '\t\t<h3>' + dateLong(post.date) + '</h3>\n' +
      '\t</div>\n' +
      '\t<div class="entrybody">\n' +
      '\t\t' + post.content + '\t\t\t</div>\n\n' +
      entryMeta(post, base) +
      '\n</div>\n' +
      '<div class="commentsblock">\n' +
      '\t\t' + commentThread(post, base) + '\n' +
      '</div>\n';
  }

  /** The comment list — chronological, flat (as WordPress renders depth 1). */
  function commentThread(post, base) {
    var comments = post.comments || [];
    var out = '';
    if (comments.length) {
      var n = comments.length;
      out += '\t\t<h3 id="comments">' + n + ' ' +
        pluralize(n, 'Response', 'Responses') + ' to &ldquo;' +
        (post.title || '') + '&rdquo;</h3>\n\n' +
        '\t<ol class="commentlist">\n';
      comments.forEach(function (c, i) {
        var cls = 'comment ' + (i % 2 === 0 ? 'even' : 'odd alt') + ' thread-' +
          (i % 2 === 0 ? 'even' : 'odd') + ' depth-1';
        var name = c.name || 'Anonymous';
        var site = c.author_url || '';
        out += '\t<li class="' + cls + '" id="comment-' + c.ID + '">\n' +
        '\t<div id="div-comment-' + c.ID + '">\n' +
        '\t<div class="comment-author vcard">\n' +
        (c.avatar ? '\t\t<img class="avatar avatar-32" height="32" width="32" ' +
          'alt="' + attr(name) + '&#039;s avatar" src="' + attr(c.avatar) + '" />' : '') +
        '\t\t<cite class="fn">' + authorLink(c) + '</cite> Says:\n' +
        '\t</div>\n\t\t<br />\n\n' +
        '\t<small class="comment-meta commentmetadata">' +
        '<a href="post/' + post.ID + '/#comment-' + c.ID + '" title="">' +
        dateComment(c.date) + '</a> </small>\n\n' +
        '\t' + c.content + '\n' +
        '\t</div>\n' +
        '</li><!-- #comment-## -->\n';
      });
      out += '\t</ol>\n';
      return out;
    }
    if (post.discussion && post.discussion.comments_open === false) {
      return '\t<h3 id="comments">Comments are closed.</h3>\n';
    }
    return '';
  }

  function authorLink(c) {
    var name = esc(c.name || 'Anonymous');
    if (c.author_url) {
      return '<a href="' + attr(c.author_url) + '" class="url" rel="ugc external nofollow">' + name + '</a>';
    }
    return name;
  }

  /* ------------------------------------------------------------------
   * sidebar — the widgets the blog had, in archive order:
   * Archives, Blog Stats, Categories, Pages, Recent Comments
   * ------------------------------------------------------------------ */
  function sidebar(data, base) {
    var posts = postsSorted(data);

    // Archives: group by year-month, newest first
    var months = {};
    posts.forEach(function (p) {
      var k = p.date.slice(0, 7);
      if (!months[k]) months[k] = { key: k, count: 0, year: p.date.slice(0, 4), month: +p.date.slice(5, 7) };
      months[k].count++;
    });
    var monthList = Object.keys(months).sort().reverse().map(function (k) {
      var m = months[k];
      return '\t\t\t\t\t<li><a href="date/' + m.year + '/' + pad(m.month) + '/">' +
        MONTHS[m.month - 1] + ' ' + m.year + '</a></li>';
    }).join('\n');

    // Categories
    var cats = {};
    posts.forEach(function (p) {
      (p.categories || []).forEach(function (c) { cats[c.slug] = c; });
    });
    var order = (data.site.category_order || []);
    var catList = Object.keys(cats).sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia < 0) ia = order.length + (cats[a].ID || 0);
      if (ib < 0) ib = order.length + (cats[b].ID || 0);
      return ia - ib;
    }).map(function (slug) {
      var c = cats[slug];
      return '\t\t\t\t\t<li class="cat-item cat-item-' + (c.ID || '') + '">' +
        '<a href="category/' + attr(slug) + '/">' + esc(c.title || c.name) + '</a>\n</li>';
    }).join('\n');

    // Pages
    var pageList = (data.pages || []).map(function (p) {
      return '\t\t\t\t<li class="page_item page-item-' + p.ID + '">' +
        '<a href="page/' + p.ID + '/">' + (p.title || '') + '</a></li>';
    }).join('\n');

    // Recent comments (5), newest first, with gravatar + author link
    var recent = [];
    posts.forEach(function (p) {
      (p.comments || []).forEach(function (c) { recent.push({ c: c, p: p }); });
    });
    recent.sort(function (a, b) { return a.c.ID - b.c.ID; }).reverse();
    recent = recent.slice(0, 5);
    var recentRows = recent.map(function (r, i) {
      var c = r.c;
      var link = c.author_url ? ' href="' + attr(c.author_url) + '" rel="nofollow"' : '';
      var pos = i === 0 ? 'top' : 'end';
      return '\t\t\t\t\t<tr><td title="' + attr(c.name) + '" class="recentcommentsavatar' + pos +
        '" style="height:48px; width:48px;"><a' + link + '>' +
        (c.avatar ? '<img alt="' + attr(c.name) + '&#039;s avatar" src="' + attr(c.avatar) + '" class="avatar avatar-48" height="48" width="48" loading="lazy" />' : '') +
        '</a></td><td class="recentcommentstext' + pos + '" style="">' +
        (c.author_url ? '<a' + link + '>' : '<span>') + esc(c.name) + (c.author_url ? '</a>' : '</span>') +
        ' on <a href="post/' + r.p.ID + '/#comment-' + c.ID + '">' + (r.p.title || '') + '</a></td></tr>';
    }).join('');

    return '' +
      '<ul id="sidebar">\n' +
      '<li id="archives-2" class="widget widget_archive"><h2 class="widgettitle">Archives</h2>\n\n' +
      '\t\t\t<ul>\n' + monthList + '\n\t\t\t</ul>\n\n\t\t\t</li>\n' +
      '<li id="blog-stats-2" class="widget widget_blog-stats"><h2 class="widgettitle">Blog Stats</h2>\n' +
      '\t\t<ul>\n\t\t\t<li>' + (data.site.hits || 0).toLocaleString('en-US') + ' hits</li>\n\t\t</ul>\n\t\t</li>\n' +
      '<li id="categories-1" class="widget widget_categories"><h2 class="widgettitle">Categories</h2>\n\n' +
      '\t\t\t<ul>\n' + catList + '\n\t\t\t</ul>\n\n\t\t\t</li>\n' +
      '<li id="pages-2" class="widget widget_pages"><h2 class="widgettitle">Pages</h2>\n\n' +
      '\t\t\t<ul>\n' + pageList + '\n\t\t\t</ul>\n\n\t\t\t</li>\n' +
      '<li id="recent-comments-2" class="widget widget_recent_comments"><h2 class="widgettitle">Recent Comments</h2>\n' +
      '\t\t\t\t<table class="recentcommentsavatar" cellspacing="0" cellpadding="0" border="0">\n' +
      '\t\t\t\t\t' + recentRows + '</table></li>\n' +
      '</ul>';
  }

  /* ------------------------------------------------------------------
   * page templates
   * ------------------------------------------------------------------ */
  var POSTS_PER_PAGE = 10;

  function paginate(posts) {
    var out = [];
    for (var i = 0; i < posts.length; i += POSTS_PER_PAGE) out.push(posts.slice(i, i + POSTS_PER_PAGE));
    return out;
  }

  function pageTitle(text) {
    return '<div class="entrytitle page-title"><h2>' + text + '</h2></div>\n';
  }

  /** index.php — $page is 1-based */
  function renderHome(data, page, base) {
    var pages = paginate(postsSorted(data));
    page = Math.max(1, Math.min(page || 1, pages.length));
    var posts = pages[page - 1] || [];
    var body = posts.map(function (p, i) { return entryArchive(data, p, base, i + 1); }).join('');

    var nav = '';
    if (pages.length > 1) {
      var older = page < pages.length
        ? '<a href="' + (page + 1 === 2 ? '' : 'page/' + (page + 1) + '/') + '">&laquo; Older Entries</a>'
        : '';
      var newer = page > 1
        ? '<a href="' + (page - 1 === 1 ? '' : 'page/' + (page - 1) + '/') + '">Newer Entries &raquo;</a>'
        : '';
      nav = '\n\t\t\t<div class="navigation">\n' +
        '\t\t\t<div class="alignleft">' + older + '</div>\n' +
        '\t\t\t<div class="alignright">' + newer + '</div>\n' +
        '\t\t</div>\n';
    }
    return { title: data.site.title, body: body + nav, isHome: true, canonicalPage: page };
  }

  function renderSingle(data, post, base) {
    var posts = postsSorted(data);
    var idx = -1;
    for (var i = 0; i < posts.length; i++) if (posts[i].ID === post.ID) { idx = i; break; }
    var nav = '';
    // WordPress shows the chronologically *older* post on the left
    var older = idx >= 0 ? posts[idx + 1] : null;
    var newer = idx > 0 ? posts[idx - 1] : null;
    // index.php counts from newest = 1, so entry-N is the reverse position
    var entryN = idx >= 0 ? idx + 1 : 1;
    if (older || newer) {
      nav = '\n\t\t\t<div class="navigation">\n' +
        '\t\t\t<div class="alignleft">' + (older
          ? '<a href="post/' + older.ID + '/" rel="prev"><span class="meta-nav">&laquo;</span> ' + (older.title || '') + '</a>'
          : '') + '</div>\n' +
        '\t\t\t<div class="alignright">' + (newer
          ? '<a href="post/' + newer.ID + '/" rel="next">' + (newer.title || '') + ' <span class="meta-nav">&raquo;</span></a>'
          : '') + '</div>\n' +
        '\t\t</div>\n';
    }
    return { title: esc(stripTags(post.title)) + ' | ' + esc(data.site.title), body: entrySingle(data, post, base) + nav, post: post, entryN: entryN };
  }

  function renderPage(data, page, base) {
    var body = '' +
      '<div class="entry entry-1 page-' + page.ID + ' page type-page" id="post-' + page.ID + '">\n' +
      '\t<div class="entrytitle">\n' +
      '\t\t<h2>\n' +
      '\t\t\t\t\t' + (page.title || '') + '\n' +
      '\t\t\t\t</h2>\n' +
      '\t\t<h3>' + dateLong(page.date) + '</h3>\n' +
      '\t</div>\n' +
      '\t<div class="entrybody">\n' +
      '\t\t' + page.content + '\t\t\t</div>\n\n' +
      '</div>\n' +
      '<div class="commentsblock">\n\t\t</div>\n';
    return { title: esc(stripTags(page.title)) + ' | ' + esc(data.site.title), body: body, page: page };
  }

  /** archive.php for a given month (year, month) */
  function renderMonth(data, year, month, base) {
    var posts = postsSorted(data).filter(function (p) {
      return +p.date.slice(0, 4) === +year && +p.date.slice(5, 7) === +month;
    });
    return renderArchiveList(data, posts, MONTHS[month - 1] + ' ' + year, base,
      MONTHS[month - 1] + ' | ' + year);
  }

  function renderYear(data, year, base) {
    var posts = postsSorted(data).filter(function (p) { return +p.date.slice(0, 4) === +year; });
    // a year archive's <title> is just the blog title, as WordPress did
    var v = renderArchiveList(data, posts, String(year), base);
    v.title = esc(data.site.title);
    return v;
  }

  function renderDay(data, year, month, day, base) {
    var posts = postsSorted(data).filter(function (p) {
      return +p.date.slice(0, 4) === +year && +p.date.slice(5, 7) === +month && +p.date.slice(8, 10) === +day;
    });
    return renderArchiveList(data, posts, MONTHS[month - 1] + ' ' + day + ', ' + year, base,
      (day < 10 ? '0' : '') + day + ' | ' + MONTHS[month - 1] + ' | ' + year);
  }

  function renderCategory(data, slug, base) {
    var posts = postsSorted(data).filter(function (p) {
      return (p.categories || []).some(function (c) { return c.slug === slug; });
    });
    var name = slug;
    for (var i = 0; i < posts.length; i++) {
      var c = (posts[i].categories || []).filter(function (c) { return c.slug === slug; })[0];
      if (c) { name = c.title || c.name || slug; break; }
    }
    if (!posts.length) {
      // still resolve a name from any post
      data.posts.forEach(function (p) {
        (p.categories || []).forEach(function (c) { if (c.slug === slug) name = c.title || c.name; });
      });
    }
    return renderArchiveList(data, posts, name, base, name);
  }

  function renderArchiveList(data, posts, title, base, docTitle) {
    if (!posts.length) return notFound(data, base);
    var body = pageTitle(esc(title)) +
      posts.map(function (p, i) { return entryArchive(data, p, base, i + 1); }).join('');
    var t = docTitle || stripTags(title);
    return { title: esc(t) + ' | ' + esc(data.site.title), body: body };
  }

  function renderSearch(data, q, base) {
    var needle = (q || '').toLowerCase();
    var posts = postsSorted(data).filter(function (p) {
      var hay = stripTags(p.title) + ' ' + stripTags(p.content);
      return hay.toLowerCase().indexOf(needle) !== -1;
    });
    if (!needle) posts = [];
    var title = 'Search Results for \u201c' + esc(q) + '\u201d';
    return {
      title: esc('Search Results for “' + q + '”') + ' | ' + esc(data.site.title),
      body: pageTitle(title) + (posts.length
        ? posts.map(function (p, i) { return entryArchive(data, p, base, i + 1); }).join('')
        : '<p>Sorry, no posts matched your criteria.</p>')
    };
  }

  function notFound(data, base) {
    return {
      title: 'Not Found | ' + esc(data.site.title),
      body: '<div class="entry"><div class="entrybody">Sorry, but you are looking for ' +
        'something that isn\'t here.</div></div>\n',
      status: 404
    };
  }

  function stripTags(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '');
  }

  /* ------------------------------------------------------------------
   * full document
   * ------------------------------------------------------------------ */
  function renderDocument(data, view, opts) {
    var base = opts.base || '';
    var site = data.site;
    var title = view.title || site.title;
    var canonical = opts.canonical
      ? '<link rel="canonical" href="' + attr(opts.canonical) + '">\n'
      : '';
    return '<!DOCTYPE html>\n' +
      '<html lang="en">\n' +
      '<head>\n' +
      '<meta charset="utf-8">\n' +
      '<title>' + title + '</title>\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<base href="' + attr(base || '') + '">\n' +
      '<meta name="description" content="' + attr(stripTags(site.description)) + '">\n' +
      canonical +
      '<link rel="stylesheet" href="assets/style.css">\n' +
      '</head>\n' +
      '<body class="' + (opts.bodyClass || '') + '">\n' +
      '<div id="wrap">\n' +
      header(data, base) +
      '<div id="content">\n' +
      view.body +
      '</div>\n' +
      sidebar(data, base) +
      '\n</div><!-- / #wrap -->\n' +
      '<div id="footer">\n' +
      '\t<a href="https://wordpress.com/?ref=footer_blog" rel="nofollow">Blog at WordPress.com.</a>\n' +
      '</div><!-- / #footer -->\n' +
      '</body>\n' +
      '</html>\n';
  }

  return {
    esc: esc,
    attr: attr,
    dateLong: dateLong,
    dateComment: dateComment,
    stripTags: stripTags,
    postsSorted: postsSorted,
    postById: postById,
    paginate: paginate,
    sidebar: sidebar,
    renderHome: renderHome,
    renderSingle: renderSingle,
    renderPage: renderPage,
    renderMonth: renderMonth,
    renderYear: renderYear,
    renderDay: renderDay,
    renderCategory: renderCategory,
    renderSearch: renderSearch,
    notFound: notFound,
    renderDocument: renderDocument,
    POSTS_PER_PAGE: POSTS_PER_PAGE
  };
}));
