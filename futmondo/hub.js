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
  const ub = document.getElementById("hubUser");
  if (ub && name) {
    const ini = name.trim().split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
    document.getElementById("huAv").textContent = ini;
    document.getElementById("huName").textContent = name;
    ub.hidden = false;
  }
  const exit = document.getElementById("hubExit");
  if (exit) {
    exit.hidden = !loggedIn;
    exit.addEventListener("click", async function () {
      try { await fetch("/api/laquiniela/logout", { method: "POST" }); } catch (e) {}
      location.reload();
    });
  }
  const cta = document.getElementById("hubCta");
  if (cta) cta.hidden = loggedIn;
  document.documentElement.classList.remove("auth-loading");
})();
