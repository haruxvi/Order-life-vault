---
cssclasses:
  - raiz-panel
tipo: wiki-sistema
banner: "[[06 Plantillas/Banners/banner-conocimiento.svg]]"
banner-y: 50
banner-height: 320
content-start: 210
banner-fade: -75
banner-radius: 22
---
# Wiki

Una base de conocimiento que **mantiene la IA** a partir de lo que lees, estudias y vives. Tú eliges las fuentes y haces las preguntas; la IA resume, enlaza, detecta contradicciones y lleva el orden.

```dataviewjs
if (window.raiz) await window.raiz.charts.wikiHome(dv, this.container); else dv.paragraph("Cargando…");
```

## Cómo se usa
1. **Agrega una fuente**: guarda un artículo, PDF o transcripción en `Fuentes/` (con Obsidian Web Clipper, configura esa carpeta). También sirve cualquier nota tuya: un libro de la Biblioteca, un apunte o una captura de la Bandeja.
2. **Ingiérela**: abre la fuente y usa **Wiki: ingerir esta nota**. La IA de Raíz escribe su resumen y crea o actualiza las entidades y los conceptos. También puedes pedírselo a tu agente (Codex, OpenCode, Hermes, Claude Code…): sus reglas están en `AGENTS.md`.
3. **Pregunta**: **Wiki: preguntar a la wiki** responde citando las páginas, y puedes guardar la respuesta como página nueva.
4. **Revisa la salud** de vez en cuando con **Wiki: revisar la salud**.

## Las carpetas
| Carpeta | Qué hay |
|---|---|
| `Fuentes/` | Lo que lees, en crudo. Nunca se modifica y no se sube a GitHub. |
| `Resúmenes/` | Una página por fuente. |
| `Entidades/` | Personas, lugares, herramientas, lenguajes, obras. |
| `Conceptos/` | Ideas, técnicas, teorías. |
| `Temas/` | Síntesis de un tema completo, incluidos los personales. |
| `Respuestas/` | Análisis y comparaciones que valió la pena guardar. |
| `Datos/` | `diario.csv` con tus datos diarios, para que un agente no tenga que leer cientos de notas. No se sube a GitHub. |

Tus notas de `12 Conocimiento` siguen siendo tuyas: ahí escribes tú, y la wiki solo las lee.
