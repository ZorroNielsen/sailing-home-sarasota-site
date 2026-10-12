// Site editor (/admin/): tap any text to change it, tap a photo to replace it, then Publish.
// The page is shown exactly as on the website; only text inside elements and photo files
// can change, so the layout can't break. Back end: functions/api/admin/[[path]].js

(function () {
  const $ = (id) => document.getElementById(id);
  const frame = $("frame");
  const pageSel = $("page");
  const publishBtn = $("publish");
  const loading = $("loading");
  const fileInput = $("file");

  // Inline markup an editable text may contain (links, bold, line breaks…).
  const PHRASING = new Set(["A", "STRONG", "B", "EM", "I", "BR", "SPAN", "SMALL", "SUP", "SUB", "ABBR", "TIME", "U", "MARK", "CITE", "Q", "WBR"]);
  // Never editable: code, media, forms, and the header / footer / call bar, which are
  // copied into every page (a change on one page would leave the others different).
  const SKIP = "script, style, noscript, template, svg, select, textarea, iframe, video, audio, dialog, [hidden], " +
    ".site-header, .site-footer, .callbar, .skip";

  let page = null;            // { file, sha } of the open page
  let doc = null;             // the open page's document
  const changed = new Map();  // k → new html of an edited text
  const photos = new Map();   // k → { data, ext, width, height, drops }
  const labels = new Map();   // file → name shown in the page list
  let pages = [];

  const plainOnly = (function () {
    const d = document.createElement("div");
    d.contentEditable = "plaintext-only";
    return d.contentEditable === "plaintext-only";
  })();

  // ---------- Server ----------

  async function api(path, body) {
    let res;
    try {
      res = await fetch("/api/admin/" + path, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        credentials: "same-origin",
      });
    } catch (e) {
      // An expired login sends the request to the login page, which the browser blocks.
      throw new Error("Your login has expired. Reload this page to log in again.");
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  }

  // ---------- Page list ----------

  function words(s) {
    return s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function label(file) {
    if (labels.has(file)) return labels.get(file);
    const parts = file.replace(/(^|\/)index\.html$/, "").replace(/\.html$/, "").split("/").filter(Boolean);
    if (parts[0] === "es") return (parts.length > 1 ? words(parts.slice(1).join(" ")) : "Home") + " (Español)";
    return parts.length ? words(parts.join(" ")) : "Home";
  }

  function fillPages() {
    const order = (f) => (f === "index.html" ? "0" : f.startsWith("es/") ? "2" + f : "1" + f);
    pages.sort((a, b) => order(a).localeCompare(order(b)));
    pageSel.innerHTML = "";
    for (const f of pages) {
      const o = document.createElement("option");
      o.value = f;
      o.textContent = label(f);
      pageSel.appendChild(o);
    }
    if (page) pageSel.value = page.file;
  }

  // The editable page a link points to, or null.
  function pageOf(a) {
    const url = new URL(a.getAttribute("href"), doc.baseURI);
    if (url.origin !== location.origin) return null;
    let path = url.pathname.replace(/^\//, "");
    if (path === "" || path.endsWith("/")) path += "index.html";
    else if (!/\.html$/.test(path) && pages.includes(path + ".html")) path += ".html";
    else if (!/\.html$/.test(path) && pages.includes(path + "/index.html")) path += "/index.html";
    return pages.includes(path) ? path : null;
  }

  // Use the menu names from the site ("Reserve" instead of "Charter Pricing").
  function learnLabels() {
    let added = false;
    doc.querySelectorAll(".site-nav a[href], .site-footer a[href]").forEach((a) => {
      const path = pageOf(a);
      const name = a.textContent.trim();
      if (path && name && path !== "index.html" && !labels.has(path)) {
        labels.set(path, name);
        added = true;
      }
    });
    if (added) fillPages();
  }

  // ---------- Open a page ----------

  async function openPage(file) {
    loading.textContent = "Loading your page…";
    loading.hidden = false;
    const data = await api("page?file=" + encodeURIComponent(file));
    page = { file: data.file, sha: data.sha };
    changed.clear();
    photos.clear();
    updateCount();
    await new Promise((resolve) => {
      frame.onload = resolve;
      frame.srcdoc = data.html;
    });
    doc = frame.contentDocument;
    setup();
    learnLabels();
    pageSel.value = file;
    loading.hidden = true;
    try { localStorage.setItem("editor-page", file); } catch (e) { /* private mode */ }
  }

  function setup() {
    const style = doc.createElement("style");
    style.textContent = FRAME_CSS;
    doc.head.appendChild(style);
    doc.querySelectorAll("details").forEach((d) => { d.open = true; }); // every FAQ answer in reach

    (function walk(el) {
      for (const child of el.children) {
        if (child.matches(SKIP)) continue;
        if (isText(child)) makeEditable(child);
        else walk(child);
      }
    })(doc.body);

    doc.querySelectorAll("img[data-k]").forEach((img) => {
      if (img.closest(SKIP)) return;
      img.setAttribute("data-photo", "");
      // A photo published a moment ago isn't on the website yet: show it from GitHub.
      const fallback = () => {
        const path = new URL(img.getAttribute("src"), doc.baseURI).pathname.replace(/^\//, "");
        if (path.startsWith("images/") && !img.dataset.raw) {
          img.dataset.raw = "1";
          img.src = "/api/admin/raw?path=" + encodeURIComponent(path);
        }
      };
      img.addEventListener("error", fallback);
      if (img.complete && img.naturalWidth === 0 && img.getAttribute("loading") !== "lazy") fallback();
    });

    doc.addEventListener("input", onInput);
    doc.addEventListener("keydown", onKey);
    doc.addEventListener("paste", onPaste);
    doc.addEventListener("dragover", (e) => e.preventDefault());
    doc.addEventListener("drop", (e) => e.preventDefault());
    doc.addEventListener("submit", (e) => e.preventDefault(), true);
    doc.addEventListener("click", onClick, true);
  }

  // A text is any element whose content is only text and inline markup.
  function isText(el) {
    if (!el.hasAttribute("data-k") || !/\S/.test(el.textContent)) return false;
    for (const d of el.querySelectorAll("*")) {
      if (!PHRASING.has(d.tagName) || !d.hasAttribute("data-k")) return false;
    }
    return true;
  }

  function makeEditable(el) {
    el.setAttribute("contenteditable", plainOnly ? "plaintext-only" : "true");
    el.setAttribute("spellcheck", "true");
    el.setAttribute("data-edit", "");
    el._original = el.innerHTML;
  }

  // ---------- Editing ----------

  function htmlOf(el) {
    let html = el.innerHTML;
    if (!el._original.includes("&nbsp;")) html = html.replace(/&nbsp;/g, " "); // typing adds these
    return html;
  }

  function onInput(e) {
    const el = e.target.closest && e.target.closest("[data-edit]");
    if (!el) return;
    const k = el.getAttribute("data-k");
    const html = htmlOf(el);
    if (html === el._original) changed.delete(k);
    else changed.set(k, html);
    el.classList.toggle("ed-changed", changed.has(k));
    updateCount();
  }

  function onKey(e) {
    if (e.key !== "Enter" || !e.target.closest || !e.target.closest("[data-edit]")) return;
    e.preventDefault(); // a new line, never a new paragraph or box
    doc.execCommand("insertLineBreak");
  }

  function onPaste(e) {
    if (!e.target.closest || !e.target.closest("[data-edit]")) return;
    e.preventDefault(); // paste words only, never formatting from elsewhere
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    doc.execCommand("insertText", false, text);
  }

  function onClick(e) {
    const t = e.target;
    const img = t.closest && t.closest("img[data-photo]");
    if (img) {
      e.preventDefault();
      e.stopPropagation();
      pickPhoto(img);
      return;
    }
    if (t.closest && t.closest(".menu-btn")) return; // the phone menu still opens
    // The site's own menu and links open that page in the editor (not inside a text being edited).
    const link = t.closest && t.closest("a[href]");
    if (link && !link.closest("[data-edit]")) {
      const file = pageOf(link);
      if (file) {
        e.preventDefault();
        e.stopPropagation();
        if (file !== page.file) {
          pageSel.value = file;
          pageSel.dispatchEvent(new Event("change"));
        }
        return;
      }
    }
    if (t.closest && t.closest("a, button, summary, label")) {
      e.preventDefault(); // links and buttons don't go anywhere while editing
      e.stopPropagation();
    }
  }

  // ---------- Photos ----------

  let target = null;     // the <img> being replaced
  let bitmap = null;     // the chosen photo
  const crop = { aspect: 1, zoom: 1, cx: 0, cy: 0, base: 1, boxW: 0, boxH: 0 };
  const cropBox = $("crop");
  const canvas = $("crop-canvas");
  const zoomInput = $("crop-zoom");

  function pickPhoto(img) {
    target = img;
    fileInput.value = "";
    fileInput.click();
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file || !target) return;
    try {
      bitmap = await createImageBitmap(file);
    } catch (e) {
      toast("That photo can't be opened here. Try a JPG or PNG.", true);
      return;
    }
    const w = Number(target.getAttribute("width")) || target.naturalWidth || 4;
    const h = Number(target.getAttribute("height")) || target.naturalHeight || 3;
    crop.aspect = w / h;
    crop.zoom = 1;
    crop.cx = bitmap.width / 2;
    crop.cy = bitmap.height / 2;
    zoomInput.value = "1";
    cropBox.style.aspectRatio = String(crop.aspect);
    cropBox.style.maxWidth = `calc(55vh * ${crop.aspect})`;
    $("photo-dlg").showModal();
    requestAnimationFrame(drawCrop);
  });

  function drawCrop() {
    const r = cropBox.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    crop.boxW = r.width;
    crop.boxH = r.height;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    crop.base = Math.max(r.width / bitmap.width, r.height / bitmap.height);
    const s = crop.base * crop.zoom;
    const vw = r.width / s;
    const vh = r.height / s;
    crop.cx = Math.min(Math.max(crop.cx, vw / 2), bitmap.width - vw / 2);
    crop.cy = Math.min(Math.max(crop.cy, vh / 2), bitmap.height - vh / 2);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, crop.cx - vw / 2, crop.cy - vh / 2, vw, vh, 0, 0, canvas.width, canvas.height);
  }

  zoomInput.addEventListener("input", () => { crop.zoom = Number(zoomInput.value); drawCrop(); });

  let drag = null;
  cropBox.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY };
    cropBox.setPointerCapture(e.pointerId);
  });
  cropBox.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const s = crop.base * crop.zoom;
    crop.cx -= (e.clientX - drag.x) / s;
    crop.cy -= (e.clientY - drag.y) / s;
    drag = { x: e.clientX, y: e.clientY };
    drawCrop();
  });
  cropBox.addEventListener("pointerup", () => { drag = null; });
  cropBox.addEventListener("pointercancel", () => { drag = null; });

  $("crop-ok").addEventListener("click", async () => {
    const img = target;
    const w = Number(img.getAttribute("width")) || img.naturalWidth;
    const outW = Math.round(Math.min(2000, Math.max(w, img.naturalWidth, 1200)));
    const outH = Math.round(outW / crop.aspect);
    const s = crop.base * crop.zoom;
    const vw = crop.boxW / s;
    const vh = crop.boxH / s;
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, crop.cx - vw / 2, crop.cy - vh / 2, vw, vh, 0, 0, outW, outH);

    const png = /\.png(\?|$)/i.test(img.getAttribute("src") || ""); // keeps see-through graphics see-through
    const blob = await new Promise((r) => out.toBlob(r, png ? "image/png" : "image/jpeg", 0.85));
    const data = await new Promise((r) => {
      const fr = new FileReader();
      fr.onload = () => r(String(fr.result).split(",")[1]);
      fr.readAsDataURL(blob);
    });

    // The old photo's other sizes and formats inside <picture> go away with it.
    const drops = [];
    const pic = img.parentElement && img.parentElement.tagName === "PICTURE" ? img.parentElement : null;
    if (pic) {
      pic.querySelectorAll("source").forEach((src) => {
        if (src.hasAttribute("data-k")) drops.push(src.getAttribute("data-k"));
        src.remove();
      });
    }
    const k = img.getAttribute("data-k");
    const before = photos.get(k);
    photos.set(k, { data, ext: png ? "png" : "jpg", width: outW, height: outH, drops: before ? before.drops.concat(drops) : drops });
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.setAttribute("width", String(outW));
    img.setAttribute("height", String(outH));
    img.src = URL.createObjectURL(blob);
    img.classList.add("ed-changed");
    $("photo-dlg").close();
    bitmap = null;
    updateCount();
  });

  // ---------- Publish ----------

  function count() { return changed.size + photos.size; }

  function updateCount() {
    const n = count();
    publishBtn.disabled = n === 0;
    publishBtn.textContent = n === 0 ? "Publish" : `Publish ${n} change${n > 1 ? "s" : ""}`;
  }

  publishBtn.addEventListener("click", async () => {
    if (!count()) return;
    publishBtn.disabled = true;
    publishBtn.textContent = "Publishing…";
    try {
      const drops = [];
      for (const p of photos.values()) drops.push(...p.drops);
      await api("save", {
        file: page.file,
        sha: page.sha,
        texts: Object.fromEntries(changed),
        photos: [...photos].map(([k, p]) => ({ k, data: p.data, ext: p.ext, width: p.width, height: p.height })),
        drops,
      });
      await openPage(page.file);
      toast("Published! Your website will show it in about a minute.");
    } catch (err) {
      toast(err.message, true);
      updateCount();
    }
  });

  // ---------- History ----------

  function describe(message) {
    const undo = message.match(/^Undo "(.*)"$/);
    const text = undo ? undo[1] : message;
    const m = text.match(/^(\S+\.html) – (.*)$/);
    const what = m ? `${label(m[1])}: ${m[2]}` : text;
    return undo ? `Undid · ${what}` : what;
  }

  function when(iso) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  }

  async function showHistory() {
    const list = $("history-list");
    list.innerHTML = '<li class="empty">Loading…</li>';
    if (!$("history-dlg").open) $("history-dlg").showModal();
    let changes;
    try {
      ({ changes } = await api("history"));
    } catch (err) {
      list.innerHTML = "";
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = err.message;
      list.appendChild(li);
      return;
    }
    list.innerHTML = "";
    if (!changes.length) {
      list.innerHTML = '<li class="empty">No changes yet.</li>';
      return;
    }
    for (const c of changes) {
      const li = document.createElement("li");
      const what = document.createElement("div");
      what.className = "what";
      const strong = document.createElement("strong");
      strong.textContent = describe(c.message);
      const span = document.createElement("span");
      span.textContent = `${when(c.date)} · ${c.by}`;
      what.append(strong, span);
      const btn = document.createElement("button");
      btn.className = "btn ghost";
      btn.type = "button";
      btn.textContent = c.message.startsWith("Undo ") ? "Redo" : "Undo";
      btn.addEventListener("click", () => undo(c, btn));
      li.append(what, btn);
      list.appendChild(li);
    }
  }

  async function undo(c, btn) {
    const label = btn.textContent;
    const ok = await ask(`${label} this change?`, describe(c.message), label);
    if (!ok) return;
    btn.disabled = true;
    btn.textContent = "Working…";
    try {
      await api("undo", { sha: c.sha });
      toast("Done. Your website will show it in about a minute.");
      await showHistory();
      if (!count()) await openPage(page.file);
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  $("history-btn").addEventListener("click", showHistory);

  // ---------- Small helpers ----------

  let toastTimer = null;
  function toast(text, isError) {
    const t = $("toast");
    t.textContent = text;
    t.classList.toggle("is-error", !!isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 9000 : 6000);
  }

  function ask(title, text, okLabel) {
    const dlg = $("confirm-dlg");
    $("confirm-title").textContent = title;
    $("confirm-text").textContent = text;
    $("confirm-ok").textContent = okLabel;
    dlg.showModal();
    return new Promise((resolve) => {
      const done = (v) => { dlg.close(); $("confirm-ok").onclick = null; dlg.onclose = null; resolve(v); };
      $("confirm-ok").onclick = () => done(true);
      dlg.onclose = () => resolve(false);
    });
  }

  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

  pageSel.addEventListener("change", async () => {
    const next = pageSel.value;
    if (count()) {
      const ok = await ask("Leave without publishing?", "Your changes on this page aren't on the website yet. If you open another page, they're lost.", "Leave page");
      if (!ok) { pageSel.value = page.file; return; }
    }
    try { await openPage(next); } catch (err) { toast(err.message, true); pageSel.value = page.file; }
  });

  window.addEventListener("beforeunload", (e) => {
    if (count()) { e.preventDefault(); e.returnValue = ""; }
  });

  const hint = $("hint");
  try { if (localStorage.getItem("editor-hint") === "closed") hint.hidden = true; } catch (e) { /* private mode */ }
  $("hint-close").addEventListener("click", () => {
    hint.hidden = true;
    try { localStorage.setItem("editor-hint", "closed"); } catch (e) { /* private mode */ }
  });

  // Outlines inside the page: blue = can be edited, gold = changed, not published yet.
  const FRAME_CSS = `
    [data-edit] { cursor: text; border-radius: 4px; outline: 2px dashed transparent; outline-offset: 3px; }
    [data-edit]:hover { outline-color: rgb(40 85 166 / 0.45); }
    [data-edit]:focus { outline: 2px solid #2855a6; background: rgb(40 85 166 / 0.06); }
    [data-edit].ed-changed { outline: 2px solid #d99a1e; }
    img[data-photo] { cursor: pointer; }
    img[data-photo]:hover { outline: 3px solid #2855a6; outline-offset: -3px; }
    img.ed-changed { outline: 3px solid #d99a1e; outline-offset: -3px; }
    @media (hover: none) { [data-edit]:not(:focus):not(.ed-changed) { outline-color: rgb(40 85 166 / 0.2); } }
  `;

  // ---------- Start ----------

  (async function start() {
    try {
      pages = (await api("pages")).pages;
      fillPages();
      pageSel.disabled = false;
      let first = "index.html";
      try { first = localStorage.getItem("editor-page") || first; } catch (e) { /* private mode */ }
      if (!pages.includes(first)) first = pages.includes("index.html") ? "index.html" : pages[0];
      await openPage(first);
    } catch (err) {
      loading.textContent = err.message;
    }
  })();
})();
