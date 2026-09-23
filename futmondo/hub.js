(async function () {
  function saludo() {
    const h = new Date().getHours();
    if (h >= 6 && h < 12) return "Buenos Días";
    if (h >= 12 && h < 21) return "Buenas Tardes";
    return "Buenas Noches";
  }
  let name = null;
  try {
    const res = await fetch("/api/laquiniela/me");
    const d = await res.json();
    name = d.user && d.user.name;
  } catch (e) {}
  const box = document.getElementById("hubGreeting");
  if (box) box.textContent = "Con permiso, ¡" + saludo() + (name ? ", " + name : "") + "!";
})();
