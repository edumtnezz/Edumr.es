# Prompt de portadas (fondos) — investigación 11/11/2026

Código: `functions/_lib/portada-prompt.mjs`. La IA solo hace el FONDO; foto, escudo, nombre, MEDIA/VALOR y etiqueta se pegan después.

Lo respaldado: foco único + contraste alto + paleta corta (UBC, arXiv 1611.00687; Koh y Cui 2022); color y emoción (Jonauskaite y Mohr 2025: rojo/cálido = activación, frío/oscuro = emociones negativas); Google Discover penaliza imágenes engañosas o exageradas; YouTube decide por tiempo de visionado, no por clics.
Lo NO respaldado: las cifras de CTR (+30 %, +47 %…) vienen de blogs de herramientas. No hay estudios de miniaturas de fantasy/fichajes/lesiones; lo de cada tipo es criterio editorial.
gpt-image: escribir "sin texto" no basta; no pedir objetos que traen letras (marcadores, vallas, banderas, camisetas); pasar el escudo solo como referencia de color (hex + nombre); no pasar portadas anteriores como referencia (copia su color).

Reglas aplicadas: prompt por bloques (uso, reglas, paleta, composición, estilo, ambiente, escena, prohibido); escena y ambiente según el tipo de noticia; 10 estilos, los sobrios para duda/lesión/bajón y los enérgicos para racha/chollo/revelación; fondos guardados por club y ambiente; nada de fuegos, confeti, dinero ni trofeos. Honestidad: la portada nunca promete más que la noticia (un rumor no parece un "here we go").
