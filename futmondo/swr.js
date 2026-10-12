/* Carga instantánea: las respuestas de la API se guardan en el navegador y se
   pintan al momento; en segundo plano se piden las nuevas y, si cambian, se
   avisa con el evento "cx:swr" para que la página se repinte en el sitio. */
(function () {
  "use strict";
  var EPS = /^\/api\/laquiniela\/(mercado|jugador|jornada|rachas|equipos|portada|noticias|detallepartido|once|alineaciones-confirmadas|cambios|puntos|ultimahora)(\?|$)/;
  var MAXAGE = 6 * 3600 * 1000, MAXBODY = 1500000, PFX = "swr1:";
  var native = window.fetch.bind(window), inflight = {}, lastEv = {};
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(PFX + k)); } catch (e) { return null; } }
  function lsPut(k, body) {
    try { localStorage.setItem(PFX + k, JSON.stringify({ t: Date.now(), b: body })); }
    catch (e) { prune(); try { localStorage.setItem(PFX + k, JSON.stringify({ t: Date.now(), b: body })); } catch (e2) {} }
  }
  function prune() {
    try {
      var ks = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(PFX) === 0) { var o = null; try { o = JSON.parse(localStorage.getItem(k)); } catch (e) {} ks.push([k, o ? o.t : 0]); } }
      ks.sort(function (a, b) { return a[1] - b[1]; });
      ks.slice(0, Math.ceil(ks.length / 2) + 1).forEach(function (x) { localStorage.removeItem(x[0]); });
    } catch (e) {}
  }
  function net(input, url) {
    if (inflight[url]) return inflight[url];
    var p = native(input).then(function (r) {
      if (!r.ok) return { ok: false, res: r };
      return r.clone().text().then(function (t) { return { ok: true, res: r, text: t }; });
    }).then(function (x) { delete inflight[url]; return x; }, function (e) { delete inflight[url]; throw e; });
    inflight[url] = p; return p;
  }
  function mk(text) { return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } }); }
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = (init && init.method) || (input && input.method) || "GET";
    var path = url.replace(location.origin, "");
    if (method !== "GET" || !EPS.test(path)) return native(input, init);
    var c = lsGet(path);
    if (c && c.b && Date.now() - c.t < MAXAGE) {
      // pinta ya con lo guardado y actualiza detrás
      net(path, path).then(function (x) {
        if (!x || !x.ok) return;
        if (x.text !== c.b) {
          if (x.text.length < MAXBODY) lsPut(path, x.text);
          var n = Date.now();
          if (!lastEv[path] || n - lastEv[path] > 15000) { lastEv[path] = n; try { document.dispatchEvent(new CustomEvent("cx:swr", { detail: { url: path } })); } catch (e) {} }
        } else lsPut(path, x.text);
      }).catch(function () {});
      return Promise.resolve(mk(c.b));
    }
    return net(path, path).then(function (x) {
      if (x.ok && x.text.length < MAXBODY) lsPut(path, x.text);
      return x.res.clone ? (x.ok ? mk(x.text) : x.res) : x.res;
    });
  };
  // Precalentar lo más usado para que la primera visita a una ficha o partido también sea rápida
  function warm() {
    ["/api/laquiniela/mercado", "/api/laquiniela/jornada", "/api/laquiniela/rachas", "/api/laquiniela/equipos"].forEach(function (p) {
      var c = lsGet(p); if (!c || Date.now() - c.t > 120000) window.fetch(p).catch(function () {});
    });
  }
  if (document.readyState === "complete") setTimeout(warm, 800); else window.addEventListener("load", function () { setTimeout(warm, 800); });
})();
