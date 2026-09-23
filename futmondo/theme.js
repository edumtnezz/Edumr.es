(function () {
  var KEY = "theme";
  function apply(t) {
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
    else if (t === "dark") document.documentElement.removeAttribute("data-theme");
  }
  try {
    var s = localStorage.getItem(KEY);
    if (s === "light" || s === "dark") apply(s);
  } catch (e) {}
  window.addEventListener("DOMContentLoaded", function () {
    if (window.__themeHandled) return;
    var b = document.getElementById("themeToggle");
    if (!b) return;
    b.addEventListener("click", function () {
      var light = document.documentElement.getAttribute("data-theme") === "light";
      var next = light ? "dark" : "light";
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
    });
  });
})();
