/* Contador de visitas propio (01/11/2026).
   Sin cookies, sin datos personales: solo cuenta, por hora, qué páginas se abren y qué se toca
   (pestañas y enlaces). Una vista por página y sesión, y nada si el navegador pide no ser rastreado. */
(function () {
  try {
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
    var send = function (q) { try { fetch("/api/laquiniela/vista?" + q, { keepalive: true }).catch(function () {}); } catch (e) {} };
    var view = function () {
      try {
        var p = location.pathname.replace(/\/index\.html$/, "/");
        var k = "vista:" + p;
        if (sessionStorage.getItem(k)) return;
        sessionStorage.setItem(k, "1");
        send("p=" + encodeURIComponent(p));
      } catch (e) {}
    };
    view();
    // Pestañas que cambian la dirección sin recargar (Guía Fantasy)
    var ps = history.pushState;
    history.pushState = function () { var r = ps.apply(this, arguments); setTimeout(view, 0); return r; };
    window.addEventListener("popstate", function () { setTimeout(view, 0); });
    // Toques: pestañas y enlaces (solo la etiqueta, nunca texto escrito ni datos de nadie)
    var last = "", lastAt = 0;
    document.addEventListener("click", function (ev) {
      try {
        var t = ev.target && ev.target.closest ? ev.target.closest("[data-tab],a[href]") : null;
        if (!t) return;
        var lab = "";
        if (t.getAttribute("data-tab")) lab = "tab:" + t.getAttribute("data-tab");
        else {
          var u = new URL(t.href, location.href);
          lab = u.origin === location.origin ? "ir:" + u.pathname.replace(/\/$/, "").slice(0, 44) : "ext:" + u.hostname;
        }
        var now = Date.now();
        if (!lab || (lab === last && now - lastAt < 800)) return;
        last = lab; lastAt = now;
        send("e=" + encodeURIComponent(lab));
      } catch (e) {}
    }, true);
  } catch (e) {}
})();
