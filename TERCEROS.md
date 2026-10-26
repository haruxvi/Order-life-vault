# Software de terceros

*English version: [THIRD_PARTY.md](THIRD_PARTY.md)*

Este repositorio incluye plugins de la comunidad de Obsidian que **no son de mi autoría**. Se redistribuyen **sin modificaciones** y solo para que el vault funcione al clonarlo. Todos los derechos pertenecen a sus autores.

- Cada plugin conserva su licencia original. Su texto completo está en `.obsidian/plugins/<plugin>/LICENSE`.
- El código fuente de cada uno está disponible en su repositorio oficial (enlaces abajo).
- Si eres autor de alguno de estos plugins y prefieres que no se redistribuya aquí, abre un issue y lo retiro.

| Plugin | Carpeta | Autor | Licencia | Repositorio oficial |
|---|---|---|---|---|
| Callout Manager | `callout-manager` | eth-p | MIT | https://github.com/eth-p/obsidian-callout-manager |
| Commander | `cmdr` | jsmorabito y phibr0 | MIT | https://github.com/jsmorabito/obsidian-commander |
| Dataview | `dataview` | Michael Brenan | MIT | https://github.com/blacksmithgu/obsidian-dataview |
| Iconic | `iconic` | Holo (gfxholo) | MIT-0 | https://github.com/gfxholo/iconic |
| Journals | `journals` | Sergii Kostyrko | MIT | https://github.com/srg-kostyrko/obsidian-journal |
| Charts | `obsidian-charts` | phibr0 | AGPL-3.0 | https://github.com/phibr0/obsidian-charts |
| Contextual Typography | `obsidian-contextual-typography` | mgmeyers | GPL-3.0 | https://github.com/mgmeyers/obsidian-contextual-typography |
| Meta Bind | `obsidian-meta-bind-plugin` | Moritz Jung | GPL-3.0 | https://github.com/mProjectsCode/obsidian-meta-bind-plugin |
| Smart Typography | `obsidian-smart-typography` | mgmeyers | GPL-3.0 | https://github.com/mgmeyers/obsidian-smart-typography |
| Style Settings | `obsidian-style-settings` | mgmeyers | GPL-3.0 | https://github.com/community-archive/obsidian-style-settings |
| Tracker | `obsidian-tracker` | pyrochlore | MIT | https://github.com/pyrochlore/obsidian-tracker |
| BRAT | `obsidian42-brat` | TfTHacker | MIT | https://github.com/TfTHacker/obsidian42-brat |
| Pixel Banner | `pexels-banner` | Justin Parker (eQui\\ Labs) | Apache-2.0 | https://github.com/jparkerweb/pixel-banner |
| Templater | `templater-obsidian` | SilentVoid13 | AGPL-3.0 | https://github.com/SilentVoid13/Templater |

## No incluidos (sin licencia declarada)
Estos plugins se usan en el vault, pero **no se redistribuyen** porque su repositorio no declara una licencia. Instálalos desde *Ajustes → Plugins de la comunidad*:

| Plugin | Autor | Repositorio oficial |
|---|---|---|
| Image in Editor | Ozan Tellioglu | https://github.com/ozntel/oz-image-in-editor-obsidian |
| Paste URL into selection | denolehov | https://github.com/denolehov/obsidian-url-into-selection |

## Servicios externos
- La **IA** funciona con el proveedor que elijas: local (Ollama, LM Studio, OpenClaw y otros), por suscripción (con el programa oficial de cada empresa: Claude Code, Codex CLI, Gemini CLI, Kimi Code CLI, OpenCode) o con tu API key (OpenRouter, OpenAI, Anthropic, xAI, DeepSeek, Mistral y otros). Ninguno viene incluido: cada servicio, programa y modelo (por ejemplo `qwen2.5` o `bge-m3`) se instala o contrata aparte y se rige por sus propios términos y licencias.
- La **Biblioteca** consulta APIs públicas para obtener portadas y datos: Steam, OpenLibrary, AniList, Jikan/MyAnimeList, TVMaze y Wikipedia. Las portadas descargadas pertenecen a sus titulares y no se incluyen en este repositorio.
- Los **videos y cursos** usan el servicio público oEmbed de YouTube para obtener el título y la miniatura.
- La **tipografía** puede descargar fuentes de Google Fonts al elegirlas. Cada fuente conserva su licencia, en su mayoría SIL Open Font License.

## Lo propio
Son de mi autoría:
- El plugin **Raíz** (`.obsidian/plugins/raiz`), incluida la herramienta para agentes `boveda.js`, que adapta ideas de mi proyecto [Lymi](https://github.com/haruxvi/Lymi) y, reescritas desde cero sin copiar código, de [graphify](https://github.com/Graphify-Labs/graphify), [memU](https://github.com/NevaMind-AI/memU) y [Serena](https://github.com/oraios/serena).
- El tema `.obsidian/snippets/raiz-theme.css`.
- Los banners SVG de `06 Plantillas/Banners`, generados con código.
- Las plantillas de `06 Plantillas` y las notas y paneles del vault.
