import test from "node:test";
import assert from "node:assert/strict";
import { _r } from "../cron/src/redactor.js";
import { cuerpoAHtml } from "../functions/_lib/noticia-cuerpo.mjs";

const ahora = Date.parse("2026-11-13T10:00:00Z");

function palabras(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).filter(Boolean).length;
}

test("cada tipo tiene un mínimo y un máximo de palabras", () => {
  assert.deepEqual(_r.LIMITES_CUERPO.rueda, [120, 250]);
  assert.deepEqual(_r.LIMITES_CUERPO.cronica, [120, 200]);
  assert.deepEqual(_r.LIMITES_CUERPO.lupa, [120, 180]);
  for (const tipo of ["lesion", "convocatoria", "sancion", "alta", "entreno", "selecciones"]) {
    assert.deepEqual(_r.LIMITES_CUERPO[tipo], [60, 120]);
  }
  assert.match(_r.guiaDe("lesion"), /sin plazo comunicado/);
  assert.match(_r.guiaDe("rueda"), /2 a 4 bloques/);
  assert.match(_r.guiaDe("cronica"), /última frase/);
  assert.match(_r.guiaDe("lupa"), /Futmondo/);
  assert.doesNotMatch(_r.promptNoticias("Getafe", [], ""), /añade un segundo párrafo/);
  assert.match(_r.promptNoticias("Getafe", [], ""), /12 y 18 palabras/);
  assert.match(_r.promptNoticias("Getafe", [], ""), /No escribas un párrafo aparte de fantasy/);
});

test("el titular de la rueda lleva al entrenador y a los temas, sin comillas ni marcador", () => {
  const bien = "Entrenador Inventado habla del grupo, el trabajo y la valoración del equipo";
  assert.equal(palabras(bien) >= 12 && palabras(bien) <= 18, true);
  assert.equal(_r.tituloMal(bien, "rueda"), "");
  assert.equal(_r.tituloMal('Entrenador Inventado habla de "el grupo" y del trabajo del equipo hoy', "rueda"), "comillas o signos");
  assert.equal(_r.tituloMal("Entrenador Inventado analiza el 1-2, el grupo y el trabajo del equipo", "rueda"), "marcador en el titular");
  assert.equal(_r.tituloMal("Habla del grupo", "rueda"), "palabras del titular");
  assert.equal(_r.entradillaValida("rueda", "El técnico del Getafe resumió la rueda oficial del grupo."), true);
  assert.equal(_r.entradillaValida("rueda", "Ya entrena con el grupo desde esta misma semana."), false);
  assert.equal(_r.entradillaValida("cronica", "El partido entre Getafe y Elche acabó 1-0."), true);
});

test("la rueda es un párrafo y de dos a cuatro citas con rótulo", () => {
  const citaA = "Creo mucho en este equipo de prueba";
  const citaB = "Ha sido muy bien el trabajo de este grupo de prueba";
  const hechos = "Entrenador Inventado. Barcelona. " + citaA + ". " + citaB;
  const ctx = "El técnico del Barcelona compareció en la rueda oficial y repasó el trabajo del grupo. Entrenador Inventado dejó por escrito las frases sobre el equipo de prueba. La nota oficial no trae un marcador y este texto no añade ninguno. El relato se queda en lo que dijo sobre el grupo y el trabajo. Y cada frase sale tal cual, sin recortar las palabras de la cita. Barcelona publica la rueda y aquí solo se usa esa nota. El grupo de prueba es el tema de las frases que siguen. Sobre el equipo habló Entrenador Inventado en la misma comparecencia. No hay otra cifra ni otro nombre en esta pieza de la rueda. La frase final vuelve sobre el trabajo de este grupo de prueba.";
  const cuerpo = ctx + "\n\n**La valoración del grupo**\n«" + citaA + "»\n\n**El trabajo del equipo**\n«" + citaB + "»";
  const ok = _r.depurarCuerpo("rueda", cuerpo, hechos);
  assert.ok(ok);
  assert.ok(palabras(ok) >= 120 && palabras(ok) <= 250);
  assert.match(ok, /\*\*La valoración del grupo\*\*/);
  assert.doesNotMatch(ok, /claves fantasy|para el fantasy/);
  assert.equal(_r.depurarCuerpo("rueda", ctx + "\n\n**La valoración del grupo**\n«" + citaA + "»", hechos), null);
  assert.equal(_r.depurarCuerpo("rueda", cuerpo + " En resumen, el grupo sigue.", hechos), null);
  const html = cuerpoAHtml(ok);
  assert.match(html, /class="nw-bloque"/);
  assert.match(html, /class="nw-rotulo"/);
  assert.match(html, /class="nw-cita"/);
  assert.match(html, /Creo mucho en este equipo de prueba/);
});

test("sin plazo comunicado se puede decir; plazo y semanas exigen fuente", () => {
  const base = "Mora se retiró con una lesión muscular en el Getafe. El parte oficial describe la molestia y no añade una fecha de vuelta. El club deja el caso abierto a las pruebas. Mora sigue en el parte del Getafe. La nota no da un número de jornadas fuera. El siguiente paso depende de lo que publique el club. Mora continúa en observación dentro del Getafe.";
  const hechos = "Mora Getafe lesión muscular molestia parte";
  assert.equal(_r.depurarCuerpo("lesion", base, hechos), null);
  const con = base + " Sin plazo comunicado.";
  const ok = _r.depurarCuerpo("lesion", con, hechos);
  assert.ok(ok);
  assert.match(ok, /sin plazo comunicado/i);
  assert.ok(palabras(ok) >= 60 && palabras(ok) <= 120);
  const limpio = _r.depurarCuerpo("lesion", con + " Estará tres semanas fuera.", hechos);
  assert.ok(limpio);
  assert.doesNotMatch(limpio, /semanas/);
  assert.equal(_r.depurarCuerpo("alta", "Mora recibe el alta en el Getafe.", "Mora Getafe alta"), null);
});

test("la lupa y la crónica separan al jugador del partido", () => {
  const pieza = _r.cronicaDesdeHechos({ home: "Equipo A", away: "Equipo B", marcador: [1, 0], fecha: "8 de noviembre de 2026", goles: [{ name: "Delantero Fijo", min: 12, side: "home" }] });
  assert.match(pieza.lupa.title, /Delantero Fijo/);
  assert.doesNotMatch(pieza.lupa.title, /\d+\s*[-–]\s*\d+/);
  assert.match(pieza.lupa.lead, /El jugador/);
  assert.match(pieza.cronica.title, /El encuentro de liga/);
  assert.doesNotMatch(pieza.cronica.title, /\d+\s*[-–]\s*\d+/);
  assert.match(pieza.cronica.lead, /^El partido/);
  assert.match(pieza.ficha.title, /1-0/);
  assert.equal(_r.hechosSuficientes(pieza.lupa.hechos, 3), true);
  assert.equal(_r.imagenFueraDeLugar("Equipo A cierra el encuentro", "El partido avanzó con calma. Equipo A cerró el encuentro como un bloque. El tanto quedó en los hechos."), true);
  assert.equal(_r.imagenFueraDeLugar("Equipo A cierra el encuentro", "El partido avanzó con calma. Equipo A sumó el tanto. El cierre quedó como un bloque."), false);
  assert.equal(_r.imagenFueraDeLugar("Equipo A cerró como un bloque", "El partido avanzó con calma. El cierre quedó como un bloque."), true);
});

test("el próximo partido y el valor salen solo si hay dato", () => {
  const matches = [
    { home: "Getafe", away: "Elche", utcDate: "2026-11-16T13:00:00Z", status: "TIMED" },
    { home: "Barcelona", away: "Getafe", utcDate: "2026-11-23T20:00:00Z", status: "SCHEDULED" },
    { home: "Getafe", away: "Celta", utcDate: "2026-11-10T20:00:00Z", status: "FINISHED" },
    { home: "Getafe", away: "Oviedo", utcDate: "2026-11-20T00:00:00Z", status: "TIMED" },
  ];
  const p = _r.proximoDeLista("Getafe", matches, ahora);
  assert.equal(p.rival, "Elche");
  assert.match(p.dia, /16/);
  assert.match(p.hora, /14:00/);
  const tarde = _r.proximoDeLista("Getafe", [{ home: "Getafe", away: "Oviedo", utcDate: "2026-11-20T00:00:00Z", status: "TIMED" }], ahora);
  assert.equal(tarde.hora, "");
  assert.match(_r.textoProximo(tarde), /Hora: sin datos/);
  assert.equal(_r.textoProximo(null), "Próximo partido: sin datos.");
  const fm = _r.textoFutmondo({ pos: "delantero", club: "Getafe", valor: 5000000, cambio: -100000, puntos: 40, edad: 28 });
  assert.match(fm, /5000000/);
  assert.match(fm, /Puntos Futmondo: 40/);
  assert.doesNotMatch(fm, /28|edad|argentino/i);
  assert.equal(_r.textoFutmondo({ pos: "portero", valor: 0, puntos: 0 }).includes("Valor Futmondo: 0"), true);
  assert.equal(_r.textoFutmondo({}), "");
});

test("la sanción solo vale con LaLiga o la RFEF", () => {
  assert.equal(_r.fuenteDeSancion("https://www.laliga.com/acta/1"), true);
  assert.equal(_r.fuenteDeSancion("https://rfef.es/competicion"), true);
  assert.equal(_r.fuenteDeSancion("https://www.marca.com/futbol"), false);
  assert.equal(_r.fuenteDeSancion("https://www.fcbarcelona.es/noticias/1"), false);
  assert.equal(_r.pistaAceptable({ id: "s1", tipo: "sancion", equipo: "Getafe", tema: "quinta amarilla" }).ok, true);
  assert.equal(_r.pistaAceptable({ id: "s2", tipo: "inventado", equipo: "Getafe", tema: "algo" }).ok, false);
});

test("una frase con nacionalidad o edad que no está en los hechos se tira", () => {
  const hechos = "Mora Getafe lesión muscular";
  const frase = "El central argentino de 28 años sigue en el Getafe con Mora.";
  assert.equal(_r.depurarCuerpo("nota", frase, hechos), null);
});

const PIEZAS = {
  rueda: {
    title: "Entrenador Inventado habla del grupo, el trabajo y la valoración del equipo",
    lead: "El técnico del Barcelona resumió la rueda oficial del grupo.",
    body: "El técnico del Barcelona compareció y repasó el trabajo.\n\n**La valoración del grupo**\n«Creo mucho en este equipo de prueba»\n\n**El trabajo del equipo**\n«Ha sido muy bien el trabajo de este grupo de prueba»",
  },
  lupa: {
    title: "El gol de Delantero Fijo ante el Equipo B",
    lead: "El jugador del Equipo A aparece en el partido.",
    body: "En el partido entre Equipo A y Equipo B, el tanto llegó en el minuto 12. Delantero Fijo firmó ese gol.",
  },
  cronica: {
    title: "El encuentro de liga de Equipo A ante Equipo B",
    lead: "El partido entre Equipo A y Equipo B acabó 1-0.",
    body: "Equipo A y Equipo B acabaron 1-0. Delantero Fijo marcó en el minuto 12.",
  },
  lesion: {
    title: "Mora y el parte del Getafe",
    lead: "El delantero del Getafe figura en la nota oficial.",
    body: "Mora se retiró con una lesión muscular. Sin plazo comunicado.",
  },
  convocatoria: {
    title: "Lista del Getafe con Mora",
    lead: "El delantero del Getafe figura en la lista oficial.",
    body: "Mora se cae de la lista del Getafe para el siguiente partido.",
  },
  sancion: {
    title: "Mora y la sanción oficial",
    lead: "El delantero del Getafe figura en el acta.",
    body: "Mora ve la sanción y el acta de LaLiga lo deja fuera del siguiente partido.",
  },
  alta: {
    title: "Mora recibe el alta del Getafe",
    lead: "El delantero del Getafe figura en el parte.",
    body: "Mora recibe el alta del Getafe. Sin plazo comunicado.",
  },
  entreno: {
    title: "La sesión oficial del Getafe",
    lead: "El jugador del Getafe figura en la nota del entrenamiento.",
    body: "El Getafe completó la sesión con la baja de Mora, según la nota oficial.",
  },
  selecciones: {
    title: "Mora en la lista de la selección",
    lead: "El delantero del Getafe figura en la lista.",
    body: "Mora entra en la lista de la selección que ha publicado el Getafe.",
  },
};

test("cada tipo se pinta en HTML desde una pieza de prueba", () => {
  for (const [tipo, pieza] of Object.entries(PIEZAS)) {
    const html = cuerpoAHtml(pieza.body);
    assert.ok(html.length > 20, tipo);
    assert.match(html, /<p>/, tipo);
    assert.doesNotMatch(html, /futbolfantasy|claves fantasy/i, tipo);
    if (tipo === "rueda") {
      assert.equal((html.match(/nw-bloque/g) || []).length, 2);
      assert.match(html, /nw-rotulo/);
      assert.match(html, /Creo mucho en este equipo de prueba/);
    }
    assert.equal(_r.enlaceAjeno(html), false, tipo);
    assert.equal(_r.tituloMal(pieza.title, tipo === "rueda" ? "rueda" : tipo), "", tipo);
  }
  const tg = _r.noticiaTelegram({ id: "abc123", title: PIEZAS.lesion.title, body: PIEZAS.lesion.body });
  assert.match(tg, /https:\/\/edumr\.es\//);
  assert.doesNotMatch(tg, /https?:\/\/(?!edumr\.es)/);
});
