// Sailing Home Sarasota — small helpers, no libraries.

document.documentElement.classList.remove("no-js");

// ---------- Phone menu ----------
(function () {
  const btn = document.querySelector(".menu-btn");
  const nav = document.getElementById("site-nav");
  if (!btn || !nav) return;
  btn.addEventListener("click", function () {
    const open = nav.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
})();

// ---------- Header: hide on scroll down, show again on scroll up ----------
(function () {
  const header = document.querySelector(".site-header");
  const nav = document.getElementById("site-nav");
  if (!header) return;
  let lastY = window.scrollY;
  let ticking = false;

  function update() {
    const y = window.scrollY;
    const h = header.offsetHeight;
    const menuOpen = nav && nav.classList.contains("is-open");
    if (y <= h || menuOpen) {
      header.classList.remove("is-hidden");
    } else if (y > lastY + 4) {
      header.classList.add("is-hidden");      // scrolling down
    } else if (y < lastY - 4) {
      header.classList.remove("is-hidden");   // scrolling up
    }
    header.classList.toggle("is-raised", y > h);
    if (Math.abs(y - lastY) > 4) lastY = y;
    ticking = false;
  }

  window.addEventListener("scroll", function () {
    if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  header.addEventListener("focusin", function () { header.classList.remove("is-hidden"); });
})();

// ---------- Forms: send through /api/contact (Pages Function → Resend) ----------
(function () {
  document.querySelectorAll("form[data-api]").forEach(function (form) {
    const done = document.getElementById(form.getAttribute("data-done"));
    const fail = document.getElementById(form.getAttribute("data-fail"));
    const button = form.querySelector('[type="submit"]');
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (fail) fail.hidden = true;
      button.disabled = true;
      fetch(form.getAttribute("data-api"), { method: "POST", body: new FormData(form) })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (out) {
            if (!r.ok || !out.ok) throw new Error(out.error || String(r.status));
          });
        })
        .then(function () {
          form.hidden = true;
          if (done) { done.hidden = false; done.focus(); }
        })
        .catch(function () {
          button.disabled = false;
          if (window.turnstile) window.turnstile.reset();
          if (fail) { fail.hidden = false; fail.focus(); }
        });
    });
  });
})();
