/* Botón flotante "subir arriba" (todas las páginas de /futmondo) */
(function () {
  if (window.__cxToTop) return; window.__cxToTop = 1;
  try {
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/futmondo/totop.css?v=2"; document.head.appendChild(l);
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
    var r = document.createElement("button");
    r.type = "button"; r.className = "cx-refresh"; r.setAttribute("aria-label", "Actualizar");
    r.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
    r.addEventListener("click", function () {
      if (r.classList.contains("spin")) return;
      r.classList.add("spin");
      setTimeout(function () { location.reload(); }, 450);
    });
    document.body.appendChild(r);
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
