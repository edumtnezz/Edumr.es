(function () {
  const canvas = document.getElementById("bgCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const isMobile =
    window.matchMedia("(max-width: 820px)").matches ||
    ("ontouchstart" in window && window.innerWidth < 1024);
  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width = 0;
  let height = 0;
  let stars = [];
  let lastFrame = 0;
  const targetFps = isMobile ? 30 : 60;
  const frameGap = 1000 / targetFps;

  function isLight() {
    return document.documentElement.getAttribute("data-theme") === "light";
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const dpr = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeStar() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: Math.random() * 1.5 + 0.6,
      alpha: Math.random() * 0.5 + 0.25,
      tw: Math.random() * Math.PI * 2,
      twSpeed: 0.01 + Math.random() * 0.02,
    };
  }

  function init() {
    resize();
    stars = [];
    const divisor = isMobile ? 30000 : 17000;
    let count = Math.min(Math.floor((width * height) / divisor), isMobile ? 28 : 62);
    if (reduceMotion) count = Math.min(count, 24);
    for (let i = 0; i < count; i++) stars.push(makeStar());
  }

  function dotColor(a, tw) {
    const alpha = Math.max(0.08, Math.min(1, a + Math.sin(tw) * 0.18));
    return isLight()
      ? `rgba(2, 132, 199, ${alpha})`
      : `rgba(0, 242, 254, ${alpha})`;
  }

  function lineColor(o) {
    return isLight() ? `rgba(37, 99, 235, ${o})` : `rgba(59, 130, 246, ${o})`;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.x += s.vx;
      s.y += s.vy;
      s.tw += s.twSpeed;
      if (s.x < -10) s.x = width + 10;
      if (s.x > width + 10) s.x = -10;
      if (s.y < -10) s.y = height + 10;
      if (s.y > height + 10) s.y = -10;
    }

    for (let i = 0; i < stars.length; i++) {
      const p1 = stars[i];
      for (let j = i + 1; j < stars.length; j++) {
        const p2 = stars[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 115) {
          ctx.beginPath();
          ctx.strokeStyle = lineColor(0.14 * (1 - dist / 115));
          ctx.lineWidth = 0.8;
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = dotColor(s.alpha, s.tw);
      ctx.fill();
    }
  }

  function loop(t) {
    if (!document.hidden) {
      if (t - lastFrame >= frameGap) {
        lastFrame = t;
        draw();
      }
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", () => {
    init();
    lastFrame = 0;
  });

  init();
  if (reduceMotion) {
    draw();
  } else {
    requestAnimationFrame(loop);
  }
})();