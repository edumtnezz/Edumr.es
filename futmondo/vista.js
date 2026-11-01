/* Contador de visitas propio (01/11/2026).
   Sin cookies, sin datos personales: solo dice cuántas veces se abrió cada página.
   Una petición por página y sesión, y nada si el navegador pide no ser rastreado. */
(function () {
  try {
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
    var p = location.pathname.replace(/\/index\.html$/, "/");
    var k = "vista:" + p;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
    fetch("/api/laquiniela/vista?p=" + encodeURIComponent(p), { keepalive: true }).catch(function () {});
  } catch (e) {}
})();
