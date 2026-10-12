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
    removes.clear();
    adds.clear();
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
    if (!el || el.closest("[data-new]")) return;
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
      const item = groupItem(img);
      if (item) openPhotoMenu(img, item);
      else pickPhoto(img, "replace");
      return;
    }
    if (t.closest && t.closest(".menu-btn")) return; // the phone menu still opens
    // The site's own menu and links open that page in the editor (not inside a text being edited).
    const link = t.closest && t.closest("a[href]");
    if (link && !link.closest("[data-edit]") && !link.closest("[data-new]")) {
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

  // ---------- Photo groups (photo grids, galleries, rows of logos) ----------
  // A group is an element whose children are all photos (a photo, or a box holding one
  // with at most a caption). Photos in a group can also be removed, or one added next to them.

  function looseText(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll("figcaption, .chip, svg").forEach((x) => x.remove());
    return /\S/.test(c.textContent);
  }

  function isPhotoItem(el) {
    if (el.matches("script, style, template, source")) return false;
    const media = el.matches("img, video") || el.querySelector("img, video");
    return !!media && !looseText(el);
  }

  function isGroup(el) {
    if (!el || el === doc.body || el.matches("main, section, header, footer") || el.closest(SKIP)) return false;
    const kids = [...el.children].filter((c) => !c.matches("script, style, template") && !c.hidden);
    return kids.length >= 2 && kids.every(isPhotoItem);
  }

  // The group item that holds this photo, or null when the photo stands alone.
  function groupItem(img) {
    let item = img;
    for (let depth = 0; depth < 4 && item && item !== doc.body; depth++) {
      if (isGroup(item.parentElement)) return item;
      item = item.parentElement;
    }
    return null;
  }

  const removes = new Set(); // k of original group items to remove
  const adds = new Map();    // k of an original item → new items after it, in order

  function addCount() {
    let n = 0;
    for (const list of adds.values()) n += list.length;
    return n;
  }

  let menuFor = null;
  function openPhotoMenu(img, item) {
    menuFor = { img, item };
    const visible = [...item.parentElement.children].filter((c) => isPhotoItem(c) && c.style.display !== "none");
    $("menu-remove").disabled = visible.length <= 1; // a group always keeps one photo
    $("photo-menu").showModal();
  }

  $("menu-replace").addEventListener("click", () => {
    $("photo-menu").close();
    pickPhoto(menuFor.img, "replace");
  });
  $("menu-add").addEventListener("click", () => {
    $("photo-menu").close();
    pickPhoto(menuFor.img, "add", menuFor.item);
  });
  $("menu-remove").addEventListener("click", () => {
    $("photo-menu").close();
    removeItem(menuFor.item);
  });

  function removeItem(item) {
    if (item._add) {
      // A photo added in this session: just forget it.
      const list = adds.get(item._add.anchor);
      list.splice(list.indexOf(item._add), 1);
      if (!list.length) adds.delete(item._add.anchor);
      item.remove();
    } else {
      const k = item.getAttribute("data-k");
      removes.add(k);
      item.style.display = "none";
      // Changes inside a removed photo don't matter any more.
      photos.delete(k);
      item.querySelectorAll("[data-k]").forEach((el) => {
        changed.delete(el.getAttribute("data-k"));
        photos.delete(el.getAttribute("data-k"));
      });
      // New photos added after it now take its place.
    }
    updateCount();
    toast("Photo removed. Press Publish to save it.");
  }

  // A new group item: a copy of the one tapped, with the new photo and nothing else of the old one.
  function newItem(from, src, outW, outH) {
    const clone = from.cloneNode(true);
    clone.style.display = "";
    clone.setAttribute("data-new", "");
    clone.classList.remove("ed-changed");
    clone.querySelectorAll("[data-k], [data-edit], [data-photo], .ed-changed").forEach((el) => {
      el.removeAttribute("data-k");
      el.removeAttribute("data-photo");
      el.classList.remove("ed-changed");
    });
    clone.removeAttribute("data-k");
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    clone.querySelectorAll("source").forEach((el) => el.remove());
    const imgs = [...(clone.matches("img") ? [clone] : clone.querySelectorAll("img"))];
    imgs.slice(1).forEach((el) => el.remove());
    const img = imgs[0];
    img.src = src;
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.removeAttribute("data-raw");
    img.setAttribute("alt", "");
    img.setAttribute("width", String(outW));
    img.setAttribute("height", String(outH));
    img.setAttribute("data-photo", "");
    img.classList.add("ed-changed");
    // A link to the old big photo now opens the new one; any other link goes away.
    const links = [...(clone.matches("a") ? [clone] : []), ...clone.querySelectorAll("a")];
    for (const a of links) {
      if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(a.getAttribute("href") || "")) a.setAttribute("data-new-link", "");
      else if (a === clone) a.removeAttribute("href");
      else a.replaceWith(...a.childNodes);
    }
    clone.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
    clone.querySelectorAll("figcaption, .chip").forEach((el) => {
      if (/\S/.test(el.textContent)) {
        el.setAttribute("contenteditable", plainOnly ? "plaintext-only" : "true");
        el.setAttribute("data-edit", "");
      }
    });
    return clone;
  }

  // The HTML of a new item as it goes to the server: "__NEW__" marks where the photo's path goes.
  function newItemHtml(item) {
    const c = item.cloneNode(true);
    c.removeAttribute("data-new");
    c.classList.remove("ed-changed");
    if (!c.getAttribute("class")) c.removeAttribute("class");
    c.querySelectorAll("*").forEach((el) => {
      ["data-photo", "data-edit", "contenteditable", "spellcheck"].forEach((a) => el.removeAttribute(a));
      el.classList.remove("ed-changed");
      if (el.getAttribute("class") === "") el.removeAttribute("class");
    });
    const img = c.matches("img") ? c : c.querySelector("img");
    img.setAttribute("src", "__NEW__");
    const links = [...(c.matches("a") ? [c] : []), ...c.querySelectorAll("a")];
    for (const a of links) {
      if (a.hasAttribute("data-new-link")) { a.setAttribute("href", "__NEW__"); a.removeAttribute("data-new-link"); }
    }
    return c.outerHTML.replace(/&nbsp;/g, " ");
  }

  // ---------- Photos ----------

  let target = null;     // the <img> being replaced, or the one next to which a photo is added
  let mode = "replace";  // "replace" or "add"
  let addAfter = null;   // the group item a new photo goes after
  let bitmap = null;     // the chosen photo
  const crop = { aspect: 1, zoom: 1, cx: 0, cy: 0, boxW: 0 };
  const cropBox = $("crop");
  const canvas = $("crop-canvas");
  const zoomInput = $("crop-zoom");

  function pickPhoto(img, how, item) {
    target = img;
    mode = how;
    addAfter = item || null;
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
    $("photo-title").textContent = mode === "add" ? "Add a photo" : "New photo";
    $("photo-dlg").showModal();
    requestAnimationFrame(drawCrop);
  });

  // The part of the photo that shows in the frame, in the photo's own pixels.
  function view(src) {
    const w0 = Math.min(src.width, src.height * crop.aspect); // the biggest frame that fits
    const vw = w0 / crop.zoom;
    const vh = vw / crop.aspect;
    crop.cx = Math.min(Math.max(crop.cx, vw / 2), src.width - vw / 2);
    crop.cy = Math.min(Math.max(crop.cy, vh / 2), src.height - vh / 2);
    return { x: crop.cx - vw / 2, y: crop.cy - vh / 2, w: vw, h: vh };
  }

  function drawCrop() {
    if (!bitmap) return;
    const r = cropBox.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    crop.boxW = r.width;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    const v = view(bitmap);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, v.x, v.y, v.w, v.h, 0, 0, canvas.width, canvas.height);
  }

  zoomInput.addEventListener("input", () => { crop.zoom = Number(zoomInput.value); drawCrop(); });

  let drag = null;
  cropBox.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY };
    cropBox.setPointerCapture(e.pointerId);
  });
  cropBox.addEventListener("pointermove", (e) => {
    if (!drag || !bitmap || !crop.boxW) return;
    const s = crop.boxW / view(bitmap).w; // screen pixels per photo pixel
    crop.cx -= (e.clientX - drag.x) / s;
    crop.cy -= (e.clientY - drag.y) / s;
    drag = { x: e.clientX, y: e.clientY };
    drawCrop();
  });
  cropBox.addEventListener("pointerup", () => { drag = null; });
  cropBox.addEventListener("pointercancel", () => { drag = null; });

  $("crop-ok").addEventListener("click", async () => {
    const okBtn = $("crop-ok");
    if (okBtn.disabled) return;
    okBtn.disabled = true; // one photo at a time
    const img = target;
    const how = mode;
    const after = addAfter;
    const chosen = bitmap;
    const w = Number(img.getAttribute("width")) || img.naturalWidth;
    const outW = Math.round(Math.min(2000, Math.max(w, img.naturalWidth, 1200)));
    const outH = Math.round(outW / crop.aspect);
    const v = view(chosen);
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(chosen, v.x, v.y, v.w, v.h, 0, 0, outW, outH);

    const png = /\.png(\?|$)/i.test(img.getAttribute("src") || ""); // keeps see-through graphics see-through
    const blob = await new Promise((r) => out.toBlob(r, png ? "image/png" : "image/jpeg", 0.85));
    const data = await new Promise((r) => {
      const fr = new FileReader();
      fr.onload = () => r(String(fr.result).split(",")[1]);
      fr.readAsDataURL(blob);
    });
    const shot = { data, ext: png ? "png" : "jpg", width: outW, height: outH };
    const src = URL.createObjectURL(blob);

    if (how === "add") {
      // Goes right after the tapped photo; on the server, after the original photo it belongs to.
      const from = after;
      const anchor = from._add ? from._add.anchor : from.getAttribute("data-k");
      const list = adds.get(anchor) || [];
      const entry = Object.assign({ anchor }, shot);
      list.splice(from._add ? list.indexOf(from._add) + 1 : 0, 0, entry);
      adds.set(anchor, list);
      const item = newItem(from, src, outW, outH);
      item._add = entry;
      entry.el = item;
      from.after(item);
    } else if (img.closest("[data-new]")) {
      // A photo added in this session: swap the new file.
      const entry = img.closest("[data-new]")._add;
      Object.assign(entry, shot);
      img.src = src;
      img.setAttribute("width", String(outW));
      img.setAttribute("height", String(outH));
    } else {
      // The old photo's other sizes and formats inside <picture> go away with it.
      const drops = [];
      const pic = img.parentElement && img.parentElement.tagName === "PICTURE" ? img.parentElement : null;
      if (pic) {
        pic.querySelectorAll("source").forEach((el) => {
          if (el.hasAttribute("data-k")) drops.push(el.getAttribute("data-k"));
          el.remove();
        });
      }
      const k = img.getAttribute("data-k");
      const before = photos.get(k);
      photos.set(k, Object.assign(shot, { drops: before ? before.drops.concat(drops) : drops }));
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.setAttribute("width", String(outW));
      img.setAttribute("height", String(outH));
      img.src = src;
      img.classList.add("ed-changed");
    }
    $("photo-dlg").close();
    bitmap = null;
    okBtn.disabled = false;
    updateCount();
  });

  // ---------- Publish ----------

  function count() { return changed.size + photos.size + removes.size + addCount(); }

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
        removes: [...removes],
        adds: [...adds].map(([k, list]) => ({
          after: k,
          items: list.map((a) => ({ html: newItemHtml(a.el), data: a.data, ext: a.ext, width: a.width, height: a.height })),
        })),
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
