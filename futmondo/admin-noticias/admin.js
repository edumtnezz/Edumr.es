/* Administrador de noticias (privado). Todo lo que se pinta se escribe con textContent. */
(function () {
  var API = "/api/laquiniela";
  var $ = function (id) { return document.getElementById(id); };
  var D = null, tab = "actividad", abierto = null, filtroSrc = "", scrollPend = null;
  var TABS_OK = ["actividad", "publicadas", "borradores", "redactor", "comparar", "historial", "estado"];
  // La pestaña, la noticia abierta y el punto de la lista se recuerdan al recargar (solo en este dispositivo)
  try { var g0 = JSON.parse(localStorage.getItem("adm:vista") || "null"); if (g0 && TABS_OK.indexOf(g0.tab) >= 0) { tab = g0.tab; abierto = g0.abierto || null; scrollPend = g0.y || 0; } } catch (e) {}
  function guardaVista() { try { localStorage.setItem("adm:vista", JSON.stringify({ tab: tab, abierto: abierto, y: Math.round(window.scrollY || 0) })); } catch (e) {} }
  var tG = null; window.addEventListener("scroll", function () { clearTimeout(tG); tG = setTimeout(guardaVista, 250); }, { passive: true });
  var ETIQ = { disponible: "disponible", opcion_titular: "opción de titular", duda: "duda", recuperacion_con_grupo: "entrena con el grupo", recuperacion_parcial: "entrena parcialmente", baja: "baja", titular_confirmado: "titular confirmado", rotacion: "rotación" };

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function tag(txt, k) { return el("span", "ad-tag" + (k ? " " + k : ""), txt); }
  function cuando(ms) {
    if (!ms) return "";
    try { return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ms)); } catch (e) { return ""; }
  }
  function toast(t) { var d = el("div", "ad-toast", t); document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2200); }
  function post(body) {
    return fetch(API + "/admin-noticias", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(function (r) {
      return r.text().then(function (tx) {
        var j = null; try { j = JSON.parse(tx); } catch (e) {}
        if (!j) throw new Error("El servidor no contestó bien (código " + r.status + "). Vuelve a intentarlo.");
        if (!r.ok || j.error) throw new Error(j.error || "Error");
        return j;
      });
    });
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
    var tabs = [["actividad", "Actividad"], ["publicadas", "Publicadas " + (D.own.length - nb)], ["borradores", "Borradores" + (nb ? " " + nb : "")], ["redactor", "Redactor " + (D.sombra || []).length], ["comparar", "Comparar"], ["historial", "Historial"], ["estado", "Estado"]];
    var t = $("adTabs"); t.innerHTML = "";
    tabs.forEach(function (x) { var b = el("button", "ad-chip" + (tab === x[0] ? " on" : ""), x[1]); b.type = "button"; b.addEventListener("click", function () { tab = x[0]; abierto = null; pinta(); }); t.appendChild(b); });
    guardaVista();
    var v = $("adView"); v.innerHTML = "";
    if (tab === "actividad") vistaActividad(v);
    else if (tab === "borradores" || tab === "publicadas") vistaPropias(v, tab === "publicadas");
    else if (tab === "redactor") vistaRedactor(v);
    else if (tab === "comparar") vistaComparar(v);
    else if (tab === "historial") vistaHistorial(v);
    else vistaEstado(v);
    if (scrollPend != null) { var y0 = scrollPend; scrollPend = null; requestAnimationFrame(function () { window.scrollTo(0, y0); }); }
  }


  var ICO = {
    pub: '<path d="M4 5h13a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2V5z"/><path d="M8 9h7M8 13h7"/>',
    off: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/>',
    tg: '<path d="M21 3L3 11l6 2 2 7 3-5 5 4z"/>',
    stat: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'
  };
  function ico(k) { var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "16"); s.setAttribute("height", "16"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.innerHTML = ICO[k] || ""; return s; }
  var VER = { vender: ["VENDER", "v"], duda: ["DUDA", "a"], fichar: ["FICHAR", "g"], alinear: ["ALINEAR", "g"] };
  function chipVer(x) { var v = VER[x.veredicto]; if (!v) return null; var c = el("span", "ad-ver " + v[1], v[0] + (x.veredicto === "vender" && x.plazo && x.plazo !== "sin plazo" ? " · " + x.plazo : "")); return c; }
  function origenDe(x) {
    var k = String(x.key || ""), p = x.porque || {};
    if (k.indexOf("ext-") === 0 || p.fuente) return "Tema de " + (p.fuente || (x.source && x.source.name) || "otra web") + ", reescrito con palabras propias";
    if (x.source && x.source.videoId) return "Rueda de prensa de " + (x.club || "un club");
    if (x.tipo === "analisis") return "Análisis propio con datos de Futmondo";
    return "Redactor automático";
  }
  function porQue(x) {
    var d = el("details", "ad-det ad-why"); d.appendChild(el("summary", null, "Por qué salió"));
    d.appendChild(el("p", "ad-meta", origenDe(x) + "."));
    if (x.motivo) d.appendChild(el("p", "ad-meta", "Etiqueta: " + x.motivo));
    d.appendChild(el("p", "ad-meta", "Comprobado: cifras y palabras de riesgo en el texto, nombres, sin frases copiadas."));
    var p = x.porque;
    if (p && p.prompt) {
      d.appendChild(el("p", "ad-sec", "Prompt exacto"));
      d.appendChild(el("pre", "ad-pre", p.prompt));
      if (p.datos) { d.appendChild(el("p", "ad-sec", "Datos que recibió")); d.appendChild(el("pre", "ad-pre", p.datos)); }
    } else d.appendChild(el("p", "ad-meta", "Esta noticia es anterior al registro del prompt."));
    return d;
  }
  function hora(ms) { try { return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date(ms)); } catch (e) { return ""; } }
  function dia(ms) { try { return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long" }).format(new Date(ms)); } catch (e) { return ""; } }
  function vistaActividad(v) {
    var pubs = D.own.filter(function (x) { return x.status === "published"; }).sort(function (a, b) { return (b.publishedAt || 0) - (a.publishedAt || 0); });
    var tg = D.estado && D.estado.tg;
    if (tg && tg.ok === false) { var w = el("div", "ad-alert"); w.appendChild(ico("warn")); w.appendChild(el("span", null, "Telegram no aceptó el último aviso" + (tg.err ? " (" + tg.err + ")" : ""))); v.appendChild(w); }
    var u = pubs[0];
    if (u) {
      var b = el("div", "ad-last"); b.appendChild(el("div", "ad-sec", "Última enviada · " + hora(u.publishedAt || u.createdAt)));
      var t = el("div", "ad-last-t", u.title || ""); b.appendChild(t);
      var m = el("div", "ad-meta"); var cv = chipVer(u); if (cv) m.appendChild(cv);
      m.appendChild(document.createTextNode(origenDe(u))); b.appendChild(m);
      b.addEventListener("click", function () { tab = "publicadas"; abierto = u.id; pinta(); });
      v.appendChild(b);
    }
    var ev = [];
    D.own.forEach(function (x) {
      if (x.status === "published" && (x.publishedAt || x.createdAt)) ev.push({ at: x.publishedAt || x.createdAt, k: "pub", t: x.title, w: origenDe(x), x: x });
      if (x.portadaAt) ev.push({ at: x.portadaAt, k: "img", t: "Portada de «" + (x.title || "").slice(0, 60) + "»", w: (x.portadaUsd != null ? x.portadaUsd.toFixed(3) + " $ · " : "") + (x.portadaModelo || ""), x: x });
      if (x.status !== "published" && (x.superada || x.caducada || x.vacia || x.reabierta)) ev.push({ at: x.updatedAt || 0, k: "off", t: "Retirada: " + (x.title || ""), w: x.reabierta ? "Reabierta para reescribirla con el prompt nuevo" : x.superada ? "Hay una noticia más nueva del mismo jugador" : x.caducada ? "Ya no vale (pasó el partido)" : "Nota vacía", x: x });
    });
    ev.sort(function (a, b) { return b.at - a.at; });
    var ult = "";
    ev.slice(0, 40).forEach(function (e) {
      var d = dia(e.at); if (d !== ult) { ult = d; v.appendChild(el("div", "ad-sec", d)); }
      var r = el("div", "ad-ev2"); var i = el("span", "ad-ic " + e.k); i.appendChild(ico(e.k)); r.appendChild(i);
      var c = el("div"); var top = el("div", "ad-meta", hora(e.at) + " · " + ({ pub: "Publicada", img: "Portada", off: "Retirada" })[e.k]); top.style.margin = "0"; c.appendChild(top);
      c.appendChild(el("div", "ad-evt", e.t || ""));
      var vv = e.k === "pub" ? chipVer(e.x) : null; var ww = el("div", "ad-meta", e.w); ww.style.margin = "2px 0 0";
      if (vv) { c.appendChild(vv); }
      c.appendChild(ww);
      if (e.k === "pub") { r.addEventListener("click", function () { tab = "publicadas"; abierto = e.x.id; pinta(); }); r.style.cursor = "pointer"; }
      r.appendChild(c); v.appendChild(r);
    });
    var cn = D.estado && D.estado.pistas;
    if (cn) { var rs = el("p", "ad-meta", "Total del redactor: " + (cn.recibidas || 0) + " temas recibidos · " + (cn.publicadas || 0) + " publicados · " + (cn.descartadas || 0) + " descartados."); rs.style.marginTop = "14px"; v.appendChild(rs); }
    if (!ev.length) v.appendChild(el("p", "ad-empty", "Todavía no hay actividad."));
  }

  /* ----- Propias ----- */
function cargaImg(src) { return new Promise(function (ok, ko) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ko(new Error("imagen")); }; i.src = src; }); }
// Le pega encima el escudo real (izquierda) y la marca NOTICIAS real, pequeña, arriba a la derecha
var TIPOS = { rumor: ["POSIBLE FICHAJE", "#2563eb", "swap"], lesion: ["LESIÓN", "#dc2626", "cross"], recuperado: ["RECUPERADO", "#16a34a", "check"], duda: ["DUDA", "#d97706", "q"] };
// Etiqueta de la noticia pintada por el navegador (no la dibuja la IA): texto siempre bien escrito
function pintaEtiqueta(g, tipo, x0, y0, h) {
  var t = Array.isArray(tipo) ? tipo : TIPOS[tipo]; if (!t) return;
  g.save(); g.font = "800 " + Math.round(h * 0.5) + "px system-ui, -apple-system, Segoe UI, sans-serif";
  var tw = g.measureText(t[0]).width, pad = h * 0.4, ic = h * 0.62, w = pad + ic + pad * 0.6 + tw + pad;
  g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = h * 0.25; g.fillStyle = t[1];
  g.beginPath(); if (g.roundRect) g.roundRect(x0, y0, w, h, h * 0.22); else g.rect(x0, y0, w, h); g.fill(); g.shadowBlur = 0;
  var cx = x0 + pad + ic / 2, cy = y0 + h / 2; g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineWidth = h * 0.11; g.lineCap = "round"; g.lineJoin = "round";
  if (t[2] === "cross") { var r = ic * 0.42; g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke(); }
  else if (t[2] === "check") { g.beginPath(); g.moveTo(cx - ic * 0.34, cy + ic * 0.02); g.lineTo(cx - ic * 0.08, cy + ic * 0.28); g.lineTo(cx + ic * 0.38, cy - ic * 0.26); g.stroke(); }
  else if (t[2] === "star") { g.beginPath(); for (var q2 = 0; q2 < 10; q2++) { var ang = -Math.PI / 2 + q2 * Math.PI / 5, rr = (q2 % 2 ? 0.2 : 0.46) * ic; g.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr); } g.closePath(); g.fill(); }
  else if (t[2] === "swap") { var q = ic * 0.4; g.beginPath(); g.moveTo(cx - q, cy - q * 0.4); g.lineTo(cx + q, cy - q * 0.4); g.moveTo(cx + q * 0.45, cy - q * 0.95); g.lineTo(cx + q, cy - q * 0.4); g.lineTo(cx + q * 0.45, cy + q * 0.15); g.moveTo(cx + q, cy + q * 0.5); g.lineTo(cx - q, cy + q * 0.5); g.moveTo(cx - q * 0.45, cy); g.lineTo(cx - q, cy + q * 0.5); g.lineTo(cx - q * 0.45, cy + q * 1.05); g.stroke(); }
  else { g.font = "800 " + Math.round(ic * 1.05) + "px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", cx, cy + h * 0.02); g.textAlign = "left"; }
  g.font = "800 " + Math.round(h * 0.5) + "px system-ui, -apple-system, Segoe UI, sans-serif"; g.textBaseline = "middle"; g.fillStyle = "#fff"; g.fillText(t[0], x0 + pad + ic + pad * 0.6, y0 + h / 2 + h * 0.03);
  g.restore();
}
// Color dominante del escudo (para el fondo cuando no hay foto del jugador)
function colorEscudo(img) {
  var k = document.createElement("canvas"); k.width = k.height = 40; var g = k.getContext("2d"); g.drawImage(img, 0, 0, 40, 40);
  var d = g.getImageData(0, 0, 40, 40).data, cuenta = {}, best = null, bs = 0;
  for (var i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; var r = d[i], gg = d[i + 1], b = d[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0; if (mx < 60 || sat < 0.35) continue; var key = (r >> 6) + "," + (gg >> 6) + "," + (b >> 6); var o = cuenta[key] || (cuenta[key] = { n: 0, r: 0, g: 0, b: 0 }); o.n++; o.r += r; o.g += gg; o.b += b; }
  for (var k in cuenta) { var o2 = cuenta[k]; var amar = o2.r / o2.n > 180 && o2.g / o2.n > 150 && o2.b / o2.n < 90; var sc = o2.n * (amar ? 0.5 : 1); if (sc > bs) { bs = sc; best = [Math.round(o2.r / o2.n), Math.round(o2.g / o2.n), Math.round(o2.b / o2.n)]; } }
  return best || [24, 90, 60];
}
// Foto original del jugador en un círculo con aro y brillo (cromo), con su nombre, datos reales de Futmondo y una frase corta que se lee desde fuera
var KICK_COL = { fijo: "#16a34a", racha: "#ea580c", rentable: "#2563eb", revelacion: "#9333ea", chollo: "#16a34a", bajon: "#dc2626", regular: "#d97706", duda: "#d97706" };
function etiquetaCromo(cr, tipoNoticia) { return cr && cr.kicker ? [cr.kicker, KICK_COL[cr.kickTipo] || "#16a34a", "star"] : (TIPOS[tipoNoticia] || null); }
function pintaCromo(g, foto, cr, crestImg, W, H, tipoNoticia) {
  var d = H * 0.58, cx = W * 0.62, cy = H * 0.4, col = crestImg ? colorEscudo(crestImg) : [24, 90, 60];
  g.save();
  var gl = g.createRadialGradient(cx, cy, d * 0.3, cx, cy, d * 0.95); gl.addColorStop(0, "rgba(255,255,255,.35)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, d * 0.95, 0, Math.PI * 2); g.fill();
  g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = H * 0.04; g.shadowOffsetY = H * 0.015;
  g.fillStyle = "#fff"; g.beginPath(); g.arc(cx, cy, d / 2 + H * 0.018, 0, Math.PI * 2); g.fill(); g.restore();
  g.save(); g.fillStyle = "rgb(" + col.join(",") + ")"; g.beginPath(); g.arc(cx, cy, d / 2 + H * 0.008, 0, Math.PI * 2); g.fill(); g.restore();
  g.save(); g.beginPath(); g.arc(cx, cy, d / 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = "rgba(255,255,255,.92)"; g.fillRect(cx - d / 2, cy - d / 2, d, d);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  var fw = d * 1.02, fh = fw * foto.naturalHeight / foto.naturalWidth; g.drawImage(foto, cx - fw / 2, cy + d / 2 - fh + d * 0.02, fw, fh);
  g.restore();
  // Nombre en una placa grande y blanca sobre fondo oscuro
  var nombre = String(cr.nombre || "").toUpperCase(), fs = H * 0.075;
  g.save(); g.font = "900 " + Math.round(fs) + "px system-ui, -apple-system, Segoe UI, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  var nw = Math.min(W * 0.5, g.measureText(nombre).width + fs * 1.4), ny = cy + d / 2 + H * 0.085;
  g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = H * 0.03; g.fillStyle = "#0b0f0d";
  g.beginPath(); if (g.roundRect) g.roundRect(cx - nw / 2, ny - fs * 0.72, nw, fs * 1.44, fs * 0.28); else g.rect(cx - nw / 2, ny - fs * 0.72, nw, fs * 1.44); g.fill(); g.shadowBlur = 0;
  g.fillStyle = "#fff"; g.fillText(nombre, cx, ny + fs * 0.04, nw - fs * 0.5);
  // Dos datos grandes y claros: MEDIA y VALOR, en pastillas de colores vivos
  var chips = [];
  if (cr.avg && tipoNoticia !== "lesion") chips.push(["MEDIA", String(Math.round(cr.avg * 10) / 10).replace(".", ","), "#fde047"]);
  if (cr.value) chips.push(["VALOR", String(Math.round(cr.value / 1e5) / 10).replace(".", ",") + " M", "#ffffff"]);
  var ch = H * 0.09, gap = W * 0.012, fy = ny + fs * 0.72 + H * 0.035, cws = [];
  chips.forEach(function (c) { g.font = "700 " + Math.round(ch * 0.3) + "px system-ui, sans-serif"; var a1 = g.measureText(c[0]).width; g.font = "900 " + Math.round(ch * 0.56) + "px system-ui, sans-serif"; cws.push(a1 + g.measureText(c[1]).width + ch * 0.9); });
  var tot = cws.reduce(function (a, b) { return a + b; }, 0) + gap * (chips.length - 1), x0 = cx - tot / 2;
  chips.forEach(function (c, i) {
    g.shadowColor = "rgba(0,0,0,.4)"; g.shadowBlur = H * 0.02; g.fillStyle = c[2]; g.beginPath(); if (g.roundRect) g.roundRect(x0, fy, cws[i], ch, ch * 0.3); else g.rect(x0, fy, cws[i], ch); g.fill(); g.shadowBlur = 0;
    g.fillStyle = "#111"; g.textAlign = "left"; g.font = "700 " + Math.round(ch * 0.3) + "px system-ui, sans-serif"; g.fillText(c[0], x0 + ch * 0.3, fy + ch * 0.52); var w1 = g.measureText(c[0]).width;
    g.font = "900 " + Math.round(ch * 0.56) + "px system-ui, sans-serif"; g.fillText(c[1], x0 + ch * 0.3 + w1 + ch * 0.18, fy + ch * 0.54);
    x0 += cws[i] + gap;
  });
  g.restore();
  // Frase corta que se entiende desde fuera, grande, abajo a la izquierda, inclinada
  var et = etiquetaCromo(cr, tipoNoticia);
  if (et) { g.save(); g.translate(W * 0.03, H * 0.04); g.rotate(-0.04); pintaEtiqueta(g, et, 0, 0, H * 0.105); g.restore(); }
}
function componer(j, x) {
  var sin = !!j.sinJugador;
  return Promise.all([j.b64 ? cargaImg("data:image/png;base64," + j.b64) : Promise.resolve(null), cargaImg("/img/noticias-marca.png"), j.crest ? cargaImg("data:image/png;base64," + j.crest) : Promise.resolve(null), j.cromo && j.cromo.foto ? cargaImg("data:image/png;base64," + j.cromo.foto) : Promise.resolve(null)]).then(function (r) {
    var W = r[0] ? r[0].naturalWidth : 1536, H = r[0] ? r[0].naturalHeight : 1024, c = document.createElement("canvas"); c.width = W; c.height = H;
    var g = c.getContext("2d");
    if (r[0]) g.drawImage(r[0], 0, 0, W, H);
    else {
      // Sin foto del jugador: fondo con los colores del club (sacados de su escudo) y el escudo grande en el centro
      var col = r[2] ? colorEscudo(r[2]) : [24, 90, 60], rgb = col.join(",");
      g.fillStyle = "rgb(" + Math.round(col[0] * 0.55) + "," + Math.round(col[1] * 0.55) + "," + Math.round(col[2] * 0.55) + ")"; g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(" + rgb + ",.9)"; g.beginPath(); g.moveTo(0, H * 0.15); g.lineTo(W * 0.55, 0); g.lineTo(W * 0.8, 0); g.lineTo(0, H * 0.5); g.fill();
      g.fillStyle = "rgba(255,255,255,.08)"; g.beginPath(); g.moveTo(W, H * 0.45); g.lineTo(W, H); g.lineTo(W * 0.35, H); g.fill();
    }
    if (r[2]) {
      var cro = !!(r[3] && j.cromo), ch = H * (sin && !cro ? 0.62 : 0.5), cw = ch * r[2].naturalWidth / r[2].naturalHeight, cx = sin && !cro ? (W - cw) / 2 : W * 0.06, cy = (H - ch) / 2 - (cro ? H * 0.04 : 0);
      g.save(); g.shadowColor = "rgba(255,255,255,.55)"; g.shadowBlur = H * 0.05; g.drawImage(r[2], cx, cy, cw, ch); g.restore();
    }
    if (r[3] && j.cromo) pintaCromo(g, r[3], j.cromo, r[2], W, H, j.tipoNoticia);
    var bh = H * 0.1; if (!(r[3] && j.cromo && etiquetaCromo(j.cromo, j.tipoNoticia))) pintaEtiqueta(g, j.tipoNoticia, W * 0.035, H * 0.045, bh);
    var lw = W * 0.09, lh = lw * r[1].naturalHeight / r[1].naturalWidth; g.save(); g.globalAlpha = 0.6; g.drawImage(r[1], W - lw - W * 0.025, H - lh - H * 0.035, lw, lh); g.restore(); // marca de agua transparente, abajo a la derecha
    // Una sola imagen por noticia (1200 px): la web la recorta con CSS en las miniaturas y Telegram usa la misma
    var ow = Math.min(W, 1200), oh = Math.round(ow * H / W), k = document.createElement("canvas"); k.width = ow; k.height = oh; var gk = k.getContext("2d"); gk.imageSmoothingEnabled = true; gk.imageSmoothingQuality = "high"; gk.drawImage(c, 0, 0, ow, oh);
    return { b64: k.toDataURL("image/jpeg", 0.85).split(",")[1] };
  });
}

  function vistaPropias(v, pub) {
    var lista = D.own.filter(function (x) { return (x.status === "published") === pub; });
    if (pub) {
      var sin = lista.filter(function (x) { return !x.thumb; }).sort(function (a, b) { return (b.date || b.updatedAt || 0) - (a.date || a.updatedAt || 0); }).slice(0, 10);
      var conCoste = D.own.filter(function (x) { return x.portadaUsd != null; }), tot = conCoste.reduce(function (a, x) { return a + x.portadaUsd; }, 0);
      var resumen = el("p", "ad-meta", "Gasto en portadas (las que hay ahora): " + tot.toFixed(3) + " $ en " + conCoste.length + " portadas" + (conCoste.length ? " · media " + (tot / conCoste.length).toFixed(3) + " $" : "") + ".");
      resumen.style.fontWeight = "700"; v.appendChild(resumen);
      var box = el("div", "ad-box"); var info = el("p", "ad-meta", sin.length ? "Hay " + lista.filter(function (x) { return !x.thumb; }).length + " publicadas sin portada. Se hacen una a una, las más nuevas primero (≈ 1 min cada una). No cierres esta pantalla." : "Todas las publicadas tienen portada.");
      var go = el("button", "ad-b main", "Generar portadas de las próximas " + sin.length + " (ChatGPT)"); go.type = "button"; var parar = false;
      var stop = el("button", "ad-b", "Parar"); stop.type = "button"; stop.style.display = "none"; stop.addEventListener("click", function () { parar = true; stop.disabled = true; });
      go.addEventListener("click", function () {
        if (!sin.length) return; go.disabled = true; stop.style.display = ""; var hechas = 0, coste = 0, fallos = 0;
        (function sigue(i) {
          if (parar || i >= sin.length) { info.textContent = hechas + " portadas hechas, ≈ " + coste.toFixed(2) + " $" + (fallos ? ", " + fallos + " con fallo" : "") + "."; return cargar(true); }
          var x = sin[i]; info.textContent = "Portada " + (i + 1) + " de " + sin.length + ": " + (x.title || "").slice(0, 60) + "…";
          var usd1 = null, mod1 = ""; post({ action: "portada", id: x.id }).then(function (j) { usd1 = j.usd; mod1 = j.modelo || ""; if (j.usd != null) coste += j.usd; return componer(j, x); })
            .then(function (o) { return post({ action: "portada-guardar", id: x.id, b64: o.b64, usd: usd1, modelo: mod1 }); })
            .then(function () { hechas++; }, function () { fallos++; })
            .then(function () { sigue(i + 1); });
        })(0);
      });
      box.appendChild(info); box.appendChild(go); box.appendChild(stop); v.appendChild(box);
    }
    if (!lista.length) v.appendChild(el("p", "ad-empty", pub ? "Todavía no has publicado ninguna." : "Sin borradores. Crea uno desde la pestaña Redactor."));
    lista.forEach(function (x) { v.appendChild(tarjetaPropia(x)); });
  }
  function tarjetaPropia(x) {
    var w = el("div", "ad-w"), c = el("div", "ad-edit");
    var row = el("div", "ad-card-n" + (abierto === x.id ? " open" : ""));
    var pic = el("div", "ad-bigpic");
    if (x.thumb) { var im = el("img"); im.alt = ""; im.loading = "lazy"; im.src = x.thumb + (/\/portada\//.test(x.thumb) ? (x.thumb.indexOf("?") >= 0 ? "&" : "?") + "t=m" : ""); pic.appendChild(im); } else pic.appendChild(el("span", null, "sin portada"));
    var cv = chipVer(x); if (cv) { cv.classList.add("over"); pic.appendChild(cv); }
    var tx = el("div", "ad-bigtx"); tx.appendChild(el("div", "ad-it-t", x.title || "(sin título)"));
    var m = el("div", "ad-it-m"); if (x.status !== "published") m.appendChild(tag("Borrador", "warn"));
    if (x.club) m.appendChild(tag(x.club, "plain"));
    m.appendChild(el("span", null, cuando(x.publishedAt || x.updatedAt)));
    if (x.portadaUsd != null) m.appendChild(el("span", null, " · " + x.portadaUsd.toFixed(3) + " $"));
    tx.appendChild(m); row.appendChild(pic); row.appendChild(tx);
    row.addEventListener("click", function () { abierto = abierto === x.id ? null : x.id; pinta(); });
    w.appendChild(row);
    if (abierto !== x.id) return w;
    w.appendChild(c);
    c.appendChild(porQue(x));

    var two = el("div", "ad-two");
    // Izquierda: original (lo que dijo la fuente). Derecha: versión nuestra, editable.
    var o = el("div", "ad-box ro"); o.appendChild(el("h3", null, "Original (fuente)"));
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
      row.appendChild(filaJugador(r)); row.appendChild(el("q", null, r.frase));
      var tg = problemas(r); if (tg) row.appendChild(tg);
      o.appendChild(row);
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
    var sucio = el("span", "ad-dirty", ""); var baseT = ti.value + "|" + le.value + "|" + bo.value + "|" + sn.value + "|" + su.value;
    function marca() { sucio.textContent = (ti.value + "|" + le.value + "|" + bo.value + "|" + sn.value + "|" + su.value) !== baseT ? "Sin guardar" : ""; }
    function campo(txt, inp, max) {
      var l = el("label", "ad-l", txt); f.appendChild(l);
      if (max) { var cn = el("span", "cnt", ""); l.appendChild(cn); var up = function () { cn.textContent = inp.value.length + " / " + max; cn.className = "cnt" + (inp.value.length > max ? " bad" : ""); }; inp.addEventListener("input", up); up(); }
      inp.addEventListener("input", marca); f.appendChild(inp);
    }
    campo("Título", ti, 140); campo("Entradilla", le, 280); campo("Texto (una línea = un párrafo)", bo);
    var dsrc = el("details", "ad-det"); dsrc.appendChild(el("summary", null, "Fuente (no se muestra al público)")); f.appendChild(dsrc);
    [["Nombre", sn], ["Enlace", su]].forEach(function (p) { dsrc.appendChild(el("label", "ad-l", p[0])); p[1].addEventListener("input", marca); dsrc.appendChild(p[1]); });
    two.appendChild(f);
    var ed = el("details", "ad-det"); ed.appendChild(el("summary", null, "Editar el texto (opcional)")); ed.appendChild(two); c.appendChild(ed);

    var bt = el("div", "ad-btns sticky");
    function btn(txt, cls, fn) { var b = el("button", "ad-b " + (cls || ""), txt); b.type = "button"; b.addEventListener("click", function () { b.disabled = true; fn().then(function (msg) { toast(msg); return cargar(true); }).catch(function (e) { toast(e.message); b.disabled = false; }); }); bt.appendChild(b); }
    var datos = function (action) { return { action: action, id: x.id, title: ti.value, lead: le.value, body: bo.value, club: x.club || "", source: { name: sn.value, url: su.value } }; };
    btn("Guardar", "", function () { return post(datos("guardar")).then(function () { return "Guardado"; }); });
    var gBtn = bt.lastChild; [ti, le, bo].forEach(function (i) { i.addEventListener("keydown", function (ev) { if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") { ev.preventDefault(); gBtn.click(); } }); });
    if (x.status === "published") btn("Quitar de la web", "", function () { return post({ action: "despublicar", id: x.id }).then(function () { abierto = null; return "Quitada"; }); });
    else btn("Publicar", "main", function () { return post(datos("guardar")).then(function () { return post({ action: "publicar", id: x.id }); }).then(function () { abierto = null; tab = "publicadas"; return "Publicada"; }); });
    var pst = el("p", "ad-meta", x.thumb ? "Portada actual: " + (x.portadaUsd != null ? x.portadaUsd.toFixed(3) + " $ (" + (x.portadaModelo || "modelo ?") + ")" : "coste no registrado") + ". Ver abajo." : "");
    var pim = el("img"); pim.style.cssText = "max-width:100%;border-radius:10px;margin-top:8px;display:" + (x.thumb ? "block" : "none"); if (x.thumb) pim.src = x.thumb;
    var pb = el("button", "ad-b", "Generar portada (ChatGPT)"); pb.type = "button";
    pb.addEventListener("click", function () {
      pb.disabled = true; pst.style.color = ""; pst.textContent = "Generando con ChatGPT… puede tardar 1 minuto. No cierres esta pantalla.";
      var modeloUsado = "";
      post({ action: "portada", id: x.id }).then(function (j) {
        modeloUsado = (j.modelo || "") + (j.usd != null ? ", ≈ " + j.usd.toFixed(3) + " $" : "");
        pst.textContent = (j.conFoto ? "Hecha con la foto de " + (j.jugador || "el jugador") + ". " : "Sin foto del jugador. ") + "Pegando escudo y marca…";
        return componer(j, x).then(function (o) { return post({ action: "portada-guardar", id: x.id, b64: o.b64, usd: j.usd, modelo: j.modelo }); });
      }).then(function (j) {
        pst.textContent = "Portada guardada · " + (modeloUsado || "?") + ". Si no te gusta, pulsa otra vez.";
        if (j.item && j.item.thumb) { pim.src = j.item.thumb; pim.style.display = "block"; }
      }).catch(function (e) { pst.style.color = "var(--bad)"; pst.textContent = "Fallo: " + (e && e.message || "sin respuesta"); }).then(function () { pb.disabled = false; });
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
    bt.appendChild(bor); bt.appendChild(sucio);
    c.appendChild(bt);
    if (x.status === "published") { var vl = el("a", "ad-link", "Ver en la web"); vl.href = "/futmondo/guiafantasy/noticias/ed-" + x.id; vl.target = "_blank"; vl.style.display = "inline-block"; vl.style.marginTop = "10px"; c.appendChild(vl); }
    return w;
  }

  /* Una línea por jugador: punto de confianza + nombre + estado + minuto. Las etiquetas solo salen si hay un problema. */
  function nivel(r) { if (!r.verificada || !r.cruzado) return "bad"; var c = String(r.confianza || "").toLowerCase(); if (c === "alta" || c === "high") return ""; return c ? "warn" : "warn"; }
  function filaJugador(r) {
    var k = el("div", "k"); var d = el("span", "ad-dot " + nivel(r)); d.title = "Confianza: " + (r.confianza || "?"); k.appendChild(d);
    k.appendChild(el("span", null, r.nombre || r.jugador));
    k.appendChild(el("span", "sub", (ETIQ[r.estado] || r.estado) + (r.minuto ? " · min " + r.minuto : "")));
    return k;
  }
  function problemas(r) {
    var l = [];
    if (!r.verificada) l.push(["frase sin verificar", "bad"]);
    if (!r.cruzado) l.push(["sin cruzar con Futmondo", "bad"]);
    if (r.publicable === false) l.push(["no se publicó", "warn"]);
    if (!l.length && !r.motivo) return null;
    var tg = el("div"); l.forEach(function (p) { tg.appendChild(tag(p[0], p[1])); });
    if (r.motivo) { var mo = el("p", "ad-meta", r.motivo); mo.style.margin = "4px 0 0"; tg.appendChild(mo); }
    return tg;
  }

  /* ----- Redactor (publica solo) ----- */
  function vistaRedactor(v) {
    if (!D.sombra.length) v.appendChild(el("p", "ad-empty", "Aún no hay ruedas procesadas. Publica solo, cada 2 minutos, si la frase, el jugador y el estado cuadran. Hace falta la clave GEMINI_API_KEY."));
    D.sombra.forEach(function (s) {
      var c = el("div", "ad-card");
      c.appendChild(el("h2", null, s.title || s.id));
      var m = el("p", "ad-meta"); m.appendChild(tag(s.club, "plain")); m.appendChild(document.createTextNode("Vídeo " + cuando(Date.parse(s.pub) || s.pub) + " · leído " + cuando(s.at)));
      var a = el("a", "ad-link", " ▶ ver vídeo"); a.href = "https://youtu.be/" + s.id; a.target = "_blank"; a.rel = "noopener"; m.appendChild(a); c.appendChild(m);
      (s.items || []).forEach(function (r) {
        var row = el("div", "ad-row");
        row.appendChild(filaJugador(r)); row.appendChild(el("q", null, r.frase));
        var tg = problemas(r); if (tg) row.appendChild(tg);
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
