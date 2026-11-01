/* Página de visitas: por día, por hora y con el detalle de lo visto y tocado. Todo sale del contador propio. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var NOMBRES = { tab: "Pestaña", ir: "Enlace", ext: "Web externa" };

  function fila(a, b, cls) {
    var d = document.createElement("div"); d.className = "st-row" + (cls ? " " + cls : "");
    var s = document.createElement("span"); s.textContent = a;
    var v = document.createElement("b"); v.textContent = b;
    d.appendChild(s); d.appendChild(v); return d;
  }
  function vacio(box) { box.innerHTML = ""; box.appendChild(fila("Sin datos", "—", "st-empty")); }
  function suma(o) { return Object.keys(o || {}).reduce(function (t, k) { return t + (Number(o[k]) || 0); }, 0); }
  function ymd(off) {
    var f = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });
    return f.format(new Date(Date.now() - off * 86400000));
  }
  function etiqueta(k) {
    var i = k.indexOf(":"); if (i < 0) return k;
    return (NOMBRES[k.slice(0, i)] || k.slice(0, i)) + " · " + k.slice(i + 1);
  }
  function lista(box, obj, fmt) {
    box.innerHTML = "";
    var ks = Object.keys(obj || {}).sort(function (a, b) { return obj[b] - obj[a]; }).slice(0, 15);
    if (!ks.length) return vacio(box);
    ks.forEach(function (k) { box.appendChild(fila(fmt ? fmt(k) : k, obj[k])); });
  }

  var datos = { horas: {} }, sel = null;

  function pintaDetalle() {
    var p = {}, e = {}, hs = sel === null ? Object.keys(datos.horas) : [sel];
    hs.forEach(function (h) {
      var v = datos.horas[h] || {};
      Object.keys(v.p || {}).forEach(function (k) { p[k] = (p[k] || 0) + v.p[k]; });
      Object.keys(v.e || {}).forEach(function (k) { e[k] = (e[k] || 0) + v.e[k]; });
    });
    $("stDetTitle").textContent = sel === null ? "Todo el día" : "A las " + sel + ":00";
    lista($("stPages"), p);
    lista($("stTaps"), e, etiqueta);
  }

  function pintaHoras() {
    var box = $("stHours"); box.innerHTML = "";
    var max = 1, tot = 0, cnt = [];
    for (var i = 0; i < 24; i++) {
      var h = (i < 10 ? "0" : "") + i, v = datos.horas[h] || {};
      var n = suma(v.p); cnt.push(n); tot += n; if (n > max) max = n;
    }
    $("stTotal").textContent = String(tot);
    cnt.forEach(function (n, i) {
      var h = (i < 10 ? "0" : "") + i;
      var b = document.createElement("button"); b.type = "button";
      b.className = "st-bar" + (sel === h ? " on" : "");
      b.setAttribute("aria-label", h + ":00 · " + n + " visitas");
      var f = document.createElement("i"); f.style.height = (n ? Math.max(6, Math.round(n / max * 100)) : 2) + "%";
      b.appendChild(f);
      if (n) { var t = document.createElement("em"); t.textContent = n; b.appendChild(t); }
      b.addEventListener("click", function () { sel = sel === h ? null : h; pintaHoras(); pintaDetalle(); });
      box.appendChild(b);
    });
  }

  function cargaDia(d, lbl) {
    $("stDayLbl").textContent = lbl; sel = null;
    fetch("/api/laquiniela/vistas-horas?dia=" + d).then(function (r) { return r.json(); }).then(function (j) {
      datos = { horas: (j && j.horas) || {} }; pintaHoras(); pintaDetalle();
    }).catch(function () { datos = { horas: {} }; pintaHoras(); vacio($("stPages")); vacio($("stTaps")); });
  }

  var chips = $("stChips");
  [["Hoy", 0], ["Ayer", 1], ["Hace 2 días", 2]].forEach(function (x, i) {
    var b = document.createElement("button"); b.type = "button"; b.textContent = x[0]; b.className = "st-chip" + (i === 0 ? " on" : "");
    b.addEventListener("click", function () {
      Array.prototype.forEach.call(chips.children, function (c) { c.classList.toggle("on", c === b); });
      cargaDia(ymd(x[1]), x[0]);
    });
    chips.appendChild(b);
  });
  cargaDia(ymd(0), "Hoy");

  fetch("/api/laquiniela/vistas?dias=14").then(function (r) { return r.json(); }).then(function (d) {
    var dias = (d && d.dias) || {}, box = $("stDays"), claves = Object.keys(dias).sort().reverse();
    claves.forEach(function (k) { var p = k.split("-"); box.appendChild(fila(p[2] + "/" + p[1], suma(dias[k]))); });
    if (!claves.length) vacio(box);
  }).catch(function () { vacio($("stDays")); });
})();
