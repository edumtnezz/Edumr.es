/* Quiniela y Porra: tocar el escudo o el nombre de un club abre su ficha en Guía Fantasy (/equipos/<club>).
   Antes de salir se apunta dónde estabas (pestaña y altura) y, al volver atrás, se recupera ese punto.
   Los clubes salen de la tabla única (teams.js). Si un club no tiene ficha, no se enlaza. */
(function () {
  var KEY = "clubgo:" + location.pathname;
  function href(name) { try { return (window.EduTeams && window.EduTeams.href(name)) || ""; } catch (e) { return ""; } }
  function link(node, name) {
    var h = href(name);
    if (!node || !h) return node;
    node.classList.add("club-go");
    node.setAttribute("role", "link");
    node.tabIndex = 0;
    node.title = "Ver " + name + " en Guía Fantasy";
    var go = function (e) {
      e.stopPropagation(); e.preventDefault();
      try {
        var t = document.querySelector(".tab.active");
        sessionStorage.setItem(KEY, JSON.stringify({ y: window.scrollY || 0, tab: t ? t.dataset.tab : "", at: Date.now() }));
      } catch (x) {}
      location.href = h;
    };
    node.addEventListener("click", go);
    node.addEventListener("keydown", function (e) { if (e.key === "Enter") go(e); });
    return node;
  }
  // La página lo llama cuando ya ha pintado sus datos. Solo actúa si se llega con "atrás".
  function restore(switchTab) {
    var s = null;
    try { s = JSON.parse(sessionStorage.getItem(KEY) || "null"); sessionStorage.removeItem(KEY); } catch (e) {}
    if (!s || Date.now() - (s.at || 0) > 30 * 60 * 1000) return;
    var nav = (performance.getEntriesByType && performance.getEntriesByType("navigation")[0]) || null;
    if (!nav || nav.type !== "back_forward") return;
    try { if (s.tab && switchTab) switchTab(s.tab, false); } catch (e) {}
    var put = function () { window.scrollTo(0, s.y || 0); };
    requestAnimationFrame(put); setTimeout(put, 250);
  }
  window.EduClubGo = { link: link, restore: restore };
})();
