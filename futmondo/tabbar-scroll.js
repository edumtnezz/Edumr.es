/* Barrita de scroll visible para la barra de pestañas superior (#tabsNav),
   que en móvil se desliza horizontalmente. No depende del scrollbar nativo
   del navegador (muchos móviles lo ocultan), así que dibuja una propia. */
(function () {
  function mount(nav) {
    if (!nav || nav.dataset.scrollbarMounted) return;
    nav.dataset.scrollbarMounted = "1";
    var wrap = document.createElement("div");
    wrap.className = "cx-scrollbar cx-scrollbar-tabs";
    var thumb = document.createElement("div");
    thumb.className = "cx-scrollbar-thumb";
    wrap.appendChild(thumb);
    var host = nav.closest(".cx-sub") || nav.parentElement;
    if (host) host.appendChild(wrap);
    else return;
    function update() {
      var max = nav.scrollWidth - nav.clientWidth;
      if (max <= 4) { wrap.style.display = "none"; return; }
      wrap.style.display = "";
      var trackW = wrap.clientWidth || 1;
      var ratio = nav.clientWidth / nav.scrollWidth;
      var thumbW = Math.max(trackW * ratio, 28);
      var pos = nav.scrollLeft / max;
      thumb.style.width = thumbW + "px";
      thumb.style.transform = "translateX(" + (pos * (trackW - thumbW)) + "px)";
    }
    nav.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    setTimeout(update, 400);
  }
  function boot() {
    var nav = document.getElementById("tabsNav");
    if (nav) mount(nav);
  }
  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
