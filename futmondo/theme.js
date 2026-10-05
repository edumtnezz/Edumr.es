(function () {
  var KEY = "theme";
  function apply(t) {
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
    else if (t === "dark") document.documentElement.removeAttribute("data-theme");
  }
  try {
    var s = localStorage.getItem(KEY);
    apply(s === "dark" ? "dark" : "light");
  } catch (e) {
    apply("light");
  }
  window.addEventListener("DOMContentLoaded", function () {
    if (!window.__themeHandled) {
      window.__themeHandled = 1;
      var b = document.getElementById("themeToggle");
      if (b) b.addEventListener("click", function () {
        var light = document.documentElement.getAttribute("data-theme") === "light";
        var next = light ? "dark" : "light";
        apply(next);
        try { localStorage.setItem(KEY, next); } catch (e) {}
      });
    }
    try {
      var nav = document.querySelector(".cx-nav");
      var act = nav && nav.querySelector("a.active");
      if (nav && act) {
        var d = act.getBoundingClientRect().left - nav.getBoundingClientRect().left;
        nav.scrollLeft = Math.max(0, d - 10);
      }
    } catch (e) {}
  });
})();
