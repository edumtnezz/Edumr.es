/* Pinta la página de visitas con los datos del contador propio (/api/laquiniela/vistas). */
(function () {
  var API = "/api/laquiniela/vistas?dias=14";
  var totalEl = document.getElementById("stTotal");
  var daysEl = document.getElementById("stDays");
  var pagesEl = document.getElementById("stPages");

  function fila(a, b, cls) {
    var d = document.createElement("div");
    d.className = "st-row" + (cls ? " " + cls : "");
    var s = document.createElement("span"); s.textContent = a;
    var v = document.createElement("b"); v.textContent = b;
    d.appendChild(s); d.appendChild(v);
    return d;
  }

  function dia(x) {
    var p = String(x).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] : x;
  }

  fetch(API).then(function (r) { return r.json(); }).then(function (d) {
    var dias = (d && d.dias) || {};
    var claves = Object.keys(dias).sort().reverse();
    var total = 0, paginas = {};
    claves.forEach(function (k) {
      var v = dias[k] || {}, suma = 0;
      Object.keys(v).forEach(function (p) { var n = Number(v[p]) || 0; suma += n; paginas[p] = (paginas[p] || 0) + n; });
      total += suma;
      daysEl.appendChild(fila(dia(k), suma));
    });
    totalEl.textContent = String(total);
    if (!claves.length) { daysEl.appendChild(fila("Sin datos todavía", "—", "st-empty")); }

    var orden = Object.keys(paginas).sort(function (a, b) { return paginas[b] - paginas[a]; }).slice(0, 12);
    if (!orden.length) { pagesEl.appendChild(fila("Sin datos todavía", "—", "st-empty")); return; }
    orden.forEach(function (p) { pagesEl.appendChild(fila(p, paginas[p])); });
  }).catch(function () {
    totalEl.textContent = "—";
    daysEl.appendChild(fila("No se pudieron cargar las visitas", "—", "st-empty"));
  });
})();
