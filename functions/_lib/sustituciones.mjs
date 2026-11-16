// Quién sustituye a quién (16/11/2026). Datos reales de cada partido de LaLiga en FotMob (matchDetails):
// en cada cambio «swap[0]» es el que entra y «swap[1]» el que sale (comprobado con los titulares del partido).
// Nada se calcula a ojo: se cuentan partidos y cambios de verdad.

// De la ficha de un partido saca: titulares de cada equipo y la lista de cambios.
export function subsDePartido(md) {
  const g = (md && md.general) || {}, c = (md && md.content) || {};
  const ev = ((c.matchFacts || {}).events || {}).events || [];
  const lu = c.lineup || {};
  const eq = (k, t) => ({ name: (g[k] || {}).name || "", tid: String((g[k] || {}).id || ""), st: ((lu[t] || {}).starters || []).map((p) => [String(p.id), p.name]) });
  const home = eq("homeTeam", "homeTeam"), away = eq("awayTeam", "awayTeam");
  if (!home.st.length || !away.st.length) return null; // sin alineaciones no se apunta (no se sabe quién era titular)
  const subs = ev.filter((e) => e && e.type === "Substitution" && Array.isArray(e.swap) && e.swap.length === 2 && e.swap[0].id && e.swap[1].id)
    .map((e) => ({ h: e.isHome ? 1 : 0, m: Number(e.time) || 0, i: [String(e.swap[0].id), e.swap[0].name], o: [String(e.swap[1].id), e.swap[1].name], l: e.injuredPlayerOut ? 1 : 0 }));
  return { home, away, subs };
}

// Junta todos los partidos: para cada jugador que fue titular, cuántas veces lo cambiaron, en qué minuto de media y quién entró.
// Solo cuentan los cambios sin lesión. Devuelve [{ id, n, team, tid, tit, sale, min, por:[{ id, n, k }] }].
export function agregarSubs(partidos) {
  const P = new Map();
  const of = (id, n, eqp) => { if (!P.has(id)) P.set(id, { id, n, team: eqp.name, tid: eqp.tid, tit: 0, sale: 0, mins: [], por: new Map() }); const o = P.get(id); o.team = eqp.name; o.tid = eqp.tid; return o; };
  for (const pt of partidos || []) {
    if (!pt) continue;
    for (const [lado, eqp] of [[1, pt.home], [0, pt.away]]) {
      eqp.st.forEach(([id, n]) => { of(id, n, eqp).tit++; });
      for (const s of pt.subs.filter((x) => x.h === lado && !x.l)) {
        const o = of(s.o[0], s.o[1], eqp);
        o.sale++; o.mins.push(s.m);
        const k = o.por.get(s.i[0]) || { id: s.i[0], n: s.i[1], k: 0 }; k.k++; o.por.set(s.i[0], k);
      }
    }
  }
  return [...P.values()].filter((o) => o.tit > 0).map((o) => ({ id: o.id, n: o.n, team: o.team, tid: o.tid, tit: o.tit, sale: o.sale,
    min: o.mins.length ? Math.round(o.mins.reduce((a, b) => a + b, 0) / o.mins.length) : null, por: [...o.por.values()].sort((a, b) => b.k - a.k).slice(0, 3) }));
}

// Lo que se enseña: titulares a los que cambian en la mitad o más de sus partidos (con 4 titularidades o más) y, si casi siempre
// entra el mismo (3 veces o más y la mitad o más de sus cambios), quién es ese «revulsivo».
export function riesgoCambio(lista) {
  return (lista || []).filter((o) => o.tit >= 4 && o.sale / o.tit >= 0.5).map((o) => {
    const r = o.por[0] && o.por[0].k >= 3 && o.por[0].k / o.sale >= 0.5 ? o.por[0] : null;
    return { id: o.id, n: o.n, team: o.team, tid: o.tid, tit: o.tit, sale: o.sale, min: o.min, rev: r ? { n: r.n, k: r.k } : null };
  }).sort((a, b) => b.sale / b.tit - a.sale / a.tit || b.sale - a.sale);
}
