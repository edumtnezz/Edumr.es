// Limpia la lista de titulares que lee FutbolFantasy.
// Un once son como mucho 11 jugadores distintos. FutbolFantasy llegó a meter una segunda tanda
// (sin posición ni %) en el mismo bloque y salían 22 repetidos. Aquí se deja SIEMPRE un once válido.
export function cleanStarters(list) {
  const all = Array.isArray(list) ? list.filter(Boolean) : [];
  const conPos = all.filter((p) => p.pos);
  const base = conPos.length >= 10 ? conPos : all;
  const seen = new Set();
  return base
    .filter((p) => {
      const k = String(p.full || p.name || "").trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 11);
}
