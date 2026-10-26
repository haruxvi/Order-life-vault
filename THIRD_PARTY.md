# Third-party software

*Versión en español: [TERCEROS.md](TERCEROS.md)*

This repository includes Obsidian community plugins that **I did not write**. They are redistributed **unmodified**, only so the vault works out of the box when cloned. All rights belong to their respective authors.

- Each plugin keeps its original license. The full license text is in `.obsidian/plugins/<plugin>/LICENSE`.
- The source code of each plugin is available in its official repository (links below).
- If you are the author of any of these plugins and would prefer it not be redistributed here, please open an issue and I will remove it.

| Plugin | Folder | Author | License | Official repository |
|---|---|---|---|---|
| Callout Manager | `callout-manager` | eth-p | MIT | https://github.com/eth-p/obsidian-callout-manager |
| Commander | `cmdr` | jsmorabito & phibr0 | MIT | https://github.com/jsmorabito/obsidian-commander |
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

## Not included (no declared license)
These plugins are used by the vault but are **not redistributed**, because their repositories do not declare a license. Install them from *Settings → Community plugins*:

| Plugin | Author | Official repository |
|---|---|---|
| Image in Editor | Ozan Tellioglu | https://github.com/ozntel/oz-image-in-editor-obsidian |
| Paste URL into selection | denolehov | https://github.com/denolehov/obsidian-url-into-selection |

## External services
- The **AI** runs on whichever provider you choose: local (Ollama, LM Studio, OpenClaw and others), a subscription (through each company's official program: Claude Code, Codex CLI, Gemini CLI, Kimi Code CLI, OpenCode) or your own API key (OpenRouter, OpenAI, Anthropic, xAI, DeepSeek, Mistral and others). None of them are bundled: every service, program and model (for example `qwen2.5` or `bge-m3`) is installed or subscribed to separately and is governed by its own terms and licenses.
- The **Library** queries public APIs for covers and metadata: Steam, OpenLibrary, AniList, Jikan/MyAnimeList, TVMaze and Wikipedia. Downloaded covers belong to their respective owners and are not included in this repository.
- **Videos and courses** use YouTube's public oEmbed service to fetch titles and thumbnails.
- **Typography** can download fonts from Google Fonts when you pick them. Each font keeps its own license, mostly the SIL Open Font License.

## My own work
I wrote these myself:
- The **Raíz** plugin (`.obsidian/plugins/raiz`), including the agent tool `boveda.js`, which adapts ideas from my project [Lymi](https://github.com/haruxvi/Lymi).
- The theme `.obsidian/snippets/raiz-theme.css`.
- The code-generated SVG banners in `06 Plantillas/Banners`.
- The templates in `06 Plantillas`, and the vault's notes and dashboards.
