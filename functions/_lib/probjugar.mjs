// Probabilidad propia de que un jugador sea TITULAR, solo con su historial real de Futmondo.
// Cada partido: [jornada, minutos, entró desde el banquillo (1/0), roja (1/0)].
// Titular = minutos > 0 y no entró desde el banquillo. Pesa más lo reciente (5,4,3,2,1).
// Con menos de 3 partidos devuelve null ("sin datos"): nunca se inventa un número.
export function esTitular(e) {
  return !!e && Number(e[1]) > 0 && !e[2];
}
export function probTitular(previos) {
  const h = (Array.isArray(previos) ? previos : []).slice(-5);
  if (h.length < 3) return null;
  let num = 0, den = 0;
  h.forEach((e, i) => { const w = i + 1 + (5 - h.length); num += w * (esTitular(e) ? 1 : 0); den += w; });
  return den ? num / den : null;
}
// Prueba con el pasado: para cada partido con 3 o más anteriores, predice con lo anterior y compara con lo que pasó.
export function backtest(map) {
  const cub = Array.from({ length: 5 }, () => ({ n: 0, tit: 0 }));
  let n = 0, brier = 0, ok = 0, tit = 0;
  for (const id of Object.keys(map || {})) {
    const m = ((map[id] || {}).m || []).slice().sort((a, b) => a[0] - b[0]);
    for (let i = 3; i < m.length; i++) {
      const p = probTitular(m.slice(0, i));
      if (p == null) continue;
      const y = esTitular(m[i]) ? 1 : 0;
      n++; tit += y; brier += (p - y) * (p - y); if ((p >= 0.5) === !!y) ok++;
      const c = cub[Math.min(4, Math.floor(p * 5))]; c.n++; c.tit += y;
    }
  }
  if (!n) return { partidos: 0 };
  const base = tit / n;
  return {
    partidos: n,
    aciertoSiMas50: Math.round((ok / n) * 1000) / 10,
    brier: Math.round((brier / n) * 1000) / 1000,
    brierSiempreLaMedia: Math.round(base * (1 - base) * 1000) / 1000,
    calibracion: cub.map((c, i) => ({ prediccion: i * 20 + "-" + (i + 1) * 20 + "%", partidos: c.n, titularesReales: c.n ? Math.round((c.tit / c.n) * 100) + "%" : "sin datos" })),
  };
}
