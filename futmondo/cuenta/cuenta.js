const API = "/api/laquiniela";
function $(id) { return document.getElementById(id); }
function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function escapeHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function nextUrl() {
  const n = new URLSearchParams(location.search).get("next");
  if (n && /^\/futmondo(\/|$)/.test(n)) return n;
  return "/futmondo/";
}

function renderUser(name) {
  const box = $("userBox");
  if (!box) return;
  box.innerHTML = "";
  if (!name) return;
  const chip = el("span", "user-chip");
  chip.innerHTML = '<span class="user-avatar">' + escapeHtml(initials(name)) + '</span><span>' + escapeHtml(name) + '</span>';
  box.appendChild(chip);
}

function renderPanel(user) {
  const panel = $("cuentaPanel");
  if (!panel) return;
  panel.innerHTML = "";

  if (user) {
    const intro = el("div", "auth-intro");
    intro.appendChild(el("h2", null, "¡Ya has entrado!"));
    intro.appendChild(el("p", "muted", "Estás como " + user.name + ". Ya no necesitas crear nada."));
    panel.appendChild(intro);
    const go = el("a", "btn-primary big", "Ir a Futmondo");
    go.href = nextUrl();
    panel.appendChild(go);
    const out = el("button", "btn-ghost", "Salir");
    out.addEventListener("click", async () => {
      try { await fetch(API + "/logout", { method: "POST" }); } catch (e) {}
      load();
    });
    panel.appendChild(out);
    return;
  }

  const intro = el("div", "auth-intro");
  intro.appendChild(el("h2", null, "¿Primera vez? Crea tu cuenta"));
  const ol = el("ol", "auth-steps");
  ol.appendChild(el("li", null, "Escribe tu NOMBRE (el tuyo)."));
  ol.appendChild(el("li", null, "Inventa un CÓDIGO de 4 o 6 números y apúntalo (no se puede recuperar)."));
  ol.appendChild(el("li", null, "Pulsa «Entrar»."));
  intro.appendChild(ol);
  intro.appendChild(el("p", "muted small", "La primera vez tu cuenta se crea sola. Después entra siempre con el mismo nombre y código."));
  panel.appendChild(intro);

  const f = el("div", "auth-form");
  const name = el("input"); name.id = "cuentaName"; name.placeholder = "Tu nombre"; name.maxLength = 24;
  const pin = el("input"); pin.id = "cuentaPin"; pin.type = "password"; pin.placeholder = "Tu código (4 o 6 números)"; pin.maxLength = 6;
  f.appendChild(name); f.appendChild(pin);
  const b = el("button", "btn-primary big", "Entrar"); f.appendChild(b);
  panel.appendChild(f);
  panel.appendChild(el("p", "muted small", "¿Ya tienes cuenta? Pon tu mismo nombre y código y entra."));
  const err = el("p", "error"); err.id = "cuentaErr"; panel.appendChild(err);

  const entrar = async () => {
    err.textContent = "";
    try {
      const res = await fetch(API + "/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre: name.value, pin: pin.value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error");
      location.href = nextUrl();
    } catch (e) { err.textContent = e.message; }
  };
  b.addEventListener("click", entrar);
  pin.addEventListener("keydown", (e) => { if (e.key === "Enter") entrar(); });
}

async function load() {
  let user = null;
  try {
    const r = await fetch(API + "/me");
    const d = await r.json();
    user = d.user || null;
  } catch (e) {}
  renderUser(user && user.name);
  renderPanel(user);
}
load();
