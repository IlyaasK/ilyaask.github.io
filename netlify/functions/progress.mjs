// Stores the /learn checkbox state server-side so it's the same on every device.
//
//   GET  /api/progress  -> { "<checkbox key>": 1, ... }
//   POST /api/progress  -> replaces the stored state with the posted object
//
// Unlocked by design: /learn is unlisted and the payload is just tick marks.
// The store is site-wide, so it survives deploys.

import { getStore } from "@netlify/blobs";

const STORE = "learn";
const KEY = "progress";
const MAX_KEY_LEN = 200;

// "strong" so a device reading right after another device writes doesn't get a
// stale view (default consistency is eventual, ~60s to propagate).
const open = () => getStore({ name: STORE, consistency: "strong" });

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

// Keep only truthy entries with sane string keys, so a stray payload can't
// bloat the blob or smuggle in non-checkbox data.
function sanitise(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const clean = {};
  for (const [key, flag] of Object.entries(value)) {
    if (typeof key !== "string") continue;
    if (key.length === 0 || key.length > MAX_KEY_LEN) continue;
    if (flag) clean[key] = 1;
  }
  return clean;
}

export default async (req) => {
  if (req.method === "GET") {
    try {
      const stored = await open().get(KEY, { type: "json" });
      return json(sanitise(stored) ?? {});
    } catch (error) {
      return json({ error: "read failed", detail: String(error) }, 500);
    }
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "body is not valid JSON" }, 400);
    }

    const clean = sanitise(body);
    if (!clean) return json({ error: "expected a JSON object" }, 400);

    try {
      await open().setJSON(KEY, clean);
    } catch (error) {
      return json({ error: "write failed", detail: String(error) }, 500);
    }
    return json({ ok: true, count: Object.keys(clean).length });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = {
  path: "/api/progress",
  method: ["GET", "POST"],
};
