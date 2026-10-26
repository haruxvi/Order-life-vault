# Instrucciones para agentes de IA

Este vault de Obsidian ordena la vida personal, académica y de entrenamiento de una persona. Si eres un agente o modelo (Codex, OpenCode, Gemini CLI, Kimi, Claude Code u otro), trabajas sobre todo en **`13 Wiki/`**, una base de conocimiento que tú mantienes siguiendo el patrón *LLM Wiki*. Escribe siempre en **español** y háblale de "tú" a la persona.

## Ahorra tokens: consulta, no leas
Mientras más crece el vault, más caro sale leer notas completas. Usa la herramienta **`boveda`**: su costo depende de lo que es relevante, no del tamaño del vault. Medido: ~630 tokens por búsqueda tanto con 100 como con 20.000 notas, mientras que abrir las notas que coinciden pasa de ~2.700 a ~525.000 tokens.

| Necesitas | Herramienta MCP `raiz-boveda` | Sin MCP (terminal, desde la carpeta del vault) |
|---|---|---|
| Encontrar algo | `buscar` | `node .obsidian/plugins/raiz/boveda.js buscar "consulta"` |
| Ver de qué trata una nota y sus secciones | `esqueleto` | `… boveda.js esqueleto "Nota"` |
| Leer solo una parte de una nota | `seccion` | `… boveda.js seccion "Nota" "Título"` |
| Recorrer el grafo (enlaces y quién enlaza) | `vecinos` | `… boveda.js vecinos "Nota"` |
| Datos diarios (sueño, peso, metas, ánimo…) | `datos` | `… boveda.js datos --desde 2026-10-01 --columnas sueno,peso` |
| Cuánto ahorraste | `medicion` | `… boveda.js medicion` |

Los comandos de terminal se ejecutan desde la carpeta del vault, esté donde esté. Si tu carpeta de configuración no se llama `.obsidian`, cambia esa parte de la ruta. La herramienta encuentra el vault sola.

Reglas de presupuesto:
1. **`buscar` antes de abrir cualquier nota.** Te devuelve `ruta:línea` y un fragmento; casi siempre basta.
2. **Lee secciones, no notas.** Abre una nota completa solo si `esqueleto` muestra que la necesitas entera.
3. **Recorre el grafo con `vecinos`**, que trae el resumen de una línea de cada nota enlazada, en vez de abrirlas.
4. **Si llevas 5 notas completas leídas en una tarea, detente** y vuelve a `buscar` con mejores palabras.
5. Para la wiki, `13 Wiki/Índice.md` sirve mientras sea chico. Con más de 150 páginas se divide solo en `13 Wiki/Índices/`, pero aun así `buscar` es más barato.
6. Las últimas acciones: `grep "^## \[" "13 Wiki/Registro.md" | tail -5`.

**Privacidad:** las notas con `privado: true` (o la etiqueta `privado`) no salen por la herramienta. No las abras por tu cuenta.

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
revisado: false     # la persona lo cambia a true cuando lo revisa
tags:
  - wiki
---
```

Lo que escribes nace con `revisado: false`: es una **afirmación**, no un hecho. Las páginas con `revisado: true` las revisó la persona. Si dos páginas se contradicen, gana la revisada.

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
