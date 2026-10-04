// Prueba de estilo Aureum · interacciones mínimas
(function () {
  var nav = document.querySelector('.nav');
  function onScroll() {
    if (!nav) return;
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
})();

// Aparición al hacer scroll
(function () {
  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.16 });
  items.forEach(function (el) { io.observe(el); });
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
