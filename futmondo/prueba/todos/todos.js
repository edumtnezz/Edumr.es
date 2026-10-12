fetch("/api/laquiniela/equipos").then(function (r) { return r.json(); }).then(function (d) {
  var g = document.getElementById("g");
  (d.teams || []).forEach(function (t) {
    var f = document.createElement("iframe");
    f.loading = "lazy";
    f.title = t.name;
    f.src = "../?equipo=" + encodeURIComponent(t.name);
    g.appendChild(f);
  });
});
