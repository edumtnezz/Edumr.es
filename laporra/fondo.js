(function () {
  const canvas = document.getElementById("bgCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let items = [];
  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function isLight() {
    return document.documentElement.getAttribute("data-theme") === "light";
  }

  function dotColor(a) {
    return isLight() ? `rgba(2, 132, 199, ${a})` : `rgba(0, 242, 254, ${a})`;
  }
  function lineColor(o) {
    return isLight() ? `rgba(37, 99, 235, ${o})` : `rgba(59, 130, 246, ${o})`;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeItem() {
    const ball = Math.random() < 0.16;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      radius: ball ? Math.random() * 5 + 7 : Math.random() * 1.6 + 0.6,
      alpha: Math.random() * 0.5 + 0.25,
      ball,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.012,
    };
  }

  function init() {
    resize();
    items = [];
    let count = Math.min(Math.floor((width * height) / 17000), 70);
    if (reduceMotion) count = Math.min(count, 34);
    for (let i = 0; i < count; i++) items.push(makeItem());
  }

  function drawBall(it) {
    const r = it.radius;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    ctx.globalAlpha = Math.min(1, it.alpha + 0.45);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = isLight() ? "rgba(255,255,255,0.95)" : "rgba(241,245,249,0.9)";
    ctx.fill();

    ctx.strokeStyle = "rgba(15,23,42,0.35)";
    ctx.lineWidth = Math.max(0.7, r * 0.1);
    ctx.stroke();

    const pr = r * 0.42;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const px = Math.cos(a) * pr;
      const py = Math.sin(a) * pr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(15,23,42,0.8)";
    ctx.fill();

    ctx.strokeStyle = "rgba(15,23,42,0.5)";
    ctx.lineWidth = Math.max(0.6, r * 0.08);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * pr, Math.sin(a) * pr);
      ctx.lineTo(Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawDot(it) {
    ctx.beginPath();
    ctx.arc(it.x, it.y, it.radius, 0, Math.PI * 2);
    ctx.fillStyle = dotColor(it.alpha);
    ctx.fill();
  }

  function step() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < items.length; i++) {
      const p1 = items[i];
      p1.x += p1.vx;
      p1.y += p1.vy;
      p1.rot += p1.spin;

      if (p1.x < -20) p1.x = width + 20;
      if (p1.x > width + 20) p1.x = -20;
      if (p1.y < -20) p1.y = height + 20;
      if (p1.y > height + 20) p1.y = -20;

      for (let j = i + 1; j < items.length; j++) {
        const p2 = items[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.strokeStyle = lineColor(0.14 * (1 - dist / 120));
          ctx.lineWidth = 0.8;
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      if (p1.ball) drawBall(p1);
      else drawDot(p1);
    }

    if (!reduceMotion) requestAnimationFrame(step);
  }

  function start() {
    init();
    if (reduceMotion) {
      step();
    } else {
      requestAnimationFrame(step);
    }
  }

  window.addEventListener("resize", () => {
    init();
    if (reduceMotion) step();
  });

  start();
})();