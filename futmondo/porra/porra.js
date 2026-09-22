const API = "/api/laquiniela";

function $(id) { return document.getElementById(id); }
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function money(n) { return Number(n || 0).toLocaleString("es-ES"); }
function fmtDate(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return { date, time };
}
function crestEl(crest, fallback) {
  const fb = document.createElement("div");
  fb.className = "crest-fallback";
  fb.textContent = String(fallback || "?").slice(0, 3).toUpperCase();
  if (!crest) return fb;
  const img = document.createElement("img");
  img.className = "crest";
  img.src = crest;
  img.alt = "";
  img.addEventListener("error", () => { if (img.parentNode) img.parentNode.replaceChild(fb, img); });
  return img;
}

function render(data) {
  const match = $("partidoMatch");
  const list = $("partidoList");
  match.innerHTML = "";
  list.innerHTML = "";

  const row = document.createElement("div");
  row.className = "pm-row";
  const home = document.createElement("span");
  home.className = "pm-team";
  home.appendChild(crestEl(data.homeCrest, "LOC"));
  const hn = document.createElement("span"); hn.textContent = data.home; home.appendChild(hn);
  const vs = document.createElement("span"); vs.className = "vs"; vs.textContent = "VS";
  const away = document.createElement("span");
  away.className = "pm-team";
  away.appendChild(crestEl(data.awayCrest, "VIS"));
  const an = document.createElement("span"); an.textContent = data.away; away.appendChild(an);
  row.appendChild(home); row.appendChild(vs); row.appendChild(away);
  match.appendChild(row);

  const r = data.result;
  if (r && r.home != null && r.away != null) {
    const res = document.createElement("div");
    res.className = "pm-result";
    res.textContent = "Resultado final: " + r.home + " - " + r.away;
    match.appendChild(res);
  } else {
    const pend = document.createElement("div");
    pend.className = "pm-pending";
    const f = data.utcDate ? fmtDate(data.utcDate) : null;
    pend.textContent = f ? "Se juega el " + f.date + " a las " + f.time : "Resultado por decidir";
    match.appendChild(pend);
  }

  const sign = (h, a) => (h > a ? 1 : h < a ? 2 : 0);
  const rOk = r && r.home != null && r.away != null;

  (data.entries || []).forEach((e) => {
    let prize = null;
    let tipo = "";
    if (typeof e.prize === "number") {
      prize = e.prize;
      tipo = e.tipo || "";
    } else if (rOk) {
      if (e.home === r.home && e.away === r.away) { prize = 1000000; tipo = "exacto"; }
      else if (sign(e.home, e.away) === sign(r.home, r.away)) { prize = 500000; tipo = "signo"; }
      else prize = 0;
    }
    const erow = document.createElement("div");
    erow.className = "partido-entry";
    if (prize != null && prize > 0) erow.classList.add("winner");
    const nm = document.createElement("span"); nm.className = "pe-name"; nm.textContent = e.name;
    const sc = document.createElement("span"); sc.className = "pe-score"; sc.textContent = e.home + " - " + e.away;
    const tag = document.createElement("span"); tag.className = "pe-tag";
    if (prize != null && prize > 0) {
      const pref = tipo === "exacto" ? "Exacto · " : tipo === "signo" ? "Signo · " : "";
      tag.textContent = pref + money(prize) + " €";
    }
    erow.appendChild(nm); erow.appendChild(sc); erow.appendChild(tag);
    list.appendChild(erow);
  });
}

async function load() {
  try {
    const res = await fetch(API + "/partido");
    render(await res.json());
  } catch (e) {}
}
load();
setInterval(load, 60000);