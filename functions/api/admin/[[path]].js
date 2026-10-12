// /api/admin/* — back end of the site editor at /admin/.
//
// Jan changes text and photos right on her pages. Each "Publish" becomes one commit
// on GitHub, and Cloudflare Pages rebuilds the site from it in about a minute.
// Every change is kept, so History → Undo can put any page back.
// Only the inside of text elements and the photo files change; the HTML layout
// (sections, classes, order) can't be touched from the editor.
//
// Settings — wrangler.toml [vars]: GITHUB_REPO, GITHUB_BRANCH, EDITORS, ACCESS_TEAM, ACCESS_AUD
// Secret (Cloudflare dashboard, never in the repo): GITHUB_TOKEN
//   = fine-grained GitHub token for this repo only, permission "Contents: Read and write".
//
// Login: Cloudflare Access (one-time code by email) protects /admin and /api/admin.
// This file checks the Access token again and the email against EDITORS,
// so the API stays shut if Access is ever switched off.
//
// Routes:
//   GET  pages               every page that can be edited
//   GET  page?file=…         one page from GitHub, each element numbered (data-k)
//   GET  raw?path=images/…   a photo straight from GitHub (before Cloudflare has rebuilt)
//   POST save                {file, sha, texts: {k: html}, photos: [{k, data, ext, width, height}], drops: [k],
//                             removes: [k], adds: [{after: k, items: [{html, data, ext, width, height}]}]}
//                            removes / adds: photos taken out of, or put into, a photo group
//   GET  history             the latest editor changes
//   POST undo                {sha}

const PREFIX = "Site editor: ";

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function onRequest({ request, env, params }) {
  try {
    const email = await editorEmail(request, env);
    if (!email) throw new HttpError(401, "Please log in again.");
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) throw new HttpError(503, "The editor isn't connected to GitHub yet.");

    const route = (params.path || []).join("/");
    const url = new URL(request.url);
    const m = request.method;

    if (m === "GET" && route === "pages") return json(await listPages(env));
    if (m === "GET" && route === "page") return json(await getPage(env, url.searchParams.get("file")));
    if (m === "GET" && route === "raw") return await getRaw(env, url.searchParams.get("path"));
    if (m === "GET" && route === "history") return json(await history(env));
    if (m === "POST" && route === "save") return json(await save(env, email, await request.json()));
    if (m === "POST" && route === "undo") return json(await undo(env, email, await request.json()));
    throw new HttpError(404, "Not found.");
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    return json({ error: status === 500 ? "Something went wrong. Please try again." : err.message }, status);
  }
}

// ---------- Login ----------

let accessKeys = null; // cached signing keys of the Access team

async function editorEmail(request, env) {
  const host = new URL(request.url).hostname;
  if (env.DEV_NO_AUTH === "true" && (host === "localhost" || host === "127.0.0.1")) return "dev@localhost";

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_TEAM || !env.ACCESS_AUD) return null;
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  let header, payload;
  try {
    header = JSON.parse(b64urlText(h));
    payload = JSON.parse(b64urlText(p));
  } catch {
    return null;
  }

  if (!accessKeys) {
    const res = await fetch(`https://${env.ACCESS_TEAM}/cdn-cgi/access/certs`);
    if (!res.ok) return null;
    accessKeys = (await res.json()).keys || [];
  }
  const jwk = accessKeys.find((k) => k.kid === header.kid);
  if (!jwk) { accessKeys = null; return null; } // keys rotate; fetch fresh next time
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;

  // ACCESS_AUD may list several Access applications (e.g. the whole site and /api/admin).
  const auds = String(env.ACCESS_AUD).split(",").map((a) => a.trim()).filter(Boolean);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some((a) => auds.includes(a))) return null;
  if (payload.iss !== `https://${env.ACCESS_TEAM}`) return null;
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;

  const email = String(payload.email || "").toLowerCase();
  const allowed = String(env.EDITORS || "").toLowerCase().split(",").map((e) => e.trim()).filter(Boolean);
  return allowed.includes(email) ? email : null;
}

// ---------- Pages ----------

function editable(file) {
  return typeof file === "string" && /^[a-z0-9][a-z0-9/_-]*\.html$/i.test(file) &&
    !file.includes("..") && !file.startsWith("admin/") && !file.startsWith("originals/") && file !== "404.html";
}

async function listPages(env) {
  const tree = await gh(env, `/git/trees/${env.GITHUB_BRANCH}?recursive=1`);
  return { pages: tree.tree.filter((t) => t.type === "blob" && editable(t.path)).map((t) => t.path) };
}

async function getPage(env, file) {
  if (!editable(file)) throw new HttpError(400, "That page can't be edited.");
  const { sha, text } = await readFile(env, file, env.GITHUB_BRANCH);
  const base = "/" + file.split("/").slice(0, -1).map((d) => d + "/").join("");
  const html = await numbered(text, (el) => {
    if (el.tagName === "head") el.prepend(`<base href="${base}">`, { html: true });
  });
  return { file, sha, html };
}

// Gives every element its number in document order (data-k). Save uses the same
// numbering on the same version of the file, so a number always means one element.
function numbered(text, extra) {
  let i = 0;
  return new HTMLRewriter()
    .on("*", { element(el) { el.setAttribute("data-k", String(i++)); if (extra) extra(el); } })
    .transform(new Response(text)).text();
}

async function getRaw(env, path) {
  if (typeof path !== "string" || !/^images\/[a-z0-9/_.-]+\.(jpe?g|png|webp)$/i.test(path) || path.includes("..")) {
    throw new HttpError(400, "Not a photo.");
  }
  const res = await ghFetch(env, `/contents/${path}?ref=${env.GITHUB_BRANCH}`, { headers: { Accept: "application/vnd.github.raw" } });
  if (!res.ok) throw new HttpError(404, "Photo not found.");
  const type = /\.png$/i.test(path) ? "image/png" : /\.webp$/i.test(path) ? "image/webp" : "image/jpeg";
  return new Response(res.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=600" } });
}

// ---------- Save ----------

async function save(env, email, body) {
  const file = body && body.file;
  if (!editable(file)) throw new HttpError(400, "That page can't be edited.");

  const texts = new Map();
  for (const [k, html] of Object.entries(body.texts || {})) texts.set(Number(k), await cleanText(String(html)));
  const photos = new Map();
  for (const p of body.photos || []) {
    if (!/^(jpg|png)$/.test(p.ext) || typeof p.data !== "string" || !(p.width > 0) || !(p.height > 0)) {
      throw new HttpError(400, "That photo couldn't be read.");
    }
    photos.set(Number(p.k), p);
  }
  const drops = new Set((body.drops || []).map(Number));
  const removes = new Set((body.removes || []).map(Number));
  const adds = new Map();
  for (const a of body.adds || []) {
    const items = [];
    for (const it of a.items || []) {
      if (!/^(jpg|png)$/.test(it.ext) || typeof it.data !== "string" || !(it.width > 0) || !(it.height > 0)) {
        throw new HttpError(400, "That photo couldn't be read.");
      }
      const html = await cleanItem(String(it.html || ""));
      if (!html.includes('src="__NEW__"')) throw new HttpError(400, "That photo couldn't be added.");
      items.push({ ...it, html });
    }
    if (items.length) adds.set(Number(a.after), items);
  }
  const nAdds = [...adds.values()].reduce((n, list) => n + list.length, 0);
  if (!texts.size && !photos.size && !removes.size && !nAdds) throw new HttpError(400, "There's nothing to publish.");

  const head = await gh(env, `/git/ref/heads/${env.GITHUB_BRANCH}`);
  const headSha = head.object.sha;
  const current = await readFile(env, file, headSha);
  if (current.sha !== body.sha) throw new HttpError(409, "This page was changed somewhere else since you opened it. Reload the page and make your change again.");

  // New photo files go next to the other images; the page points to them.
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const up = "../".repeat(file.split("/").length - 1);
  const entries = [];
  for (const [k, p] of photos) {
    const path = `images/uploads/${stamp}-${k}.${p.ext}`;
    const blob = await gh(env, "/git/blobs", { method: "POST", body: { content: p.data, encoding: "base64" } });
    entries.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    p.src = up + path;
  }
  let n = 0;
  for (const [k, list] of adds) {
    for (const it of list) {
      const path = `images/uploads/${stamp}-${k}-${++n}.${it.ext}`;
      const blob = await gh(env, "/git/blobs", { method: "POST", body: { content: it.data, encoding: "base64" } });
      entries.push({ path, mode: "100644", type: "blob", sha: blob.sha });
      it.html = it.html.replace(/__NEW__/g, up + path);
    }
  }

  // Count elements on the untouched file first: what the rewrite does to an element's
  // insides must never shift the numbers of the elements after it.
  const kinds = new Map();
  for (const k of texts.keys()) kinds.set(k, "text");
  for (const k of photos.keys()) kinds.set(k, "photo");
  for (const k of drops) kinds.set(k, "drop");
  for (const k of removes) kinds.set(k, "remove");
  for (const k of adds.keys()) if (!kinds.has(k)) kinds.set(k, "add");
  const seen = new Set();
  let i = 0;
  const html = await new HTMLRewriter().on("*", {
    element(el) {
      const k = i++;
      const kind = kinds.get(k);
      if (!kind) return;
      seen.add(k);
      if (kind === "text") {
        el.setInnerContent(texts.get(k), { html: true });
      } else if (kind === "photo") {
        if (el.tagName !== "img") throw new HttpError(409, "The page layout changed. Reload the page and try again.");
        const p = photos.get(k);
        el.setAttribute("src", p.src);
        el.setAttribute("width", String(Math.round(p.width)));
        el.setAttribute("height", String(Math.round(p.height)));
        el.removeAttribute("srcset");
        el.removeAttribute("sizes");
      } else if (kind === "drop") {
        if (el.tagName === "source") el.remove(); // the old photo's other formats inside <picture>
      } else if (kind === "remove") {
        // A photo taken out of a group; photos added after it take its place.
        if (adds.has(k)) el.replace(adds.get(k).map((it) => it.html).join(""), { html: true });
        else el.remove();
        return;
      }
      if (adds.has(k)) el.after(adds.get(k).map((it) => it.html).join(""), { html: true });
    },
  }).transform(new Response(current.text)).text();
  if (seen.size !== kinds.size) throw new HttpError(409, "The page layout changed. Reload the page and try again.");

  const htmlBlob = await gh(env, "/git/blobs", { method: "POST", body: { content: html, encoding: "utf-8" } });
  entries.push({ path: file, mode: "100644", type: "blob", sha: htmlBlob.sha });

  const parts = [];
  if (texts.size) parts.push(`${texts.size} text change${texts.size > 1 ? "s" : ""}`);
  if (photos.size) parts.push(`${photos.size} new photo${photos.size > 1 ? "s" : ""}`);
  if (nAdds) parts.push(`${nAdds} photo${nAdds > 1 ? "s" : ""} added`);
  if (removes.size) parts.push(`${removes.size} photo${removes.size > 1 ? "s" : ""} removed`);
  const sha = await commit(env, headSha, entries, `${PREFIX}${file} – ${parts.join(", ")}`, email);
  return { ok: true, commit: sha };
}

// Keeps only plain inline text markup from an edited element; anything that could
// change the layout or run code is dropped.
const KEEP = new Set(["a", "strong", "b", "em", "i", "br", "span", "small", "sup", "sub", "abbr", "time", "u", "mark", "cite", "q"]);
const DROP = new Set(["script", "style", "iframe", "object", "embed", "template", "svg", "math", "img", "picture", "video", "audio",
  "source", "form", "input", "button", "select", "textarea", "link", "meta", "base", "noscript", "dialog"]);

function cleanText(html) {
  return new HTMLRewriter().on("*", {
    element(el) {
      const tag = el.tagName;
      if (DROP.has(tag)) return el.remove();
      if (!KEEP.has(tag)) return el.removeAndKeepContent();
      for (const [name, value] of [...el.attributes]) {
        const keep = name === "class" || name === "title" || name === "lang" || name.startsWith("aria-") ||
          (name.startsWith("data-") && name !== "data-k") ||
          (tag === "a" && (name === "href" || name === "target" || name === "rel")) ||
          (tag === "time" && name === "datetime");
        if (!keep || (name === "href" && /^\s*(javascript|data|vbscript):/i.test(value))) el.removeAttribute(name);
      }
    },
  }).transform(new Response(html)).text();
}

// A new photo in a group is a copy of its neighbour: plain boxes, the photo, a caption,
// small icons. The photo must be the new upload ("__NEW__"); nothing can run code.
const ITEM_TAGS = new Set(["figure", "figcaption", "picture", "img", "a", "div", "span", "p", "li", "strong", "em", "b", "i", "br", "small",
  "svg", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "g"]);
const SVG_ATTRS = new Set(["viewbox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "d", "cx", "cy", "r", "rx", "ry",
  "x", "y", "x1", "y1", "x2", "y2", "points", "xmlns", "transform"]);

function cleanItem(html) {
  return new HTMLRewriter().on("*", {
    element(el) {
      const tag = el.tagName;
      if (!ITEM_TAGS.has(tag)) return el.remove();
      if (tag === "img" && el.getAttribute("src") !== "__NEW__") return el.remove();
      for (const [name, value] of [...el.attributes]) {
        const keep = name === "class" || name === "alt" || name === "width" || name === "height" || name === "loading" ||
          name === "decoding" || name === "title" || name.startsWith("aria-") || (name.startsWith("data-") && name !== "data-k") ||
          (tag === "img" && name === "src") ||
          (tag === "a" && (name === "href" || name === "target" || name === "rel")) ||
          (name === "style" && !/url\(|expression|javascript/i.test(value)) ||
          SVG_ATTRS.has(name);
        const badHref = name === "href" && value !== "__NEW__" && !/^(https?:|mailto:|tel:|[a-z0-9._\/#-])/i.test(value);
        if (!keep || badHref || /^\s*(javascript|data|vbscript):/i.test(value)) el.removeAttribute(name);
      }
    },
  }).transform(new Response(html)).text();
}

// ---------- History and undo ----------

async function history(env) {
  const commits = await gh(env, `/commits?sha=${env.GITHUB_BRANCH}&per_page=60`);
  return {
    changes: commits
      .filter((c) => c.commit.message.startsWith(PREFIX))
      .slice(0, 20)
      .map((c) => ({ sha: c.sha, message: c.commit.message.slice(PREFIX.length), date: c.commit.author.date, by: c.commit.author.email })),
  };
}

async function undo(env, email, body) {
  const sha = body && body.sha;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) throw new HttpError(400, "Unknown change.");
  const change = await gh(env, `/commits/${sha}`);
  if (!change.commit.message.startsWith(PREFIX)) throw new HttpError(400, "Only changes made in the editor can be undone here.");
  const parent = change.parents[0].sha;

  const head = await gh(env, `/git/ref/heads/${env.GITHUB_BRANCH}`);
  const headSha = head.object.sha;
  const entries = [];
  for (const f of change.files) {
    if (f.status === "added") {
      entries.push({ path: f.filename, mode: "100644", type: "blob", sha: null }); // the new photo file
      continue;
    }
    // Only if the page is still exactly as that change left it (newer changes on it
    // undone or none made), or the newer change would be lost too.
    const now = await gh(env, `/contents/${f.filename}?ref=${headSha}`);
    const after = await gh(env, `/contents/${f.filename}?ref=${sha}`);
    if (now.sha !== after.sha) {
      throw new HttpError(409, "This page was changed again after that. Undo the newer change first.");
    }
    const before = await gh(env, `/contents/${f.filename}?ref=${parent}`);
    entries.push({ path: f.filename, mode: "100644", type: "blob", sha: before.sha });
  }
  const subject = change.commit.message.split("\n")[0].slice(PREFIX.length);
  const done = await commit(env, headSha, entries, `${PREFIX}Undo "${subject}"`, email);
  return { ok: true, commit: done };
}

// ---------- GitHub ----------

async function commit(env, headSha, entries, message, email) {
  const headCommit = await gh(env, `/git/commits/${headSha}`);
  const tree = await gh(env, "/git/trees", { method: "POST", body: { base_tree: headCommit.tree.sha, tree: entries } });
  const author = { name: `${email.split("@")[0]} (site editor)`, email, date: new Date().toISOString() };
  const made = await gh(env, "/git/commits", { method: "POST", body: { message, tree: tree.sha, parents: [headSha], author } });
  const res = await ghFetch(env, `/git/refs/heads/${env.GITHUB_BRANCH}`, { method: "PATCH", body: { sha: made.sha, force: false } });
  if (res.status === 422) throw new HttpError(409, "Someone else published at the same moment. Reload the page and try again.");
  if (!res.ok) throw new HttpError(502, `GitHub ${res.status}`);
  return made.sha;
}

async function readFile(env, path, ref) {
  const f = await gh(env, `/contents/${path}?ref=${ref}`);
  if (f.type !== "file" || typeof f.content !== "string") throw new HttpError(404, "Page not found.");
  const bin = atob(f.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return { sha: f.sha, text: new TextDecoder().decode(bytes) };
}

function ghFetch(env, path, init = {}) {
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "site-editor",
    ...(init.headers || {}),
  };
  let body = init.body;
  if (body && typeof body !== "string") { body = JSON.stringify(body); headers["Content-Type"] = "application/json"; }
  return fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, { method: init.method || "GET", headers, body });
}

async function gh(env, path, init) {
  const res = await ghFetch(env, path, init);
  if (res.status === 404) throw new HttpError(404, "Not found on GitHub.");
  if (!res.ok) throw new HttpError(502, `GitHub ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

// ---------- Helpers ----------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function b64urlBytes(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64urlText(s) {
  return new TextDecoder().decode(b64urlBytes(s));
}
