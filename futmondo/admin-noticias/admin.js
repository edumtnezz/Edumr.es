/* Administrador de noticias (privado). Todo lo que se pinta se escribe con textContent. */
(function () {
  var API = "/api/laquiniela";
  var $ = function (id) { return document.getElementById(id); };
  var D = null, tab = "borradores", abierto = null, filtroSrc = "";
  var ETIQ = { disponible: "disponible", opcion_titular: "opción de titular", duda: "duda", recuperacion_con_grupo: "entrena con el grupo", recuperacion_parcial: "entrena parcialmente", baja: "baja", titular_confirmado: "titular confirmado", rotacion: "rotación" };

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function tag(txt, k) { return el("span", "ad-tag" + (k ? " " + k : ""), txt); }
  function cuando(ms) {
    if (!ms) return "";
    try { return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ms)); } catch (e) { return ""; }
  }
  function toast(t) { var d = el("div", "ad-toast", t); document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2200); }
  function post(body) {
    return fetch(API + "/admin-noticias", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Error"); return j; }); });
  }
  function cargar(keep) {
    return fetch(API + "/admin-noticias", { cache: "no-store" }).then(function (r) { if (r.status === 403) throw new Error("403"); return r.json(); }).then(function (d) { D = d; pinta(); }).catch(function (e) {
      if (keep && D) { toast("No pude actualizar"); return; }
      puerta(e && e.message === "403");
    });
  }

  function puerta(logueado) {
    $("adApp").classList.add("hidden");
    var g = $("adGate"); g.classList.remove("hidden"); g.innerHTML = "";
    if (logueado) { g.appendChild(el("p", "ad-empty", "Esta cuenta no es de administrador.")); return; }
    g.appendChild(el("h2", null, "Entra con tu usuario"));
    var n = el("input", "ad-i"); n.placeholder = "Nombre"; n.autocomplete = "username";
    var p = el("input", "ad-i"); p.placeholder = "Código"; p.type = "password"; p.inputMode = "numeric"; p.autocomplete = "current-password";
    var b = el("button", "ad-b main", "Entrar"); b.type = "button";
    var m = el("p", "ad-meta", "");
    b.addEventListener("click", function () {
      fetch(API + "/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nombre: n.value, pin: p.value }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (j.error) { m.textContent = j.error; return; } location.reload(); }).catch(function () { m.textContent = "Sin conexión."; });
    });
    [n, p, b, m].forEach(function (x, i) { if (i < 2) { var l = el("label", "ad-l", i ? "Código" : "Nombre"); g.appendChild(l); } g.appendChild(x); });
  }

  function pinta() {
    $("adGate").classList.add("hidden"); $("adApp").classList.remove("hidden");
    var nb = D.own.filter(function (x) { return x.status !== "published"; }).length;
    var tabs = [["borradores", "Borradores" + (nb ? " (" + nb + ")" : "")], ["publicadas", "Publicadas"], ["redactor", "Redactor"], ["comparar", "Comparar"], ["estado", "Estado"]];
    var t = $("adTabs"); t.innerHTML = "";
    tabs.forEach(function (x) { var b = el("button", "ad-chip" + (tab === x[0] ? " on" : ""), x[1]); b.type = "button"; b.addEventListener("click", function () { tab = x[0]; abierto = null; pinta(); }); t.appendChild(b); });
    var v = $("adView"); v.innerHTML = "";
    if (tab === "borradores" || tab === "publicadas") vistaPropias(v, tab === "publicadas");
    else if (tab === "redactor") vistaRedactor(v);
    else if (tab === "comparar") vistaComparar(v);
    else vistaEstado(v);
  }

  /* ----- Propias ----- */
  function vistaPropias(v, pub) {
    var lista = D.own.filter(function (x) { return (x.status === "published") === pub; });
    if (!pub) {
      var nuevo = el("button", "ad-b", "+ Noticia en blanco"); nuevo.type = "button";
      nuevo.addEventListener("click", function () { post({ action: "crear" }).then(function (j) { abierto = j.item.id; return cargar(); }).catch(function (e) { toast(e.message); }); });
      v.appendChild(nuevo);
    }
    if (!lista.length) v.appendChild(el("p", "ad-empty", pub ? "Todavía no has publicado ninguna." : "Sin borradores. Crea uno desde la pestaña Redactor."));
    lista.forEach(function (x) { v.appendChild(tarjetaPropia(x)); });
  }
  function tarjetaPropia(x) {
    var c = el("div", "ad-card");
    var h = el("h2", null, x.title || "(sin título)");
    h.style.cursor = "pointer";
    h.addEventListener("click", function () { abierto = abierto === x.id ? null : x.id; pinta(); });
    c.appendChild(h);
    var m = el("p", "ad-meta"); m.appendChild(tag(x.status === "published" ? "Publicada" : "Borrador", x.status === "published" ? "ok" : "warn"));
    if (x.club) m.appendChild(tag(x.club));
    m.appendChild(document.createTextNode("Editada " + cuando(x.updatedAt) + (x.publishedAt ? " · publicada " + cuando(x.publishedAt) : "")));
    c.appendChild(m);
    if (abierto !== x.id) return c;

    var two = el("div", "ad-two");
    // Izquierda: original (lo que dijo la fuente). Derecha: versión nuestra, editable.
    var o = el("div", "ad-box"); o.appendChild(el("h3", null, "Original (fuente)"));
    if (x.source && x.source.url) { var a = el("a", "ad-link", x.source.name || "Fuente"); a.href = x.source.url; a.target = "_blank"; a.rel = "noopener"; o.appendChild(a); }
    else o.appendChild(el("p", "ad-meta", "Sin fuente: añade una abajo."));
    (x.original || []).forEach(function (r) {
      var row = el("div", "ad-row");
      var k = el("div", "k"); k.textContent = r.jugador + " · " + (ETIQ[r.estado] || r.estado) + (r.minuto ? " · min " + r.minuto : "");
      var q = el("q", null, r.frase);
      var tg = el("div"); tg.appendChild(tag(r.verificada ? "frase verificada" : "frase sin verificar", r.verificada ? "ok" : "bad")); tg.appendChild(tag(r.cruzado ? "jugador reconocido" : "jugador sin cruzar", r.cruzado ? "ok" : "bad")); tg.appendChild(tag("confianza " + (r.confianza || "?")));
      row.appendChild(k); row.appendChild(q); row.appendChild(tg); o.appendChild(row);
    });
    if (!(x.original || []).length) o.appendChild(el("p", "ad-meta", "Escrita a mano."));
    var cmp = D.comparacion && (D.comparacion.propias || []).filter(function (c) { return c.id === x.id; })[0];
    o.appendChild(el("h3", null, "Otras webs sobre el mismo jugador"));
    if (cmp && cmp.matches.length) cmp.matches.forEach(function (m) {
      var r = el("div", "ad-row"); var a2 = el("a", "ad-link", m.title); a2.href = m.link; a2.target = "_blank"; a2.rel = "noopener";
      r.appendChild(a2); var tg2 = el("div"); tg2.appendChild(tag(m.src)); tg2.appendChild(document.createTextNode([m.date, m.time].filter(Boolean).join(" "))); r.appendChild(tg2); o.appendChild(r);
    });
    else o.appendChild(el("p", "ad-meta", cmp ? "Ninguna otra web lo ha contado (por ahora)." : "Aún sin comparar."));
    two.appendChild(o);

    var f = el("div", "ad-box"); f.appendChild(el("h3", null, "Versión EduMR"));
    var ti = el("input", "ad-i"); ti.value = x.title || "";
    var le = el("input", "ad-i"); le.value = x.lead || "";
    var bo = el("textarea", "ad-i"); bo.value = x.body || "";
    var sn = el("input", "ad-i"); sn.value = (x.source && x.source.name) || "";
    var su = el("input", "ad-i"); su.value = (x.source && x.source.url) || ""; su.placeholder = "https://…";
    [["Título", ti], ["Entradilla", le], ["Texto (una línea = un párrafo)", bo], ["Fuente (nombre)", sn], ["Fuente (enlace)", su]].forEach(function (p) { f.appendChild(el("label", "ad-l", p[0])); f.appendChild(p[1]); });
    two.appendChild(f);
    c.appendChild(two);

    var bt = el("div", "ad-btns");
    function btn(txt, cls, fn) { var b = el("button", "ad-b " + (cls || ""), txt); b.type = "button"; b.addEventListener("click", function () { b.disabled = true; fn().then(function (msg) { toast(msg); return cargar(true); }).catch(function (e) { toast(e.message); b.disabled = false; }); }); bt.appendChild(b); }
    var datos = function (action) { return { action: action, id: x.id, title: ti.value, lead: le.value, body: bo.value, club: x.club || "", source: { name: sn.value, url: su.value } }; };
    btn("Guardar", "", function () { return post(datos("guardar")).then(function () { return "Guardado"; }); });
    if (x.status === "published") btn("Quitar de la web", "", function () { return post({ action: "despublicar", id: x.id }).then(function () { abierto = null; return "Quitada"; }); });
    else btn("Publicar", "main", function () { return post(datos("guardar")).then(function () { return post({ action: "publicar", id: x.id }); }).then(function () { abierto = null; tab = "publicadas"; return "Publicada"; }); });
    btn("Borrar", "del", function () { if (!confirm("¿Borrar esta noticia?")) return Promise.reject(new Error("Cancelado")); return post({ action: "borrar", id: x.id }).then(function () { abierto = null; return "Borrada"; }); });
    c.appendChild(bt);
    if (x.status === "published") { var vl = el("a", "ad-link", "Ver en la web"); vl.href = "/futmondo/guiafantasy/noticias/ed-" + x.id; vl.target = "_blank"; vl.style.display = "inline-block"; vl.style.marginTop = "10px"; c.appendChild(vl); }
    return c;
  }

  /* ----- Redactor (publica solo) ----- */
  function vistaRedactor(v) {
    if (!D.sombra.length) v.appendChild(el("p", "ad-empty", "Aún no hay ruedas procesadas. Publica solo, cada 2 minutos, si la frase, el jugador y el estado cuadran. Hace falta la clave GEMINI_API_KEY."));
    D.sombra.forEach(function (s) {
      var c = el("div", "ad-card");
      c.appendChild(el("h2", null, s.title || s.id));
      var m = el("p", "ad-meta"); m.appendChild(tag(s.club)); m.appendChild(document.createTextNode("Vídeo " + cuando(Date.parse(s.pub) || s.pub) + " · leído " + cuando(s.at)));
      var a = el("a", "ad-link", " ▶ ver vídeo"); a.href = "https://youtu.be/" + s.id; a.target = "_blank"; a.rel = "noopener"; m.appendChild(a); c.appendChild(m);
      (s.items || []).forEach(function (r) {
        var row = el("div", "ad-row");
        var k = el("div", "k");
        k.textContent = (r.nombre || r.jugador) + " · " + (ETIQ[r.estado] || r.estado) + (r.minuto ? " · min " + r.minuto : "");
        row.appendChild(k); row.appendChild(el("q", null, r.frase));
        var tg = el("div"); tg.appendChild(tag(r.publicable ? "se publicó" : "no se publicó", r.publicable ? "ok" : "bad"));
        if (!r.verificada) tg.appendChild(tag("frase no verificada", "bad")); if (!r.cruzado) tg.appendChild(tag("sin cruzar con Futmondo", "bad")); tg.appendChild(tag("confianza " + (r.confianza || "?")));
        row.appendChild(tg);
        if (r.motivo) row.appendChild(el("p", "ad-meta", r.motivo));
        c.appendChild(row);
      });
      if (!(s.items || []).length) c.appendChild(el("p", "ad-meta", "Sin jugadores mencionados."));
      var usado = D.usadas[s.id];
      var ya = (D.own || []).filter(function (o) { return o.id === usado; })[0];
      if (ya) {
        var bt = el("div", "ad-btns");
        var u = el("button", "ad-b", ya.status === "published" ? "Ver publicada" : "Ver guardada"); u.type = "button";
        u.addEventListener("click", function () { tab = ya.status === "published" ? "publicadas" : "borradores"; abierto = usado; pinta(); });
        bt.appendChild(u); c.appendChild(bt);
      }
      v.appendChild(c);
    });
  }

  /* ----- Comparar con otras webs ----- */
  function vistaComparar(v) {
    var ex = D.externas || [];
    var srcs = {}; ex.forEach(function (x) { srcs[x.src || "FutbolFantasy"] = (srcs[x.src || "FutbolFantasy"] || 0) + 1; });
    var bar = el("div", "ad-tabs");
    [""].concat(Object.keys(srcs)).forEach(function (s) { var b = el("button", "ad-chip" + (filtroSrc === s ? " on" : ""), (s || "Todas") + " (" + (s ? srcs[s] : ex.length) + ")"); b.type = "button"; b.addEventListener("click", function () { filtroSrc = s; pinta(); }); bar.appendChild(b); });
    v.appendChild(bar);
    v.appendChild(el("p", "ad-meta", "Solo para comparar con lo nuestro. No se publica ni se avisa de nada de esto."));
    var cm = D.comparacion;
    if (cm) {
      var rs = el("div", "ad-card"); rs.appendChild(el("h2", null, "Cobertura (últimas 72 h)"));
      rs.appendChild(el("p", "ad-meta", cm.total + " noticias nuestras · " + cm.coincide + " también las cuentan otras webs · " + (cm.sinCubrir || []).length + " titulares de otras webs que no tratamos (aprox.)"));
      v.appendChild(rs);
    }
    var l = ex.filter(function (x) { return !filtroSrc || (x.src || "FutbolFantasy") === filtroSrc; });
    if (!l.length) v.appendChild(el("p", "ad-empty", "Sin datos ahora mismo."));
    l.forEach(function (x) {
      var c = el("div", "ad-card");
      var a = el("a", "ad-link", x.title); a.href = x.link; a.target = "_blank"; a.rel = "noopener"; a.style.display = "block";
      c.appendChild(a);
      var m = el("p", "ad-meta"); m.style.margin = "6px 0 0"; m.appendChild(tag(x.src || "FutbolFantasy")); m.appendChild(document.createTextNode([x.date, x.time].filter(Boolean).join(" ")));
      c.appendChild(m); v.appendChild(c);
    });
  }

  /* ----- Estado del redactor ----- */
  function vistaEstado(v) {
    var e = D.estado;
    var c = el("div", "ad-card"); c.appendChild(el("h2", null, "Redactor automático"));
    c.appendChild(el("p", "ad-meta", "Publica en la web y avisa por Telegram solo lo verificado. No crea borradores. Pasa cada 2 minutos."));
    if (!e) { c.appendChild(el("p", "ad-empty", "Todavía no ha arrancado (falta la clave GEMINI_API_KEY en el Worker edumr-cron).")); v.appendChild(c); return; }
    if (e.tok) c.appendChild(el("p", "ad-meta", "Tokens hoy (" + e.tok.d + "): " + (e.tok.n || 0) + " de 450.000"));
    v.appendChild(c);
    var f = el("div", "ad-card"); f.appendChild(el("h2", null, "Canales de YouTube"));
    Object.keys(e.fuentes || {}).forEach(function (club) {
      var s = e.fuentes[club]; var row = el("div", "ad-row");
      var k = el("div", null, club); row.appendChild(k);
      var tg = el("div"); tg.appendChild(tag(s.ok ? "funciona" : "falla", s.ok ? "ok" : "bad")); if (s.via) tg.appendChild(tag("vía " + s.via)); if (s.at) tg.appendChild(document.createTextNode(cuando(s.at)));
      row.appendChild(tg); f.appendChild(row);
    });
    v.appendChild(f);
    var p = el("div", "ad-card"); p.appendChild(el("h2", null, "Vídeos vistos"));
    (e.seen || []).slice().reverse().forEach(function (s) {
      var row = el("div", "ad-row"); row.appendChild(el("div", null, (s.club || "") + " · " + (s.title || s.id)));
      var tg = el("div"); tg.appendChild(tag(s.status || "?", s.status === "ok" ? "ok" : (s.status === "pend" ? "warn" : "bad"))); if (s.err) tg.appendChild(document.createTextNode(String(s.err).slice(0, 90)));
      row.appendChild(tg); p.appendChild(row);
    });
    if (!(e.seen || []).length) p.appendChild(el("p", "ad-empty", "Ninguno aún."));
    v.appendChild(p);
  }

  cargar();
})();
