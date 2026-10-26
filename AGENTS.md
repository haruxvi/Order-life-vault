# Instrucciones para agentes de IA

Este vault de Obsidian ordena la vida personal, académica y de entrenamiento de una persona. Si eres un agente o modelo (Codex, OpenCode, Gemini CLI, Kimi, Claude Code u otro), trabajas sobre todo en **`13 Wiki/`**, una base de conocimiento que tú mantienes siguiendo el patrón *LLM Wiki*. Escribe siempre en **español** y háblale de "tú" a la persona.

## Ahorra tokens: lee en este orden
1. **`13 Wiki/Índice.md`**: catálogo de todas las páginas de la wiki, con un resumen de una línea. Léelo **antes** de abrir cualquier otra cosa.
2. **`13 Wiki/Registro.md`**: solo las últimas entradas, para saber qué se hizo hace poco. Por ejemplo: `grep "^## \[" "13 Wiki/Registro.md" | tail -5`.
3. Después, solo las páginas que necesites. Busca con `grep`/`rg` en lugar de recorrer carpetas.
4. Para datos personales (sueño, peso, entrenamiento, metas, ánimo) lee **`13 Wiki/Datos/diario.csv`**, una fila por día. **No** abras cientos de notas diarias.

No leas: `.obsidian/`, `.trash/`, `06 Plantillas/`, `11 Biblioteca/_portadas/` ni imágenes. Los bloques ```` ```dataviewjs ````, ```` ```base ```` y ```` ```meta-bind ```` son código que dibuja paneles: no tienen contenido, sáltalos.

## Qué puedes tocar
| Carpeta | Para ti |
|---|---|
| `13 Wiki/` (menos `Fuentes/`) | **Escribes y mantienes** todo. |
| `13 Wiki/Fuentes/` | Fuentes en crudo (artículos, PDFs, transcripciones). **Solo lectura**: nunca las modifiques. |
| `01 Diario` … `05 Anual`, `08 Académico`, `09 Entrenamiento`, `10 Agenda`, `11 Biblioteca`, `12 Conocimiento`, `00 Bandeja` | Escritas por la persona. **Solo lectura**: puedes citarlas como fuente, pero no las edites salvo que te lo pida. |
| `00 Dashboard/`, `.obsidian/` | No tocar. |

## Páginas de la wiki
Cada página es un `.md` con este encabezado:

```yaml
---
tipo: wiki
clase: resumen      # resumen | entidad | concepto | tema | respuesta
resumen: "Una línea que diga de qué trata la página."
fuentes:
  - "[[Nombre de la fuente]]"
actualizado: 2026-10-26
tags:
  - wiki
---
```

| Carpeta | `clase` | Contenido |
|---|---|---|
| `Resúmenes/` | `resumen` | Una página por fuente: ideas clave, datos y a qué se conecta. |
| `Entidades/` | `entidad` | Personas, lugares, herramientas, lenguajes, obras, empresas. |
| `Conceptos/` | `concepto` | Ideas, técnicas, teorías. |
| `Temas/` | `tema` | Síntesis de un tema completo: qué se sabe, qué se contradice, qué falta. Incluye temas personales ("Mi entrenamiento", "Mi sueño"). |
| `Respuestas/` | `respuesta` | Análisis o comparaciones que valió la pena guardar. |

Reglas:
- Enlaza con `[[Página]]` y reutiliza los nombres que ya están en el Índice antes de crear uno nuevo.
- Cada afirmación importante lleva su fuente: `([[Fuente]])`.
- Si una fuente nueva contradice algo, **no borres lo anterior**: agrégalo bajo `## Contradicciones`, con ambas fuentes.
- Las páginas de entidad y concepto tienen una sección `## Menciones` con una viñeta por fuente: `- [[Resumen de la fuente]]: el dato.`
- Actualiza `actualizado:` cada vez que cambies una página.

## Flujos de trabajo
**Ingerir una fuente.**
1. Lee la fuente.
2. Comenta con la persona las ideas principales, si está conversando contigo.
3. Escribe su página en `Resúmenes/`.
4. Crea o actualiza las entidades, conceptos y temas que toca. Una sola fuente puede tocar de 5 a 15 páginas.
5. Agrega una entrada al Registro.

**Responder una pregunta.**
1. Lee el Índice y abre las páginas relevantes.
2. Responde citando las páginas.
3. Si la respuesta vale la pena, guárdala en `Respuestas/` y anótala en el Registro.

**Revisar la salud.** Raíz genera `13 Wiki/Revisión.md`: huérfanas, enlaces rotos, páginas sin resumen, conceptos que se mencionan y no tienen página, y fuentes sin ingerir. Arregla lo que aparezca ahí. Busca también contradicciones y afirmaciones que las fuentes nuevas dejaron viejas.

## Registro
Va en `13 Wiki/Registro.md` y **solo se agrega al final**: nunca se reescribe. Una entrada por acción:

```
## [2026-10-26] ingesta | Título de la fuente
Páginas: [[Resumen]], [[Concepto A]], [[Entidad B]]
```

Tipos: `ingesta`, `consulta`, `revisión`, `edición`.

## Lo que hace Raíz por ti
Con Obsidian abierto, el plugin Raíz mantiene el trabajo mecánico para que no gastes tokens en él:
- **`Índice.md`** se regenera solo con el `resumen` de cada página. No lo edites a mano. Si trabajas sin Obsidian abierto, agrega tú la línea de cada página nueva: `- [[Página]] — resumen`.
- **`Datos/diario.csv`** se exporta con los datos de las notas diarias.
- **`Revisión.md`** se genera con el comando *Wiki: revisar la salud*.
