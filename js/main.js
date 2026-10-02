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

// ---------- Forms (preview: shown, but nothing is sent) ----------
(function () {
  document.querySelectorAll("form[data-preview]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const done = document.getElementById(form.getAttribute("data-done"));
      form.hidden = true;
      if (done) { done.hidden = false; done.focus(); }
    });
  });
})();
