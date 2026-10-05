(async function () {
  function saludo() {
    const h = new Date().getHours();
    if (h >= 6 && h < 12) return "Buenos Días";
    if (h >= 12 && h < 21) return "Buenas Tardes";
    return "Buenas Noches";
  }
  let name = null, loggedIn = false;
  try {
    const res = await fetch("/api/laquiniela/me", { cache: "no-store" });
    const d = await res.json();
    loggedIn = !!(d && d.user);
    name = d && d.user && d.user.name;
  } catch (e) {}
  const box = document.getElementById("hubGreeting");
  if (box) box.textContent = "Con permiso, ¡" + saludo() + (name ? ", " + name : "") + "!";
  const ub = document.getElementById("userBox");
  if (ub && name) {
    const ini = name.trim().split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
    ub.hidden = false;
    const chip = document.createElement("button"); chip.type = "button"; chip.className = "user-chip";
    chip.innerHTML = '<span class="user-avatar">' + ini + '</span><span class="user-name">' + name + '</span><span class="user-caret">▾</span>';
    const menu = document.createElement("div"); menu.className = "user-menu";
    const exit = document.createElement("button"); exit.type = "button"; exit.className = "user-menu-exit"; exit.textContent = "Salir";
    exit.addEventListener("click", async function () {
      try { await fetch("/api/laquiniela/logout", { method: "POST" }); } catch (e) {}
      location.reload();
    });
    menu.appendChild(exit);
    ub.appendChild(chip); ub.appendChild(menu);
    chip.addEventListener("click", function (e) { e.stopPropagation(); menu.classList.toggle("open"); });
    document.addEventListener("click", function (e) { if (!ub.contains(e.target)) menu.classList.remove("open"); });
  }
  const cta = document.getElementById("hubCta");
  if (cta) cta.hidden = loggedIn;
  document.documentElement.classList.remove("auth-loading");
})();
