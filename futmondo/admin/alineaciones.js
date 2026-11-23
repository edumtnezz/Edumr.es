/* Administración → Alineaciones: nuestra web (E) contra FutbolFantasy (F) y el once oficial. Todo se escribe con textContent. */
(function () {
  var API = "/api/laquiniela";
  var $ = function (id) { return document.getElementById(id); };
  var D = null, tab = "jugados", fuente = "ambos", soloFallos = false, abiertos = {};
  try { var t0 = localStorage.getItem("cp:tab"); if (t0) tab = t0; var f0 = localStorage.getItem("cp:fuente"); if (f0) fuente = f0; } catch (e) {}
  var ROL = { portero: "POR", defensa: "DEF", centrocampista: "MED", delantero: "DEL" };
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function img(src, cls) { var i = el("img", cls); i.alt = ""; i.loading = "lazy"; if (src) i.src = src; i.onerror = function () { i.style.visibility = "hidden"; }; return i; }
  function gate(msg) { var g = $("cpGate"); g.textContent = msg; g.classList.remove("hidden"); $("cpApp").classList.add("hidden"); }
  function acierta(p, tit) { return p == null ? null : (p >= 50) === !!tit; }

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

  // Porcentaje de acierto de cada uno sobre TODOS los jugadores de los partidos ya jugados
  function totales() {
    var t = { E: { ok: 0, n: 0 }, F: { ok: 0, n: 0 }, partidos: 0 };
    (D.resultados || []).forEach(function (m) {
      t.partidos++;
      (m.jugadores || []).forEach(function (x) {
        var a = acierta(x.E, x.titular), b = acierta(x.F, x.titular);
        if (a != null) { t.E.n++; if (a) t.E.ok++; }
        if (b != null) { t.F.n++; if (b) t.F.ok++; }
      });
    });
    return t;
  }
  function pc(o) { return o.n ? Math.round(100 * o.ok / o.n) + "%" : "—"; }

  function pintar() {
    $("cpGate").classList.add("hidden"); $("cpApp").classList.remove("hidden");
    var T = totales(), sum = $("cpSum"); sum.textContent = "";
    var M = D.marcador || null;
    // MARCADOR grande: once acertado de media (de 11) de cada uno
    var big = el("div", "alz-big");
    big.appendChild(el("div", "alz-big-t", "¿Quién acierta más el once?"));
    var fila = el("div", "alz-big-r");
    [["E", "Nuestra web"], ["F", "FutbolFantasy"]].forEach(function (s) {
      var v = M && (s[0] === "E" ? (M.E5 || M.E2 || M.E) : M[s[0]]), c = el("div", "alz-big-c " + s[0]);
      c.appendChild(el("b", null, v ? String(v.once).replace(".", ",") : "—"));
      c.appendChild(el("i", null, "de 11"));
      c.appendChild(el("span", null, s[1]));
      fila.appendChild(c);
    });
    big.appendChild(fila);
    if (M && M.E && M.F) {
      var ME = M.E5 || M.E2 || M.E, dif = Math.round((M.F.once - ME.once) * 10) / 10;
      big.appendChild(el("div", "alz-big-v " + (dif > 0 ? "pierde" : dif < 0 ? "gana" : ""), dif > 0 ? "FutbolFantasy acierta " + String(dif).replace(".", ",") + " titulares más por equipo" : dif < 0 ? "Nuestra web acierta " + String(-dif).replace(".", ",") + " titulares más por equipo" : "Empate"));
      big.appendChild(el("small", null, ME.equipos + " equipos medidos · jornada " + (M.jornadas || []).join(", ")));
    }
    sum.appendChild(big);
    if (M && M.E) {
      var tb = el("div", "alz-tab2");
      var h = el("div", "alz-tr h"); ["", "Once", "Jugadores bien", "Error"].forEach(function (x) { h.appendChild(el("span", null, x)); }); tb.appendChild(h);
      [["E5", "Nuestra web (E5)"], ["F", "FutbolFantasy"], ["E7", "Prueba E7 (E5 + suelo)"], ["E6", "E6 (sin bajas)"], ["E2", "E2"], ["E", "E antigua"], ["E3", "Prueba E3"], ["E4", "Prueba E4 (convocatoria)"]].forEach(function (s) {
        var v = M[s[0]]; if (!v) return;
        var r = el("div", "alz-tr " + s[0]);
        r.appendChild(el("span", null, s[1]));
        r.appendChild(el("span", null, String(v.once).replace(".", ",") + "/11"));
        r.appendChild(el("span", null, v.bienPct + "%"));
        r.appendChild(el("span", null, String(v.brier).replace(".", ",")));
        tb.appendChild(r);
      });
      sum.appendChild(tb);
      sum.appendChild(el("p", "alz-note", "Medido con toda la plantilla. «Error» = Brier: cuanto más bajo, mejor. La web enseña E5: mitad nuestra (E6, o E2 si no hay) y mitad FutbolFantasy. E6 = E2 sin contar los partidos perdidos por lesión o sanción. E3 y E4 son pruebas. E4 = nuestra web + convocatoria oficial del club (no convocado = 0 %); de momento solo Real Madrid y Betis, en " + (M.conConvocatoria || 0) + " equipos medidos."));
    } else {
      [["E", "Nuestra web", T.E], ["F", "FutbolFantasy", T.F]].forEach(function (s) {
        var c = el("div", "alz-box " + s[0]);
        c.appendChild(el("b", null, pc(s[2]))); c.appendChild(el("span", null, s[1]));
        sum.appendChild(c);
      });
    }

    var ff = $("cpFiltros"); ff.textContent = "";
    [["ambos", "Los dos"], ["E", "Nuestra web"], ["F", "FutbolFantasy"]].forEach(function (f) {
      var b = el("button", "alz-chip" + (fuente === f[0] ? " on" : ""), f[1]); b.type = "button";
      b.onclick = function () { fuente = f[0]; try { localStorage.setItem("cp:fuente", fuente); } catch (e) {} pintar(); };
      ff.appendChild(b);
    });
    var fl = el("button", "alz-chip fallo" + (soloFallos ? " on" : ""), "Solo fallos"); fl.type = "button";
    fl.onclick = function () { soloFallos = !soloFallos; pintar(); };
    ff.appendChild(fl);

    var tabs = $("cpTabs"); tabs.textContent = "";
    [["jugados", "Jugados (" + (D.resultados || []).length + ")"], ["proximos", "Próximos (" + (D.pendientes || []).length + ")"], ["aprender", "Qué aprendemos"]].forEach(function (t) {
      var b = el("button", "alz-tab" + (tab === t[0] ? " on" : ""), t[1]); b.type = "button";
      b.onclick = function () { tab = t[0]; try { localStorage.setItem("cp:tab", tab); } catch (e) {} pintar(); };
      tabs.appendChild(b);
    });
    ff.classList.toggle("hidden", tab === "aprender");
    var v = $("cpView"); v.textContent = "";
    if (tab === "aprender") return aprender(v);
    var lista = tab === "proximos" ? D.pendientes || [] : D.resultados || [];
    if (!lista.length) { v.appendChild(el("div", "alz-empty", tab === "proximos" ? "No hay previsiones guardadas ahora mismo." : "Aún no hay partidos puntuados. Se puntúan solos en cuanto sale el once oficial.")); return; }
    v.appendChild(el("p", "alz-help", tab === "proximos" ? "Lo que marca cada uno ahora para el próximo partido." : "Toca un equipo para ver sus jugadores. Verde = acertó, rojo = falló."));
    lista.forEach(function (m, i) { v.appendChild(partido(m, i === 0)); });
  }

  function partido(m, abrir) {
    var key = m.j + ":" + m.k, open = abiertos[key] != null ? abiertos[key] : abrir;
    var c = el("div", "alz-m"), h = el("div", "alz-mh");
    h.appendChild(img(m.crest, "alz-crest"));
    var t = el("div", "alz-mt");
    t.appendChild(el("b", null, m.team));
    var sub = "J" + m.j;
    if (m.rival && m.rival.r) sub += " · " + (m.rival.casa ? "contra " : "en casa del ") + m.rival.r;
    if (m.pendiente && m.rival) sub += " · " + (m.rival.date || "") + " " + (m.rival.time || "");
    t.appendChild(el("span", null, sub));
    h.appendChild(t);
    if (!m.pendiente && m.aciertos) {
      var sc = el("div", "alz-score"), a = m.aciertos;
      if (fuente !== "F") { var e = el("div", "alz-sc E"); e.appendChild(el("b", null, Math.round(100 * a.propio / 11) + "%")); e.appendChild(el("i", null, "Nuestra web · " + a.propio + "/11")); sc.appendChild(e); }
      if (fuente !== "E" && a.ff != null) { var f = el("div", "alz-sc F"); f.appendChild(el("b", null, Math.round(100 * a.ff / 11) + "%")); f.appendChild(el("i", null, "FutbolFantasy · " + a.ff + "/11")); sc.appendChild(f); }
      h.appendChild(sc);
    }
    c.appendChild(h);
    var body = el("div", "alz-body" + (open ? "" : " hidden"));
    h.onclick = function () { abiertos[key] = body.classList.contains("hidden"); body.classList.toggle("hidden"); };
    var js = (m.jugadores || []).filter(function (x) {
      if (!soloFallos || m.pendiente) return true;
      var a = acierta(x.E, x.titular), b = acierta(x.F, x.titular);
      if (fuente === "E") return a === false;
      if (fuente === "F") return b === false;
      return a === false || b === false;
    });
    if (m.pendiente) {
      js.forEach(function (x) { body.appendChild(jugador(x, true)); });
    } else {
      var tit = js.filter(function (x) { return x.titular; }), no = js.filter(function (x) { return !x.titular; });
      if (tit.length) { body.appendChild(el("div", "alz-sec", "Fueron titulares (once oficial)")); tit.forEach(function (x) { body.appendChild(jugador(x, false)); }); }
      if (no.length) { body.appendChild(el("div", "alz-sec", "No fueron titulares")); no.forEach(function (x) { body.appendChild(jugador(x, false)); }); }
      if (!js.length) body.appendChild(el("div", "alz-empty", "Sin fallos aquí."));
    }
    c.appendChild(body);
    return c;
  }

  function caja(lbl, v, tit, prox) {
    var q = el("div", "alz-q " + (lbl === "E" ? "E" : "F"));
    q.appendChild(el("small", null, lbl === "E" ? "Nuestra web" : "FutbolFantasy"));
    q.appendChild(el("b", null, v == null ? "—" : (lbl === "E" ? Math.max(0, Math.min(95, Math.round(v / 5) * 5)) : v) + "%"));
    if (!prox && v != null) { var ok = acierta(v, tit); q.classList.add(ok ? "ok" : "ko"); q.appendChild(el("i", null, ok ? "✓ acertó" : "✗ falló")); }
    return q;
  }

  function jugador(x, prox) {
    var r = el("div", "alz-p");
    var ph = el("div", "alz-ph"); ph.appendChild(img(x.photo, "f")); if (x.logo) ph.appendChild(img(x.logo, "c")); r.appendChild(ph);
    var i = el("div", "alz-pi");
    i.appendChild(el("b", null, x.name + (ROL[x.role] ? " · " + ROL[x.role] : "")));
    if (!prox) i.appendChild(el("span", "alz-real " + (x.titular ? "t" : "n"), x.titular ? "Fue titular" : "No fue titular"));
    i.appendChild(el("div", "alz-why", x.sitTxt || (x.E == null ? "No teníamos su E guardada." : "")));
    var d = el("div", "alz-dots");
    (x.ult || []).slice().reverse().forEach(function (u) { d.appendChild(el("i", "alz-dot " + u, u === "N" ? "–" : u)); });
    if (d.childNodes.length) { i.appendChild(d); i.appendChild(el("small", "alz-dl", "Últimos 5 partidos (T titular, S suplente, – no jugó)")); }
    r.appendChild(i);
    var p = el("div", "alz-pct");
    if (fuente !== "F") p.appendChild(caja("E", x.E, x.titular, prox));
    if (fuente !== "E") p.appendChild(caja("F", x.F, x.titular, prox));
    r.appendChild(p);
    return r;
  }

  function aprender(v) {
    var a = D.aprendizaje || [];
    if (!a.length) { v.appendChild(el("div", "alz-empty", "Aún no hay partidos puntuados para aprender.")); return; }
    v.appendChild(el("p", "alz-help", "Por cada situación del jugador antes del partido: qué % le damos nosotros, qué % FutbolFantasy y cuántos fueron titulares de verdad. Cuanto más cerca de «Real», mejor."));
    a.forEach(function (x) {
      var r = el("div", "alz-ap");
      var t = el("div", "alz-apt"); t.appendChild(el("b", null, x.txt)); t.appendChild(el("small", null, x.n + " jugadores")); r.appendChild(t);
      var g = el("div", "alz-apg");
      [["Nuestra web", x.E, "E"], ["FutbolFantasy", x.F, "F"], ["Real", x.real, "R"]].forEach(function (c) { var q = el("div", "alz-q " + c[2]); q.appendChild(el("small", null, c[0])); q.appendChild(el("b", null, c[1] == null ? "—" : c[1] + "%")); g.appendChild(q); });
      r.appendChild(g); v.appendChild(r);
    });
    v.appendChild(el("p", "alz-help", "Solo se cambia la fórmula con 3 jornadas medidas o más."));
  }

  cargar();
})();
