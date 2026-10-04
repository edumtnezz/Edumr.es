// Prueba de estilo FLUTEDECK · interacciones
(function () {
  var nav = document.querySelector('.nav');
  function onScroll() { if (nav) nav.style.boxShadow = window.scrollY > 20 ? '0 10px 30px -20px rgba(15,15,16,0.35)' : 'none'; }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
})();

// Pestañas de demos
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.demo-tab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.demo-panel'));
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.toggle('active', x === t); });
      panels.forEach(function (p) { p.classList.toggle('hidden', p.dataset.demo !== t.dataset.demo); });
    });
  });
})();

// Pasos de cada demo
(function () {
  document.querySelectorAll('.demo-wrap').forEach(function (wrap) {
    var img = wrap.querySelector('.demo-img');
    var steps = Array.prototype.slice.call(wrap.querySelectorAll('.demo-step'));
    if (!steps.length || !img) return;
    steps.forEach(function (s) {
      s.addEventListener('click', function () {
        steps.forEach(function (x) { x.classList.toggle('active', x === s); });
        img.src = s.dataset.img;
        img.alt = s.dataset.alt || '';
      });
    });
  });
})();
