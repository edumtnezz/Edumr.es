/* Formaciones reales de cada equipo (registro /api/laquiniela/formaciones, de FotMob).
   Se usa para que el once probable NO se dibuje con una formación que el equipo no juega. */
(function () {
  var KEY = "edu:form:v1", DATA = null;
  function nums(l) { return String(l || "").split("-").map(Number); }
  function suma(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function valida(l) { var a = nums(l); return (a.length === 3 || a.length === 4) && suma(a) === 10 && a.every(function (n) { return n >= 1 && n <= 6; }); }
  // Lo distinto que es b de a (filas alineadas desde la defensa)
  function dist(a, b) { var n = Math.max(a.length, b.length), d = 0; for (var i = 0; i < n; i++) d += Math.abs((a[i] || 0) - (b[i] || 0)); return d; }
  // lab = formación dibujada («4-6-0», «4-2-3-1»); used = { "4-2-3-1": 7, "4-3-3": 2 } (veces que el equipo la ha jugado, de partidos reales).
  // Si el equipo ya la ha jugado, se deja. Si no, la más parecida de las que sí ha jugado (a igualdad, la más usada). Sin datos: null.
  function elegir(lab, used) {
    if (!used) return null;
    if (used[lab] > 0) return lab;
    var a = nums(lab), best = null, bd = 99, bc = 0;
    Object.keys(used).forEach(function (f) {
      if (!valida(f) || !(used[f] > 0)) return;
      var d = dist(a, nums(f));
      if (d < bd || (d === bd && used[f] > bc)) { best = f; bd = d; bc = used[f]; }
    });
    return best;
  }
  // Reparte a los 10 de campo (ordenados de atrás hacia delante) en filas con los jugadores que pide la formación.
  // players: [{ y, x }]; más y = más atrás. A igual altura, el más centrado va más atrás.
  function repartir(players, form) {
    var f = players.slice().sort(function (a, b) { return (b.y - a.y) || (Math.abs((a.x == null ? 50 : a.x) - 50) - Math.abs((b.x == null ? 50 : b.x) - 50)); });
    var rows = [], i = 0;
    nums(form).forEach(function (n) { rows.push(f.slice(i, i + n)); i += n; });
    return rows;
  }
  function set(d) { DATA = d && d.equipos ? d : null; }
  function get() { return DATA; }
  function cargar() {
    try { var c = JSON.parse(localStorage.getItem(KEY) || "null"); if (c && c.equipos) set(c); } catch (e) {}
    try {
      fetch("/api/laquiniela/formaciones").then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.equipos && d.equipos.length) { set(d); try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
      }).catch(function () {});
    } catch (e) {}
  }
  window.EduFormaciones = { elegir: elegir, repartir: repartir, valida: valida, set: set, get: get, cargar: cargar };
  if (typeof document !== "undefined" && typeof fetch === "function") cargar();
})();
