(function () {
  try {
    var s = localStorage.getItem("theme");
    if (s === "dark") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", "light");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
