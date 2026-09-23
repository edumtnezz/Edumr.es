// Efecto de máquina de escribir dinámico
const phrases = [
  "JassTrack con Claude Sonnet 4.6",
  "Web Oficial & VPS con Gemini 3.8",
  "Bots Vinted & Wallapop con DeepSeek V4",
  "Automatización e IA de vanguardia"
];

let phraseIndex = 0;
let charIndex = 0;
let isDeleting = false;
const typewriterElement = document.getElementById("typewriter");

function type() {
  if (!typewriterElement) return;

  const currentPhrase = phrases[phraseIndex];

  if (isDeleting) {
    typewriterElement.textContent = currentPhrase.substring(0, charIndex - 1);
    charIndex--;
  } else {
    typewriterElement.textContent = currentPhrase.substring(0, charIndex + 1);
    charIndex++;
  }

  let typeSpeed = isDeleting ? 35 : 75;

  if (!isDeleting && charIndex === currentPhrase.length) {
    typeSpeed = 2200; // Pausa al completar la frase
    isDeleting = true;
  } else if (isDeleting && charIndex === 0) {
    isDeleting = false;
    phraseIndex = (phraseIndex + 1) % phrases.length;
    typeSpeed = 400; // Pausa antes de empezar la siguiente
  }

  setTimeout(type, typeSpeed);
}

// Fondo interactivo con partículas estelares
const canvas = document.getElementById('bgCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

let particles = [];
let width = 0;
let height = 0;

function resizeCanvas() {
  if (!canvas) return;
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
}

class Particle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.vx = (Math.random() - 0.5) * 0.35;
    this.vy = (Math.random() - 0.5) * 0.35;
    this.radius = Math.random() * 1.6 + 0.5;
    this.alpha = Math.random() * 0.6 + 0.2;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;

    if (this.x < 0 || this.x > width) this.vx *= -1;
    if (this.y < 0 || this.y > height) this.vy *= -1;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = getParticleColor(this.alpha);
    ctx.fill();
  }
}

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function getParticleColor(alpha) {
  return isLightTheme()
    ? `rgba(2, 132, 199, ${alpha})`
    : `rgba(0, 242, 254, ${alpha})`;
}

function getLineColor(opacity) {
  return isLightTheme()
    ? `rgba(37, 99, 235, ${opacity})`
    : `rgba(59, 130, 246, ${opacity})`;
}

function initParticles() {
  if (!canvas) return;
  particles = [];
  const count = Math.min(Math.floor((width * height) / 16000), 75);
  for (let i = 0; i < count; i++) {
    particles.push(new Particle());
  }
}

function animateParticles() {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < particles.length; i++) {
    const p1 = particles[i];
    p1.update();
    p1.draw();

    for (let j = i + 1; j < particles.length; j++) {
      const p2 = particles[j];
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 110) {
        ctx.beginPath();
        ctx.strokeStyle = getLineColor(0.15 * (1 - dist / 110));
        ctx.lineWidth = 0.8;
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
  }

  requestAnimationFrame(animateParticles);
}

// Cambio de tema claro/oscuro
function initThemeToggle() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;

  toggle.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    }
  });
}

// Menú móvil
function initMobileMenu() {
  const btn = document.getElementById('mobileMenuBtn');
  const navLinks = document.getElementById('navLinks');
  if (!btn || !navLinks) return;

  btn.addEventListener('click', () => {
    navLinks.classList.toggle('open');
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
    });
  });
}

// Inicialización general
document.addEventListener('DOMContentLoaded', () => {
  type();
  initThemeToggle();
  initMobileMenu();

  if (canvas) {
    resizeCanvas();
    initParticles();
    animateParticles();
    window.addEventListener('resize', () => {
      resizeCanvas();
      initParticles();
    });
  }

  // Resaltado de enlaces según la posición del scroll
  const sections = document.querySelectorAll('section[id]');
  window.addEventListener('scroll', () => {
    const scrollY = window.pageYOffset;
    sections.forEach(section => {
      const sectionHeight = section.offsetHeight;
      const sectionTop = section.offsetTop - 120;
      const sectionId = section.getAttribute('id');
      const navItem = document.querySelector(`.nav-links a[href*='${sectionId}']`);
      if (navItem) {
        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
          navItem.classList.add('active');
        } else {
          navItem.classList.remove('active');
        }
      }
    });
  });
});
