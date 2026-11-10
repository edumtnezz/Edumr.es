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
    var tabs = [["borradores", "Borradores" + (nb ? " (" + nb + ")" : "")], ["publicadas", "Publicadas"], ["redactor", "Redactor"], ["comparar", "Comparar"], ["historial", "Historial"], ["estado", "Estado"]];
    var t = $("adTabs"); t.innerHTML = "";
    tabs.forEach(function (x) { var b = el("button", "ad-chip" + (tab === x[0] ? " on" : ""), x[1]); b.type = "button"; b.addEventListener("click", function () { tab = x[0]; abierto = null; pinta(); }); t.appendChild(b); });
    var v = $("adView"); v.innerHTML = "";
    if (tab === "borradores" || tab === "publicadas") vistaPropias(v, tab === "publicadas");
    else if (tab === "redactor") vistaRedactor(v);
    else if (tab === "comparar") vistaComparar(v);
    else if (tab === "historial") vistaHistorial(v);
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
    var orig = el("div", "ad-orig"); o.appendChild(orig);
    if (x.source && /^https:\/\/www\.(futbolfantasy|comuniate)\.com\//.test(x.source.url || "")) {
      orig.appendChild(el("p", "ad-meta ad-load", "Cargando el original…"));
      fetch(API + "/noticia?u=" + encodeURIComponent(x.source.url), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
        orig.innerHTML = "";
        if (!d || d.error || d.removed || (!d.title && !d.html)) { orig.appendChild(el("p", "ad-meta", "No he podido leer el original (abre el enlace de arriba).")); return; }
        if (d.title) orig.appendChild(el("h4", null, d.title));
        if (d.lead) orig.appendChild(el("p", "ad-lead", d.lead));
        try { new DOMParser().parseFromString("<body>" + (d.html || "") + "</body>", "text/html").body.querySelectorAll("p,li").forEach(function (n) { var s = (n.textContent || "").replace(/\s+/g, " ").trim(); if (s) orig.appendChild(el("p", "ad-par", s)); }); } catch (e) {}
      }).catch(function () { orig.innerHTML = ""; orig.appendChild(el("p", "ad-meta", "No he podido leer el original.")); });
    }
    (x.original || []).forEach(function (r) {
      var row = el("div", "ad-row");
      var k = el("div", "k"); k.textContent = r.jugador + " · " + (ETIQ[r.estado] || r.estado) + (r.minuto ? " · min " + r.minuto : "");
      var q = el("q", null, r.frase);
      var tg = el("div"); tg.appendChild(tag(r.verificada ? "frase verificada" : "frase sin verificar", r.verificada ? "ok" : "bad")); tg.appendChild(tag(r.cruzado ? "jugador reconocido" : "jugador sin cruzar", r.cruzado ? "ok" : "bad")); tg.appendChild(tag("confianza " + (r.confianza || "?")));
      row.appendChild(k); row.appendChild(q); row.appendChild(tg); o.appendChild(row);
    });
    if (!(x.original || []).length && !(x.source && x.source.url)) o.appendChild(el("p", "ad-meta", "Escrita a mano."));
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
    var pst = el("p", "ad-meta", x.thumb ? "Portada actual: ver abajo." : "");
    var pim = el("img"); pim.style.cssText = "max-width:100%;border-radius:8px;margin-top:8px;display:" + (x.thumb ? "block" : "none"); if (x.thumb) pim.src = x.thumb;
    var pb = el("button", "ad-b", "Generar portada (ChatGPT)"); pb.type = "button";
    function cargaImg(src) { return new Promise(function (ok, ko) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ko(new Error("imagen")); }; i.src = src; }); }
    // Le pega encima el escudo real (izquierda) y la marca NOTICIAS real, pequeña, arriba a la derecha
    function componer(j) {
      return Promise.all([cargaImg("data:image/png;base64," + j.b64), cargaImg("/img/noticias-marca.png"), j.crest ? cargaImg("data:image/png;base64," + j.crest) : Promise.resolve(null)]).then(function (r) {
        var W = r[0].naturalWidth, H = r[0].naturalHeight, c = document.createElement("canvas"); c.width = W; c.height = H;
        var g = c.getContext("2d"); g.drawImage(r[0], 0, 0, W, H);
        if (r[2]) {
          var ch = H * 0.5, cw = ch * r[2].naturalWidth / r[2].naturalHeight, cx = W * 0.045, cy = (H - ch) / 2;
          g.save(); g.shadowColor = "rgba(255,255,255,.55)"; g.shadowBlur = H * 0.05; g.drawImage(r[2], cx, cy, cw, ch); g.restore();
        }
        var lw = W * 0.075, lh = lw * r[1].naturalHeight / r[1].naturalWidth; g.drawImage(r[1], W - lw - W * 0.025, H * 0.035, lw, lh);
        return c.toDataURL("image/jpeg", 0.9).split(",")[1];
      });
    }
    pb.addEventListener("click", function () {
      pb.disabled = true; pst.style.color = ""; pst.textContent = "Generando con ChatGPT… puede tardar 1 minuto. No cierres esta pantalla.";
      post({ action: "portada", id: x.id }).then(function (j) {
        pst.textContent = (j.conFoto ? "Hecha con la foto de " + (j.jugador || "el jugador") + ". " : "Sin foto del jugador. ") + "Pegando escudo y marca…";
        return componer(j).then(function (b64) { return post({ action: "portada-guardar", id: x.id, b64: b64 }); });
      }).then(function (j) {
        pst.textContent = "Portada guardada. Si no te gusta, pulsa otra vez.";
        if (j.item && j.item.thumb) { pim.src = j.item.thumb; pim.style.display = "block"; }
      }).catch(function (e) { pst.style.color = "#b91c1c"; pst.textContent = "Fallo: " + (e && e.message || "sin respuesta"); }).then(function () { pb.disabled = false; });
    });
    bt.appendChild(pb); c.appendChild(pst); c.appendChild(pim);
    var det = el("details", "ad-meta"); det.appendChild(el("summary", null, "Ver / cambiar el texto (prompt) que se manda a ChatGPT"));
    var clave = x.tipo === "once" ? "once" : "jugador";
    det.appendChild(el("p", "ad-meta", "Se rellena solo: {club} {jugador} {local} {visitante} {jugador1} {jugador2}. Vale para todas las noticias de este tipo (" + (clave === "once" ? "onces" : "jugador") + ")."));
    var pta = el("textarea", "ad-i"); pta.rows = 10; pta.value = (D.prompts && D.prompts[clave]) || ""; det.appendChild(pta);
    var psv = el("button", "ad-b", "Guardar texto"); psv.type = "button";
    psv.addEventListener("click", function () { var o = { action: "prompts", jugador: D.prompts.jugador, once: D.prompts.once }; o[clave] = pta.value; post(o).then(function (j) { D.prompts = j.prompts; toast("Texto guardado"); }).catch(function (e) { toast(e.message); }); });
    det.appendChild(psv); c.appendChild(det);
    var bor = el("button", "ad-b del", "Borrar"); bor.type = "button"; var borT = null;
    bor.addEventListener("click", function () {
      if (!bor.dataset.sure) { bor.dataset.sure = "1"; bor.textContent = "¿Seguro? Pulsa otra vez"; bor.classList.add("sure"); borT = setTimeout(function () { delete bor.dataset.sure; bor.textContent = "Borrar"; bor.classList.remove("sure"); }, 4000); return; }
      clearTimeout(borT); bor.disabled = true;
      post({ action: "borrar", id: x.id }).then(function () { abierto = null; toast("Borrada"); return cargar(true); }).catch(function (e) { bor.disabled = false; toast(e.message); });
    });
    bt.appendChild(bor);
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

  /* ----- Historial de movimientos ----- */
  var ACC = { guardar: ["Editó", "ok"], publicar: ["Publicó", "ok"], quitar: ["Quitó de la web", "warn"], borrar: ["Borró", "bad"], portada: ["Generó portada", ""], prompts: ["Cambió el texto de portadas", ""] };
  function vistaHistorial(v) {
    v.appendChild(el("p", "ad-meta", "Todo lo que haces aquí queda guardado. El redactor aprende de tus ediciones y de lo que borras."));
    var l = D.log || [];
    if (!l.length) v.appendChild(el("p", "ad-empty", "Aún no hay movimientos."));
    l.forEach(function (e) {
      var c = el("div", "ad-card ad-ev");
      var a = ACC[e.a] || [e.a, ""];
      var top = el("div", "ad-evtop"); top.appendChild(tag(a[0], a[1])); top.appendChild(el("span", "ad-meta", cuando(e.at))); c.appendChild(top);
      c.appendChild(el("div", "ad-evt", e.t || ""));
      if (e.antes && e.despues) {
        var dd = el("details", "ad-det"); dd.appendChild(el("summary", null, "Ver qué cambió"));
        [["Antes", e.antes], ["Después", e.despues]].forEach(function (p) { var b = el("div", "ad-diff"); b.appendChild(el("b", null, p[0])); b.appendChild(el("p", null, (p[1].title || "") + (p[1].lead ? " — " + p[1].lead : ""))); if (p[1].body) b.appendChild(el("p", "ad-meta", p[1].body)); dd.appendChild(b); });
        c.appendChild(dd);
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
    if (!e) c.appendChild(el("p", "ad-empty", "Todavía no ha arrancado (falta la clave GEMINI_API_KEY en el Worker edumr-cron)."));
    v.appendChild(c);
    v.appendChild(formPista());
    if (!e) return;
    if (e.tok) c.appendChild(el("p", "ad-meta", "Tokens hoy (" + e.tok.d + "): " + (e.tok.n || 0) + " de 450.000"));
    if (e.pistas) c.appendChild(el("p", "ad-meta", "Pistas: " + (e.pistas.recibidas || 0) + " recibidas, " + (e.pistas.verificadas || 0) + " verificadas, " + (e.pistas.publicadas || 0) + " publicadas, " + (e.pistas.descartadas || 0) + " descartadas"));
    if (e.deteccion) Object.keys(e.deteccion).forEach(function (k) {
      var d = e.deteccion[k] || {};
      c.appendChild(el("p", "ad-meta", "Detector " + k + ": " + (d.ok ? "bien, " + (d.n || 0) + " pistas" : "sin lectura") + (d.err ? " (" + d.err + ")" : "")));
    });
    if (e.tg) c.appendChild(el("p", "ad-meta", (e.tg.ok ? "Telegram: el último aviso fue aceptado" : "Telegram: el último aviso no fue aceptado") + (e.tg.err ? " (" + e.tg.err + ")" : "") + (e.tg.pendientes ? " · pendientes " + e.tg.pendientes : "")));
    var f = el("div", "ad-card"); f.appendChild(el("h2", null, "Canales de YouTube"));
    Object.keys(e.fuentes || {}).forEach(function (club) {
      var s = e.fuentes[club]; var row = el("div", "ad-row");
      var k = el("div", null, club); row.appendChild(k);
      var tg = el("div"); tg.appendChild(tag(s.ok ? "funciona" : "falla", s.ok ? "ok" : "bad")); if (s.via) tg.appendChild(tag("vía " + s.via)); if (s.web) tg.appendChild(tag(String(s.web).slice(0, 42), /prohib|ilegible|sin |html|sitemap/.test(s.web) ? "bad" : "ok")); if (s.at) tg.appendChild(document.createTextNode(cuando(s.at)));
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

  function formPista() {
    var c = el("div", "ad-card");
    c.appendChild(el("h2", null, "Añadir pista"));
    c.appendChild(el("p", "ad-meta", "Solo el tema. El redactor busca el dato en la web oficial. No publica desde aquí."));
    var equipo = el("input", "ad-i"); equipo.placeholder = "Equipo";
    var tipo = el("select", "ad-i");
    ["lesion", "rueda", "cronica", "once", "convocatoria", "mercado", "otro"].forEach(function (t) { var o = el("option", null, t); o.value = t; tipo.appendChild(o); });
    var jugadores = el("input", "ad-i"); jugadores.placeholder = "Jugadores, separados por comas";
    var entrenador = el("input", "ad-i"); entrenador.placeholder = "Entrenador, si habla él";
    var tema = el("input", "ad-i"); tema.placeholder = "Tema, con tus palabras";
    var b = el("button", "ad-b main", "Guardar pista"); b.type = "button";
    b.addEventListener("click", function () {
      post({ action: "pista", equipo: equipo.value, tipo: tipo.value, jugadores: jugadores.value, entrenador: entrenador.value, tema: tema.value }).then(function () {
        equipo.value = jugadores.value = entrenador.value = tema.value = "";
        toast("Pista guardada");
        return cargar(true);
      }).catch(function (e) { toast(e.message); });
    });
    [equipo, tipo, jugadores, entrenador, tema, b].forEach(function (x) { c.appendChild(x); });
    return c;
  }

  cargar();
})();
