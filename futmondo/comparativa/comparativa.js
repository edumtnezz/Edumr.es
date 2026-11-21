/* Alineación comparativa (privada, solo administrador). Todo se escribe con textContent. */
(function () {
  var API = "/api/laquiniela";
  var $ = function (id) { return document.getElementById(id); };
  var D = null, tab = "jugados", abiertos = {};
  try { var t0 = localStorage.getItem("cp:tab"); if (t0) tab = t0; } catch (e) {}
  var ROL = { portero: "POR", defensa: "DEF", centrocampista: "MED", delantero: "DEL" };
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function img(src, cls) { var i = el("img", cls); i.alt = ""; i.loading = "lazy"; if (src) i.src = src; i.onerror = function () { i.style.visibility = "hidden"; }; return i; }

  function gate(msg) { var g = $("cpGate"); g.textContent = msg; g.classList.remove("hidden"); $("cpApp").classList.add("hidden"); }

  function cargar() {
    fetch(API + "/comparativa", { cache: "no-store", credentials: "same-origin" }).then(function (r) {
      if (r.status === 403) { gate("Solo para el administrador. Entra con tu cuenta en la Guía Fantasy y vuelve aquí."); return null; }
      return r.json();
    }).then(function (d) {
      if (!d) return;
      try { localStorage.setItem("cp:last", JSON.stringify(d)); } catch (e) {}
      D = d; pintar();
    }).catch(function () {
      var c = null; try { c = JSON.parse(localStorage.getItem("cp:last") || "null"); } catch (e) {}
      if (c) { D = c; pintar(); } else gate("No se pudo cargar ahora mismo. Vuelve a intentarlo en un rato.");
    });
  }

  function pintar() {
    $("cpGate").classList.add("hidden"); $("cpApp").classList.remove("hidden");
    var s = D.resumen || {}, sum = $("cpSum"); sum.textContent = "";
    var n = s.onces || 0;
    var b1 = el("div", "cp-box e"); b1.appendChild(el("b", null, n ? (11 * s.propio / s.de).toFixed(1) + " de 11" : "—")); b1.appendChild(el("span", null, "Nuestro once (media)"));
    var b2 = el("div", "cp-box f"); b2.appendChild(el("b", null, n ? (11 * s.ff / s.de).toFixed(1) + " de 11" : "—")); b2.appendChild(el("span", null, "FutbolFantasy (media)"));
    sum.appendChild(b1); sum.appendChild(b2);
    var tabs = $("cpTabs"); tabs.textContent = "";
    [["jugados", "Jugados (" + (D.resultados || []).length + ")"], ["proximos", "Próximos (" + (D.pendientes || []).length + ")"], ["aprender", "Qué aprendemos"]].forEach(function (t) {
      var b = el("button", "cp-tab" + (tab === t[0] ? " on" : ""), t[1]); b.type = "button";
      b.onclick = function () { tab = t[0]; try { localStorage.setItem("cp:tab", tab); } catch (e) {} pintar(); };
      tabs.appendChild(b);
    });
    var v = $("cpView"); v.textContent = "";
    if (tab === "aprender") return aprender(v);
    var lista = tab === "proximos" ? D.pendientes || [] : D.resultados || [];
    if (!lista.length) { v.appendChild(el("div", "cp-empty", tab === "proximos" ? "No hay previsiones guardadas ahora mismo." : "Aún no hay partidos puntuados. Se puntúan solos en cuanto sale el once oficial.")); return; }
    leyenda(v, tab === "proximos");
    lista.forEach(function (m, i) { v.appendChild(partido(m, i === 0)); });
  }

  function leyenda(v, prox) {
    var l = el("div", "cp-leg");
    var a = el("span"); a.appendChild(el("i", "cp-dot T", "T")); a.appendChild(document.createTextNode("titular")); l.appendChild(a);
    var b = el("span"); b.appendChild(el("i", "cp-dot S", "S")); b.appendChild(document.createTextNode("suplente")); l.appendChild(b);
    var c = el("span"); c.appendChild(el("i", "cp-dot N", "–")); c.appendChild(document.createTextNode("no jugó")); l.appendChild(c);
    l.appendChild(el("span", null, prox ? "Últimos 5, el más reciente a la derecha" : "Verde = acertó · Rojo = falló (50 % o más = titular)"));
    v.appendChild(l);
  }

  function partido(m, abrir) {
    var key = m.j + ":" + m.k, open = abiertos[key] != null ? abiertos[key] : abrir;
    var c = el("div", "cp-m"), h = el("div", "cp-mh");
    h.appendChild(img(m.crest));
    var t = el("div", "cp-mt");
    t.appendChild(el("b", null, m.team));
    var sub = "J" + m.j;
    if (m.rival && m.rival.r) sub += " · " + (m.rival.casa ? "contra " : "en casa del ") + m.rival.r;
    if (m.pendiente && m.rival) sub += " · " + (m.rival.date || "") + " " + (m.rival.time || "");
    else if (m.src) sub += " · once oficial (" + (m.src === "futmondo" ? "Futmondo" : "FotMob") + ")";
    t.appendChild(el("span", null, sub));
    h.appendChild(t);
    if (!m.pendiente && m.aciertos) {
      var sc = el("div", "cp-score"), a = m.aciertos;
      var e = el("div", "cp-sc e" + (a.propio > a.ff ? " win" : "")); e.appendChild(el("b", null, a.propio + "/11")); e.appendChild(el("i", null, "Nosotros"));
      var f = el("div", "cp-sc f" + (a.ff > a.propio ? " win" : "")); f.appendChild(el("b", null, a.ff == null ? "—" : a.ff + "/11")); f.appendChild(el("i", null, "FF"));
      sc.appendChild(e); sc.appendChild(f); h.appendChild(sc);
    }
    c.appendChild(h);
    var body = el("div", "cp-body" + (open ? "" : " hidden"));
    h.onclick = function () { abiertos[key] = body.classList.contains("hidden"); body.classList.toggle("hidden"); };
    var js = m.jugadores || [];
    if (m.pendiente) {
      body.appendChild(el("div", "cp-sec", "Lo que marcamos cada uno ahora"));
      js.forEach(function (x) { body.appendChild(jugador(x, true)); });
    } else {
      var mt = m.mediaTitulares || {};
      body.appendChild(el("div", "cp-sec", "Titulares oficiales · media E " + (mt.E == null ? "—" : mt.E + " %") + " · F " + (mt.F == null ? "—" : mt.F + " %")));
      js.filter(function (x) { return x.titular; }).forEach(function (x) { body.appendChild(jugador(x, false)); });
      var no = js.filter(function (x) { return !x.titular; });
      if (no.length) { body.appendChild(el("div", "cp-sec", "No fueron titulares")); no.forEach(function (x) { body.appendChild(jugador(x, false)); }); }
    }
    c.appendChild(body);
    return c;
  }

  function pct(lbl, v, tit, prox) {
    var q = el("div", "cp-q");
    q.appendChild(el("small", null, lbl));
    q.appendChild(el("b", null, v == null ? "—" : v + "%"));
    if (!prox && v != null) q.classList.add((v >= 50) === tit ? "ok" : "ko");
    return q;
  }

  function jugador(x, prox) {
    var r = el("div", "cp-p" + (prox ? "" : " v-" + (x.veredicto || "").replace("-sinE", "")));
    var ph = el("div", "cp-ph"); ph.appendChild(img(x.photo, "f")); if (x.logo) ph.appendChild(img(x.logo, "c")); r.appendChild(ph);
    var i = el("div", "cp-pi");
    i.appendChild(el("b", null, x.name + (ROL[x.role] ? " · " + ROL[x.role] : "")));
    i.appendChild(el("div", "cp-why", porque(x, prox)));
    var d = el("div", "cp-dots");
    (x.ult || []).slice().reverse().forEach(function (u) { d.appendChild(el("i", "cp-dot " + u, u === "N" ? "–" : u)); });
    i.appendChild(d);
    r.appendChild(i);
    var p = el("div", "cp-pct");
    p.appendChild(pct("E", x.E, x.titular, prox));
    p.appendChild(pct("F", x.F, x.titular, prox));
    r.appendChild(p);
    return r;
  }

  // Explicación corta con datos reales: por qué teníamos esa E y quién acertó
  function porque(x, prox) {
    var t = x.sitTxt || "";
    if (x.E == null) t = "No teníamos su E guardada (faltaba su ficha). " + t;
    if (!x.enOnceFF && x.F === 0) t += " · FF no lo ponía en su once";
    if (prox) return t;
    var v = x.veredicto;
    if (v === "ff") t = "FF acertó y nosotros no. " + t;
    else if (v === "nosotros") t = "Acertamos nosotros y FF no. " + t;
    else if (v === "ninguno") t = "Fallamos los dos. " + t;
    return t;
  }

  function aprender(v) {
    var a = D.aprendizaje || [];
    if (!a.length) { v.appendChild(el("div", "cp-empty", "Aún no hay partidos puntuados para aprender.")); return; }
    var box = el("div", "cp-ap");
    var hd = el("div", "cp-ar"); ["Situación antes del partido", "E", "F", "Real"].forEach(function (s) { hd.appendChild(el("div", null, s)); }); box.appendChild(hd);
    a.forEach(function (x) {
      var r = el("div", "cp-ar");
      var c0 = el("div"); c0.appendChild(document.createTextNode(x.txt)); c0.appendChild(el("small", null, x.n + " jugadores")); r.appendChild(c0);
      r.appendChild(el("div", "e", x.E + "%")); r.appendChild(el("div", "f", x.F + "%")); r.appendChild(el("div", null, x.real + "%"));
      box.appendChild(r);
    });
    v.appendChild(box);
    v.appendChild(el("p", "cp-note", "«Real» es cuántos fueron titulares de verdad. Cuanto más cerca de «Real» esté la E, mejor. Solo se cambia la fórmula con 3 jornadas medidas o más."));
  }

  cargar();
})();
