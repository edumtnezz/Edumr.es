/* Iconos SVG de la Guía Fantasy: sustituye emojis y flechas de texto por iconos
   de trazo uniforme. Solo cambia lo que se ve (nodos de texto); la lógica de
   mercado.js no se toca. Se excluye el chat de Vestuario (mensajes reales). */
(function () {
  var S = function (p, extra) { return { p: p, x: extra || "" }; };
  var M = {
    "⚽": S('<circle cx="12" cy="12" r="9"/><path d="M12 7.5l3.8 2.8-1.4 4.4H9.6L8.2 10.3z"/><path d="M12 7.5V3.2M15.8 10.3l4-1.3M14.4 14.7l2.5 3.5M9.6 14.7l-2.5 3.5M8.2 10.3l-4-1.3"/>'),
    "🙈": S('<circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>', "ko"),
    "🟥": S('<rect x="6" y="3.5" width="12" height="17" rx="2.2" fill="currentColor" stroke="none"/>', "card red"),
    "🟨": S('<rect x="6" y="3.5" width="12" height="17" rx="2.2" fill="currentColor" stroke="none"/>', "card yellow"),
    "🔄": S('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
    "🔁": S('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'),
    "🔀": S('<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
    "⭐": S('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor"/>', "star"),
    "★": S('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor"/>', "star"),
    "🔥": S('<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .2 1.3.9 2 1.8 2C10.5 8 11 5.5 12 3z"/>', "flame"),
    "📈": S('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>', "up"),
    "💹": S('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>', "up"),
    "📉": S('<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>', "down"),
    "🔒": S('<rect x="4.5" y="11" width="15" height="10" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    "🔓": S('<rect x="4.5" y="11" width="15" height="10" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 7.5-1.9"/>'),
    "🏠": S('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
    "✈": S('<path d="M10.5 13.5L3 11l1-1.5 8 .5 4.5-5.5a1.8 1.8 0 0 1 3 1.5L14 13l.5 8-1.5 1-2.5-7.5z"/>'),
    "👟": S('<path d="M3 17h18v-3l-5-2-2-4-4 3-4 1z"/><path d="M3 17v2h18v-2"/>'),
    "🎯": S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
    "🛡": S('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
    "🧤": S('<path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V10M10 10V4a1.5 1.5 0 0 1 3 0v6M13 10V5a1.5 1.5 0 0 1 3 0v7"/><path d="M16 12V9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2-3a1.5 1.5 0 0 1 2.5-1.7L7 14"/>'),
    "👑": S('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>'),
    "📅": S('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    "📊": S('<path d="M5 20V11M12 20V4M19 20v-6"/>'),
    "📋": S('<rect x="5" y="4" width="14" height="17" rx="2.2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>'),
    "🔎": S('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    "🧠": S('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>'),
    "✨": S('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>'),
    "📌": S('<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>'),
    "🖊": S('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    "✏": S('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    "💡": S('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
    "📐": S('<path d="M4 20V4l16 16z"/><path d="M4 12h4M4 16h2"/>'),
    "🔑": S('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>'),
    "🎲": S('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
    "📺": S('<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M8 21h8"/>'),
    "📷": S('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    "📘": S('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'),
    "🧩": S('<path d="M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v6h-6v-2a2 2 0 1 0-4 0v2H4v-6h2a2 2 0 1 0 0-4H4V6h6z"/>'),
    "👆": S('<path d="M12 4v10M8 10l4 4 4-4"/><path d="M6 20h12"/>', "flip"),
    "🟠": S('<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>', "dot orange"),
    "▫": S('<rect x="8" y="8" width="8" height="8" rx="1.5"/>', "dim"),
    "🔼": S('<path d="M6 15l6-6 6 6"/>'),
    "↔": S('<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>'),
    "✕": S('<path d="M18 6L6 18M6 6l12 12"/>'),
    "✓": S('<path d="M20 6L9 17l-5-5"/>'),
    "✅": S('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>', "ok"),
    "❌": S('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>', "ko"),
    "⚠": S('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>', "warn"),
    "🤔": S('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>'),
    "☰": S('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    "←": S('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    "→": S('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    "↑": S('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    "↓": S('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    "⇅": S('<path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/>', "dim"),
    "▲": S('<path d="M12 6l8 12H4z" fill="currentColor"/>', "tri"),
    "▼": S('<path d="M12 18L4 6h16z" fill="currentColor"/>', "tri")
  };
  var keys = Object.keys(M).sort(function (a, b) { return b.length - a.length; });
  var RE = new RegExp("(" + keys.join("|") + ")\\uFE0F?", "g");
  var QUICK = new RegExp(keys.join("|"));
  function svg(ch) {
    var d = M[ch];
    var fill = /fill=/.test(d.p);
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", "gi " + d.x);
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", fill ? "1.6" : "1.9");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.innerHTML = d.p;
    return s;
  }
  function skip(n) {
    for (var e = n.parentNode; e && e !== document.body; e = e.parentNode) {
      if (e.nodeType !== 1) continue;
      var t = e.tagName;
      if (t === "SCRIPT" || t === "STYLE" || t === "TEXTAREA" || t === "INPUT" || t === "SELECT" || t === "OPTION" || t === "svg") return true;
      if (e.classList && (e.classList.contains("wa-chat") || e.classList.contains("gi-keep"))) return true;
    }
    return false;
  }
  function fix(node) {
    var v = node.nodeValue;
    if (!v || !QUICK.test(v) || skip(node)) return;
    var frag = document.createDocumentFragment(), last = 0, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(v))) {
      if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
      frag.appendChild(svg(m[1]));
      last = m.index + m[0].length;
    }
    if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
    if (node.parentNode) node.parentNode.replaceChild(frag, node);
  }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 3) { fix(root); return; }
    if (root.nodeType !== 1 || root.tagName === "SCRIPT" || root.tagName === "STYLE") return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, list = [];
    while ((n = w.nextNode())) if (QUICK.test(n.nodeValue)) list.push(n);
    list.forEach(fix);
  }
  function start() {
    scan(document.body);
    try {
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          if (m.type === "characterData") fix(m.target);
          else m.addedNodes.forEach(scan);
        });
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
