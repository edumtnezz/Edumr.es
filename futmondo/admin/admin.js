/* Administración (privada): cambia entre apartados sin recargar y recuerda el último. */
(function () {
  var NAMES = ["noticias", "alineaciones"];
  var bar = document.getElementById("admTabs");
  function show(n, guarda) {
    if (NAMES.indexOf(n) < 0) n = "noticias";
    NAMES.forEach(function (k) { var s = document.getElementById("pnl-" + k); if (s) s.classList.toggle("hidden", k !== n); });
    [].forEach.call(bar.querySelectorAll(".tab"), function (b) { b.classList.toggle("active", b.getAttribute("data-pnl") === n); });
    if (guarda) { try { history.replaceState(null, "", "#" + n); localStorage.setItem("adm:pnl", n); } catch (e) {} window.scrollTo(0, 0); }
  }
  bar.addEventListener("click", function (e) { var b = e.target.closest(".tab"); if (b) show(b.getAttribute("data-pnl"), true); });
  var n = (location.hash || "").replace("#", "");
  if (!n) { try { n = localStorage.getItem("adm:pnl") || ""; } catch (e) {} }
  show(n, false);
})();
