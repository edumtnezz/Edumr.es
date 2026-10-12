// Fotos de los jugadores: las mismas de Futmondo que ya usa el Mercado de la web.
(function () {
  function strip(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
  fetch("/api/laquiniela/mercado").then(function (r) { return r.json(); }).then(function (d) {
    var all = (d.players || []).filter(function (p) { return p.photo; });
    document.querySelectorAll(".pl").forEach(function (pl) {
      var nm = pl.querySelector(".pl-nm"), im = pl.querySelector(".pl-ph img");
      if (!nm || !im) return;
      var names = [strip(nm.textContent)];
      if (nm.getAttribute("data-alt")) names.push(strip(nm.getAttribute("data-alt")));
      var hit = null;
      names.forEach(function (q) {
        if (hit) return;
        hit = all.find(function (p) { return strip(p.name) === q; }) ||
          all.find(function (p) { var n = strip(p.name); return n.indexOf(q) >= 0 || q.indexOf(n) >= 0; });
      });
      if (hit) im.src = hit.photo;
    });
  }).catch(function () {});
})();
