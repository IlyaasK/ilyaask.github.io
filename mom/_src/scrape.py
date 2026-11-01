#!/usr/bin/env python3
"""
Scrape seekingjannah.wordpress.com into a static data file + local assets.

Sources:
  * public-api.wordpress.com REST v1.1  (posts, pages, comments)
  * i0.wp.com image CDN /sites/<site>/cds/... (mirrored copies of the
    long-dead blogger.com + flickr.com photos)
  * gravatar for commenter avatars

Everything is cached in ./cache so re-runs are offline and reproducible.
"""
import hashlib
import html as htmllib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

SITE = "seekingjannah.wordpress.com"
SITE_ID = 243904
API = f"https://public-api.wordpress.com/rest/v1.1/sites/{SITE}/"
UA = "Mozilla/5.0 (X11; Linux x86_64) mom-site-archiver/1.0"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build")
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
os.makedirs(CACHE, exist_ok=True)


def get(url, binary=False, retries=4):
    key = hashlib.sha1(url.encode()).hexdigest()
    path = os.path.join(CACHE, key)
    meta = path + ".url"
    if os.path.exists(path) and os.path.exists(meta):
        data = open(path, "rb").read()
        return data if binary else data.decode("utf-8", "replace")
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            open(path, "wb").write(data)
            open(meta, "w").write(url)
            return data if binary else data.decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"GET failed {url}: {last}")


def api(path):
    return json.loads(get(API + path.lstrip("/")))


# --------------------------------------------------------------------------
# 1. posts + pages
# --------------------------------------------------------------------------
print("fetching posts ...")
posts = api("posts/?number=100&type=post")["posts"]
pages = api("posts/?number=100&type=page")["posts"]
print(f"  {len(posts)} posts, {len(pages)} pages")

records = {}
for kind, items in (("post", posts), ("page", pages)):
    for stub in items:
        full = api(f"posts/{stub['ID']}")
        records[full["ID"]] = full

# --------------------------------------------------------------------------
# 2. comments (per post, so we get ordering + reply parents)
# --------------------------------------------------------------------------
print("fetching comments ...")
for pid, rec in records.items():
    if rec.get("discussion", {}).get("comment_count", 0) == 0:
        rec["_comments"] = []
        continue
    replies = api(f"posts/{pid}/replies/?number=100&order=ASC&fields=ID,post_ID,author,date,content,parent,URL,avatar_URL,type,site_ID")
    rec["_comments"] = sorted(replies.get("comments", []), key=lambda c: (c["date"], c["ID"]))
    print(f"  post {pid}: {len(rec['_comments'])} comments")

# --------------------------------------------------------------------------
# 3. images -> local files
# --------------------------------------------------------------------------
os.makedirs(os.path.join(OUT, "assets", "img"), exist_ok=True)
os.makedirs(os.path.join(OUT, "assets", "avatar"), exist_ok=True)

EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
img_map_alias = {}  # url -> final local path when the extension had to change


def local_name(url):
    """Stable, readable local filename for a remote image url."""
    path = urllib.parse.urlparse(url).path
    base = urllib.parse.unquote(os.path.basename(path))
    if not base or base == "/":
        # hashless gravatar (legacy Blogger commenters): ".../avatar/?s=32"
        base = "anonymous"
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base)
    stem, ext = os.path.splitext(base)
    ext = ext.lower() or ".jpg"
    if ext not in EXT:
        ext = ".jpg"
    dig = hashlib.sha1(url.encode()).hexdigest()[:8]
    return f"{stem[:60]}-{dig}{ext}"


def mirror(url, folder):
    """Download `url` (and, for i0.wp.com, also try the full-size original)."""
    rel = f"assets/{folder}/{local_name(url)}"
    dest = os.path.join(OUT, rel)
    if not os.path.exists(dest):
        data = get(url, binary=True)
        open(dest, "wb").write(data)
        # gravatar answers application/png for hashless avatars; make the
        # extension match the bytes so local servers send the right type
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            new_rel, _ = os.path.splitext(rel)
            new_rel += ".png"
            os.rename(dest, os.path.join(OUT, new_rel))
            if rel != new_rel:
                # remember the swap so rewrite() uses the right path
                img_map_alias[url] = new_rel
            return new_rel
        if data[:6] in (b"GIF87a", b"GIF89a"):
            new_rel, _ = os.path.splitext(rel)
            new_rel += ".gif"
            os.rename(dest, os.path.join(OUT, new_rel))
            if rel != new_rel:
                img_map_alias[url] = new_rel
            return new_rel
    return rel


img_map = {}        # remote url -> local rel path
img_map_alias = {}  # url -> final path, when the extension had to change
other_files = []  # multipart configs / pdfs we also want


def note(url):
    if not url:
        return
    url = htmllib.unescape(url.strip())
    if not url.startswith("http"):
        return
    low = url.split("?")[0].lower()
    if low.endswith(tuple(EXT)):
        img_map[url] = mirror(url, "img")
        img_map[url] = img_map_alias.get(url, img_map[url])
    elif low.endswith((".pdf", ".doc", ".zip")):
        other_files.append(url)


# content images
for rec in records.values():
    for m in re.finditer(r'(?:src|href)="([^"]+)"', rec.get("content", "")):
        note(m.group(1))
    if rec.get("featured_image"):
        note(rec["featured_image"])

# comment images (commenters pasted flickr photos etc.)
for rec in records.values():
    for c in rec["_comments"]:
        for m in re.finditer(r'src=["\']([^"\']+)["\']', c.get("content", "")):
            note(m.group(1))

# commenter avatars
print(f"  {len(img_map)} content images")
print("fetching avatars ...")
for rec in records.values():
    for c in rec["_comments"]:
        au = c.get("avatar_URL") or (c.get("author") or {}).get("avatar_URL")
        if au:
            rel = mirror(au, "avatar")
            c["_avatar"] = img_map_alias.get(au, rel)

# --------------------------------------------------------------------------
# 4. rewrite content: absolute remote image urls -> local paths
# --------------------------------------------------------------------------
def rewrite(fragment, depth=0):
    """Make remote image urls local; paths stay relative to the document's
    <base>, so no ../ juggling is needed at any depth."""
    up = ""

    def repl(m):
        attr, url = m.group(1), m.group(2)
        clean = htmllib.unescape(url.strip())
        if clean in img_map:
            return f'{attr}="{up}{img_map[clean]}"'
        # wp.com resized variants of the same image (?w=500 etc.)
        bare = clean.split("?")[0]
        if bare in img_map:
            m_q = re.search(r"\?([^\"']*)$", url)
            return f'{attr}="{up}{img_map[bare]}?{m_q.group(1)}"' if m_q else f'{attr}="{up}{img_map[bare]}"'
        return m.group(0)

    return re.sub(r'(src|href)="([^"]+)"', repl, fragment)


# Paths inside content are left relative to <base> (which every document
# sets), so the same markup works at /mom/ and at a domain root, at any
# directory depth.
for rec in records.values():
    rec["content_abs"] = rewrite(rec.get("content", ""))
    for c in rec["_comments"]:
        c["_content_abs"] = rewrite(c.get("content", ""))

# --------------------------------------------------------------------------
# 5. sidebar "recent comments" widget source (from the live homepage)
# --------------------------------------------------------------------------
print("fetching homepage for widget data ...")
home_html = get(f"https://{SITE}/")

# --------------------------------------------------------------------------
# 6. emit data file
# --------------------------------------------------------------------------
def slim(rec):
    keep = [
        "ID", "URL", "slug", "title", "date", "modified", "excerpt", "content",
        "featured_image", "categories", "tags", "author", "type", "status",
        "discussion", "like_count", "menu_order",
    ]
    out = {k: rec.get(k) for k in keep}
    # categories arrive as {"Name": {...}}; keep post order, drop API noise
    cats = rec.get("categories") or {}
    out["categories"] = [
        {"ID": c.get("ID"), "name": c.get("name"), "slug": c.get("slug")}
        for c in (cats.values() if isinstance(cats, dict) else cats)
    ]
    out["tags"] = [
        {"name": t.get("name"), "slug": t.get("slug")}
        for t in (rec.get("tags") or {}).values()
    ]
    out["content"] = rec["content_abs"]
    out["parent"] = rec.get("parent", 0)
    out["comments"] = [
        {
            "ID": c["ID"],
            "date": c["date"],
            "name": (c.get("author") or {}).get("name") or c.get("name"),
            "nice_name": (c.get("author") or {}).get("nice_name"),
            "author_url": (c.get("author") or {}).get("URL") or None,
            "avatar": c.get("_avatar"),
            "parent": c.get("parent"),
            "content": c["_content_abs"],
            "type": c.get("type", "comment"),
            "site_id": c.get("site_ID") or (c.get("author") or {}).get("site_ID"),
        }
        for c in rec["_comments"]
    ]
    return out


data = {
    "site": {
        "title": "My sojourn through life;as I seek Jannah\u2026",
        "description": "Just another Wordpress.com weblog",
        "url": f"https://{SITE}/",
        "blog_id": SITE_ID,
        "hits": 2454,
    },
    "posts": sorted(
        [slim(r) for r in records.values() if r["type"] == "post"],
        key=lambda r: r["date"], reverse=True,
    ),
    "pages": sorted(
        [slim(r) for r in records.values() if r["type"] == "page"],
        key=lambda r: r["menu_order"] or 0,
    ),
}
os.makedirs(os.path.join(OUT, "data"), exist_ok=True)
with open(os.path.join(OUT, "data", "site.json"), "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)

print(f"wrote data/site.json "
      f"({len(data['posts'])} posts, {len(data['pages'])} pages, "
      f"{sum(len(p['comments']) for p in data['posts'] + data['pages'])} comments, "
      f"{len(img_map)} images)")
