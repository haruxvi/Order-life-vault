# Order Life Vault

*[Español](#español) · [English](#english)*

Un vault de Obsidian para ordenar la vida personal, académica y de entrenamiento, con la IA que tú elijas: local y gratis, tu suscripción o tu API key.

---

## Español

### Qué incluye
| Apartado | Qué hace |
|---|---|
| **Inicio** | Reloj, tarjetas por área, frase del día, metas, rituales y reflexión, y un mapa de actividad del año. |
| **Notas periódicas** | Día, semana, mes, trimestre y año. Traen resúmenes y valoraciones con IA, la Rueda de la Vida, un calendario y una revisión del año. |
| **Mis metas** | Agua, comida, pasos, sueño, peso, lectura, estudio… con anillos y botones **+ / −**. Cada quien define sus propios objetivos y unidades, sin fórmulas impuestas. |
| **Entrenamiento** | Registro interactivo de series, descanso con aviso, marcas personales, progresión, constancia y un coach con IA. |
| **Académico** | Horario, promedios, la nota que te falta para aprobar (escala 1–7, configurable) y próximas evaluaciones. |
| **Estudio estilo Notion** | Páginas con portada, ícono, propiedades y subpáginas, y bases con vistas (tabla, tarjetas, lista). Dentro de cualquier nota puedes insertar páginas enlazadas, bases, tarjetas o cualquier módulo. Puedes escribir a mano o con IA. |
| **Biblioteca** | Juegos, libros, anime, manga, películas, series, videos y cursos, con portadas automáticas, filtros y un tablero por estado. |
| **Conocimiento** | Mapas de contenido, menciones sin enlazar, notas relacionadas con IA, preguntas a todo el vault y repaso espaciado. |
| **Wiki para IA y agentes** | Una base de conocimiento que mantiene la IA (patrón *LLM Wiki*): resúmenes, entidades, conceptos y temas enlazados. Trae reglas listas para agentes en `AGENTS.md`, y Raíz mantiene solo el índice, el registro y los datos. |
| **Ahorro de tokens que escala** | `boveda`, una herramienta para agentes (CLI y servidor MCP). Busca por palabras y por significado, lee y escribe por secciones, recorre el grafo y recuerda lecciones entre sesiones: ~630 tokens por búsqueda con 100 notas y con 20.000. Mide su ahorro y nunca deja salir las notas privadas. |
| **Bandeja, agenda y etiquetas** | Captura rápida, eventos y reuniones, tareas con fecha y etiquetas organizadas. |
| **Personalización** | Imagen de fondo por nota o por apartado (también desde tu PC), tipografía para el texto, los títulos y la interfaz, y el tema "bosque nocturno". |

Todo lo hace el plugin propio **Raíz** (`.obsidian/plugins/raiz`), escrito en JavaScript plano y sin compilar.

### La IA, a tu elección
Haz clic en **✦ IA**, abajo a la derecha. Raíz busca lo que tienes, elige el modelo rápido y el profundo, y lo deja configurado.

| Tipo | Opciones | Costo |
|---|---|---|
| **En tu equipo** | Ollama, LM Studio, OpenClaw, Jan, llama.cpp, vLLM | Gratis, sin límites y privado |
| **Tu suscripción** | Claude Pro/Max (Claude Code), ChatGPT Plus/Pro (Codex CLI), Google (Gemini CLI), Kimi (Kimi Code CLI), OpenCode | Lo que ya pagas: cuenta en el límite de tu plan |
| **Con API key** | OpenRouter, Vercel AI Gateway, OpenAI, Anthropic, xAI (Grok), DeepSeek, Kimi (Moonshot), Qwen, Gemini, Mistral, Groq, Together, Fireworks, Perplexity, Cerebras, SambaNova, Hugging Face, NVIDIA NIM, Z.ai (GLM), MiniMax, Cohere, Azure OpenAI, OpenCode Zen | Pago por uso en tu cuenta |
| **Otro** | Cualquier API compatible con OpenAI, o cualquier programa o agente de terminal | Depende del servicio |

- **Con Ollama** los modelos se eligen según la RAM de cada equipo: uno chico con 8 GB y uno más grande con 16 GB.
- **Las suscripciones** no traen API key, así que se usan con el programa oficial de cada empresa: lo instalas e inicias sesión una vez. Solo funcionan en el computador.
- **Las API keys** quedan cifradas en el **Llavero** de Obsidian, solo en tu equipo: nunca en el vault ni en este repositorio.
- **Privacidad:** con IA local tus notas no salen de tu PC. Con un servicio en la nube o una suscripción, el texto que la IA analiza se envía a ese servicio.

### Un vault grande no debería costar más tokens
Un agente sin mapa lee notas completas: mientras más crece el vault, más paga por cada tarea. `boveda` hace que el agente **consulte** en vez de leer. Esta es la misma búsqueda medida en vaults de tamaño creciente:

| Notas en el vault | Con `boveda` | Abriendo cada nota que coincide |
|---:|---:|---:|
| 100 | ~640 tokens | ~2.700 tokens |
| 1.000 | ~620 tokens | ~26.000 tokens |
| 5.000 | ~630 tokens | ~131.000 tokens |
| 20.000 | ~630 tokens | ~525.000 tokens |

Las ideas vienen de [Lymi](https://github.com/haruxvi/Lymi), otro proyecto mío:
- El índice nunca entra completo al contexto.
- Se devuelven secciones, no archivos.
- Cada respuesta tiene un presupuesto fijo.
- El ahorro se mide, no se promete.

Raíz anota cada llamada a la IA y cada consulta de un agente, y lo muestra en **IA: ver consumo de tokens**.

También incorpora ideas de [graphify](https://github.com/Graphify-Labs/graphify), [memU](https://github.com/NevaMind-AI/memU) y [Serena](https://github.com/oraios/serena), reescritas desde cero:
- **Escribir por secciones** en vez de reescribir páginas: 91 % menos tokens de salida en la prueba.
- **Lecciones entre sesiones**, para no volver a investigar lo mismo.
- **Búsqueda por significado** con resguardo de RAM: mejoró 5 de 12 consultas y no empeoró ninguna.
- **Recorrido del grafo** que no se pierde por las notas centrales.

### Instalación
1. Descarga o clona este repositorio y ábrelo en [Obsidian](https://obsidian.md) como vault. Necesitas una versión reciente: 1.9 o superior para las bases, y la última para el Llavero.
2. Cuando Obsidian lo pida, activa los plugins de la comunidad.
3. Instala desde la tienda los dos plugins que no vienen incluidos (ver [TERCEROS.md](TERCEROS.md)).
4. Configura la IA con **✦ IA**. Si eliges Ollama: `Ctrl+P` → **Raíz: Descargar modelos de IA recomendados**.
5. Abre **00 Dashboard → Inicio**. La guía completa está en [00 Dashboard/Guía Raíz.md](00%20Dashboard/Guía%20Raíz.md).

En el iPhone o Android todo funciona menos la IA local: usa un proveedor con API, o la IA de tu PC a través de Tailscale.

### Carpetas
| Carpeta | Contenido |
|---|---|
| `00 Bandeja` | Capturas rápidas por procesar |
| `00 Dashboard` | Inicio, guía, frases y Mi espacio |
| `01 Diario` … `05 Anual` | Notas del día, la semana, el mes, el trimestre y el año |
| `06 Plantillas` | Plantillas, fondos (`Banners`) y tus imágenes (`Portadas`, que no se suben) |
| `08 Académico` | Asignaturas, panel académico y páginas de estudio |
| `09 Entrenamiento` | Rutinas y panel de entrenamiento |
| `10 Agenda` | Eventos y reuniones |
| `11 Biblioteca` | Juegos, libros, anime, manga, películas, series, videos y cursos |
| `12 Conocimiento` | Notas, mapas de contenido, etiquetas y repaso (las escribes tú) |
| `13 Wiki` | Wiki mantenida por la IA: índice, registro, fuentes, resúmenes, entidades, conceptos, temas y respuestas |

### Qué no se sube a este repositorio
Tus API keys, las fuentes de `13 Wiki/Fuentes` y los datos de `13 Wiki/Datos`, tus imágenes de `06 Plantillas/Portadas`, las portadas descargadas de la biblioteca, tus fuentes propias, el índice de la IA (`vectores.json`), la caché y la medición de `boveda`, tu registro de consumo y el estado de tu espacio de trabajo.

### Aviso sobre software de terceros
Los plugins de la comunidad que vienen en `.obsidian/plugins` **no son de mi autoría**. Pertenecen a sus autores y se incluyen sin modificaciones, cada uno con su licencia original. Los servicios y programas de IA externos se rigen por sus propios términos. El detalle está en **[TERCEROS.md](TERCEROS.md)**.

---

## English

An Obsidian vault for organizing personal, academic and training life, with the AI of your choice: local and free, your subscription, or your own API key. The vault's content and interface are in Spanish.

### What's inside
| Area | What it does |
|---|---|
| **Home** | A clock, area cards, a daily quote, goals, rituals and reflection, and a yearly activity heatmap. |
| **Periodic notes** | Day, week, month, quarter and year. They include AI summaries and ratings, a Wheel of Life, a calendar and a yearly review. |
| **My goals** | Water, food, steps, sleep, weight, reading, study… shown as rings with **+ / −** buttons. Everyone sets their own targets and units, with no imposed formulas. |
| **Training** | Interactive set logging, rest timer with alerts, personal records, progression, consistency and an AI coach. |
| **Academics** | Class schedule, averages, the grade you still need to pass (1–7 scale, configurable) and upcoming exams. |
| **Notion-style study** | Pages with a cover, an icon, properties and subpages, plus databases with views (table, cards, list). Inside any note you can insert linked pages, databases, page cards or any module. Write by hand or with AI. |
| **Library** | Games, books, anime, manga, movies, series, videos and courses, with automatic covers, filters and a status board. |
| **Knowledge** | Maps of content, unlinked mentions, AI-related notes, questions over the whole vault and spaced repetition. |
| **Wiki for AI and agents** | A knowledge base maintained by the AI (the *LLM Wiki* pattern): linked summaries, entities, concepts and topics. It comes with ready-made rules for agents in `AGENTS.md`, and Raíz keeps the index, log and data up to date by itself. |
| **Token savings that scale** | `boveda`, a tool for agents (CLI and MCP server). It searches by keyword and by meaning, reads and writes by section, walks the graph and remembers lessons across sessions: ~630 tokens per search with 100 notes and with 20,000. It measures its own savings and never lets private notes out. |
| **Inbox, agenda and tags** | Quick capture, events and meetings, dated tasks and organized tags. |
| **Customization** | A background image per note or per section (including images from your PC), typography for body text, headings and the interface, and the "night forest" theme. |

All of it is handled by my own plugin, **Raíz** (`.obsidian/plugins/raiz`), written in plain JavaScript with no build step.

### Your AI, your choice
Click **✦ IA** in the bottom right corner. Raíz finds what you have, picks the fast and deep models, and sets everything up.

| Type | Options | Cost |
|---|---|---|
| **On your machine** | Ollama, LM Studio, OpenClaw, Jan, llama.cpp, vLLM | Free, unlimited and private |
| **Your subscription** | Claude Pro/Max (Claude Code), ChatGPT Plus/Pro (Codex CLI), Google (Gemini CLI), Kimi (Kimi Code CLI), OpenCode | What you already pay for; counts toward your plan's limits |
| **With an API key** | OpenRouter, Vercel AI Gateway, OpenAI, Anthropic, xAI (Grok), DeepSeek, Kimi (Moonshot), Qwen, Gemini, Mistral, Groq, Together, Fireworks, Perplexity, Cerebras, SambaNova, Hugging Face, NVIDIA NIM, Z.ai (GLM), MiniMax, Cohere, Azure OpenAI, OpenCode Zen | Pay as you go on your account |
| **Other** | Any OpenAI-compatible API, or any command-line program or agent | Depends on the service |

- **With Ollama**, models are chosen from each machine's RAM: a small one with 8 GB and a bigger one with 16 GB.
- **Subscriptions** don't come with an API key, so they run through each company's official program: install it and sign in once. They only work on a computer.
- **API keys** are stored encrypted in Obsidian's **keychain**, on your device only. They never end up in the vault or in this repository.
- **Privacy:** with local AI your notes never leave your computer. With a cloud service or a subscription, the text the AI analyzes is sent to that service.

### A bigger vault shouldn't cost more tokens
An agent without a map reads whole notes, so the bigger the vault, the more it pays per task. `boveda` makes the agent **query** instead of read. Here is the same search measured on vaults of growing size:

| Notes in the vault | With `boveda` | Opening every matching note |
|---:|---:|---:|
| 100 | ~640 tokens | ~2,700 tokens |
| 1,000 | ~620 tokens | ~26,000 tokens |
| 5,000 | ~630 tokens | ~131,000 tokens |
| 20,000 | ~630 tokens | ~525,000 tokens |

The ideas come from [Lymi](https://github.com/haruxvi/Lymi), another project of mine:
- The index never enters the context whole.
- Sections are returned, not files.
- Every answer has a fixed budget.
- Savings are measured, not promised.

Raíz logs every AI call and every agent query, and shows them in **IA: ver consumo de tokens**.

It also takes ideas from [graphify](https://github.com/Graphify-Labs/graphify), [memU](https://github.com/NevaMind-AI/memU) and [Serena](https://github.com/oraios/serena), rewritten from scratch:
- **Writing by section** instead of rewriting pages: 91% fewer output tokens in the test.
- **Lessons across sessions**, so the agent doesn't research the same thing twice.
- **Search by meaning** with a RAM safeguard: it improved 5 of 12 queries and made none worse.
- **Graph walking** that doesn't get lost through hub notes.

### Getting started
1. Download or clone this repository and open it in [Obsidian](https://obsidian.md) as a vault. Use a recent version: 1.9 or later for databases, and the latest one for the keychain.
2. Enable community plugins when Obsidian asks.
3. Install the two plugins that are not bundled from the community store (see [THIRD_PARTY.md](THIRD_PARTY.md)).
4. Set up the AI with **✦ IA**. If you pick Ollama, run `Ctrl+P` → **Raíz: Descargar modelos de IA recomendados** (download recommended AI models).
5. Open **00 Dashboard → Inicio**. The full guide, in Spanish, is in [00 Dashboard/Guía Raíz.md](00%20Dashboard/Guía%20Raíz.md).

On iPhone or Android everything works except local AI: use an API provider, or your computer's AI over Tailscale.

### Folders
| Folder | Contents |
|---|---|
| `00 Bandeja` | Inbox: quick captures to process |
| `00 Dashboard` | Home, guide, quotes and personal space |
| `01 Diario` … `05 Anual` | Daily, weekly, monthly, quarterly and yearly notes |
| `06 Plantillas` | Templates, backgrounds (`Banners`) and your own images (`Portadas`, not uploaded) |
| `08 Académico` | Courses, academic dashboard and study pages |
| `09 Entrenamiento` | Routines and training dashboard |
| `10 Agenda` | Events and meetings |
| `11 Biblioteca` | Games, books, anime, manga, movies, series, videos and courses |
| `12 Conocimiento` | Notes, maps of content, tags and review (written by you) |
| `13 Wiki` | AI-maintained wiki: index, log, sources, summaries, entities, concepts, topics and answers |

### What is not in this repository
Your API keys, the sources in `13 Wiki/Fuentes` and the data in `13 Wiki/Datos`, your images in `06 Plantillas/Portadas`, library covers downloaded from external services, your own font files, the AI index (`vectores.json`), the cache and measurements of `boveda`, your usage log and your workspace state.

### Third-party software notice
The community plugins bundled in `.obsidian/plugins` were **not written by me**. They belong to their respective authors and are included unmodified, each under its original license. External AI services and programs are governed by their own terms. Details are in **[THIRD_PARTY.md](THIRD_PARTY.md)**.
