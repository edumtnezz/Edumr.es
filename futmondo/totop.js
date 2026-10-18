/* Botón flotante "subir arriba" (todas las páginas de /futmondo) */
(function () {
  if (window.__cxToTop) return; window.__cxToTop = 1;
  try {
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/futmondo/totop.css?v=3"; document.head.appendChild(l);
  } catch (e) {}
  function boot() {
    var b = document.createElement("button");
    b.type = "button"; b.className = "cx-totop"; b.setAttribute("aria-label", "Subir arriba");
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    b.addEventListener("click", function () {
      var rm = false; try { rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
      window.scrollTo({ top: 0, behavior: rm ? "auto" : "smooth" });
    });
    document.body.appendChild(b);
    var on = false, tick = false;
    function upd() {
      tick = false;
      var s = (window.scrollY || document.documentElement.scrollTop || 0) > Math.max(500, window.innerHeight * 0.8);
      if (s !== on) { on = s; b.classList.toggle("show", s); b.tabIndex = s ? 0 : -1; }
    }
    window.addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }
  if (document.body) boot(); else document.addEventListener("DOMContentLoaded", boot);
})();
