/* Al volver a una pestaña/app que llevaba un rato en segundo plano (o que el
   navegador restaura de memoria), recarga para no enseñar datos viejos. */
(function () {
  if (window.__cxFresh) return; window.__cxFresh = 1;
  var AWAY = 5 * 60 * 1000, hiddenAt = 0;
  function busy() { var a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); }
  function stale() { return hiddenAt && Date.now() - hiddenAt > AWAY && !busy(); }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (stale()) location.reload();
    hiddenAt = 0;
  });
  // Al volver atrás el navegador restaura la página de memoria: solo se recarga si llevaba rato fuera
  // (antes recargaba siempre y se veía un parpadeo raro al volver a Inicio).
  var leftAt = 0;
  window.addEventListener("pagehide", function () { leftAt = Date.now(); });
  window.addEventListener("pageshow", function (e) {
    if (e.persisted && leftAt && Date.now() - leftAt > AWAY && !busy()) location.reload();
  });
})();
