---
cssclasses:
  - raiz-panel
---
# Guía de Raíz

Raíz es el motor propio de este vault: **IA a tu elección** (local e ilimitada con Ollama, o el proveedor que quieras), entrenamiento, vida académica, agenda, hábitos y gráficos. Todo vive en tus archivos.

## 1. Activar la IA (una vez por equipo)
Haz clic en **✦ IA**, abajo a la derecha, o ve a **Ajustes → Raíz → Buscar mis IAs**. Raíz revisa lo que tienes y lo muestra en tres grupos:
- **En tu equipo**: Ollama, LM Studio, OpenClaw, Jan, llama.cpp o vLLM. Es gratis, sin límites y privado.
- **Tus suscripciones**: Claude Pro/Max, ChatGPT Plus/Pro, Google Gemini, Kimi y OpenCode. Funcionan con el programa oficial de cada empresa (Claude Code, Codex CLI, Gemini CLI, Kimi Code CLI, OpenCode). Lo instalas e inicias sesión **una vez** en una terminal con tu cuenta, sin API key. Cada respuesta cuenta en el límite de uso de tu plan.
- **Tus API keys**: OpenRouter y Vercel AI Gateway (una sola key para cientos de modelos), OpenAI, Anthropic, xAI (Grok), DeepSeek, Kimi, Qwen, Gemini, Mistral, Groq, Together, Fireworks, Perplexity, Cerebras, SambaNova, Hugging Face, NVIDIA NIM, Z.ai (GLM), MiniMax, Cohere, Azure OpenAI y OpenCode Zen. Encuentra las que guardaste en el Llavero de Obsidian o en tus variables de entorno.

En cada opción aparecen el **modelo rápido** y el **profundo** que Raíz elige solo. Con Ollama los elige según la RAM de cada equipo: en el PC de 8 GB usa uno chico y en el de 16 GB uno más grande. Los puedes cambiar ahí mismo. Con **Usar esta** queda todo configurado, y **Probar** comprueba que responde.

Para algo que no esté en la lista (otro bot, agente o servicio), usa **Configuración manual**:
- **Otro (API compatible con OpenAI)**: pegas su URL y su key.
- **Otra CLI o agente**: escribes el programa y sus argumentos.

Las API keys quedan cifradas en el **Llavero** de Obsidian, solo en tu equipo: nunca en el vault ni en GitHub.

Si usas la IA en la nube o por suscripción, el texto que analiza se envía a ese servicio. Las notas relacionadas pueden seguir usando Ollama en local. Las suscripciones por CLI solo funcionan en el computador; en el iPhone usa una API o tu PC con Ollama.

### Con Ollama
1. Ollama ya está instalado y corriendo en este PC. En otro equipo, instálalo desde **ollama.com**.
2. En Obsidian: `Ctrl+P` → **Raíz: Descargar modelos de IA recomendados**.
3. La barra inferior debe decir **✦ IA lista**. Si no, haz clic en ella para volver a comprobar.

| Equipo | Modelo rápido | Modelo profundo |
|---|---|---|
| PC del trabajo (8 GB) | `qwen2.5:3b` | `qwen2.5:3b` |
| PC de la casa (16 GB) | `qwen2.5:3b` | `qwen2.5:7b` |

Raíz elige solo según la RAM. Puedes cambiar los modelos en **Ajustes → Raíz**.

**En el iPhone:** la IA corre en tu PC. Instala Tailscale en ambos, abre Ollama en el PC con la variable `OLLAMA_HOST=0.0.0.0` y en **Ajustes → Raíz → URL de Ollama (este dispositivo)** pon `http://<ip-tailscale-del-pc>:11434`. Todo lo demás (escribir, gráficos, paneles) funciona sin IA.

## 2. Tu día
Abre la nota del día (ícono ☀️ en la barra izquierda o **Raíz: Abrir la nota de hoy**). Tiene:
- **Diario libre** arriba. Los botones **⚡ IA** le ponen nota y título a tu día.
- **🌅 Hoy**: reuniones, clases del horario, evaluaciones de los próximos 7 días, tareas por vencer y pendientes de días anteriores (puedes marcarlas ahí mismo).
- **✅ Tareas**: `- [ ] algo`. Si le agregas `[vence:: 2026-10-20]`, aparecerá cuando se acerque.
- **🏋️ Entrenamiento** (interactivo):
  1. Elige el tipo y aprieta **▶ Empezar** para el cronómetro.
  2. **📋 Rutina** carga los ejercicios con tu **última marca**. También puedes agregar ejercicios: el buscador autocompleta con tu historial.
  3. Ajusta kg y reps, y marca **✓** al terminar cada serie: arranca el **descanso** con aviso sonoro y la serie queda registrada. Si superas tu mejor marca aparece **🔥 PR**.
  4. **⏹ Terminar** guarda la duración. Elige tu **RPE**.
  5. Solo cuentan las series marcadas, así que lo planificado y no hecho no ensucia tus estadísticas.
- **🎯 Mis metas**: agua, comida, pasos, sueño, peso, lectura, estudio… con anillos y barras. Toca **+** o **−**, o toca el número para escribir el valor exacto. Al cumplir una meta hay festejo.
- **🌡️ Check-in**: ánimo, energía y hábitos de sí o no.

### Tus metas, tus números
No hay fórmulas tipo "si pesas tanto, come tanto": cada quien pone lo suyo. Con el engranaje del bloque **Mis metas** (o **Raíz: Editar mis metas**) puedes:
- Cambiar el objetivo, la unidad y cuánto suma cada toque (por ejemplo 0,25 L de agua o 500 pasos).
- Agregar las metas que quieras (meditar, guitarra, idiomas…), apagarlas, reordenarlas o borrarlas.
- Elegir el tipo: **Meta** suma hacia un objetivo; **Medida** solo registra un valor, como el peso, con un objetivo opcional.
- Elegir el estilo: **Anillo**, o **Barra** para ver varias juntas, como los macros bajo las calorías.
- Agruparlas (Comida, Actividad, Cuerpo, Mente…) y darles ícono y color.

Los números de ejemplo están solo para empezar: ajústalos a ti.

### Formato de ejercicios (si prefieres escribir a mano)
```
- Press banca: 4x8 @ 60kg
- Sentadilla: 1x5 @ 100kg; 3x8 @ 80kg
- Dominadas: 4x8
- Dominadas lastradas: 4x6 @ +10kg
- Plancha: 3x45s
- Trote: 5km 28min
```

## 3. Semana, mes, trimestre y año
- **✨ Generar resumen**: la IA resume con ejemplos concretos y números (entreno, estudio, sueño, ánimo).
- **🌟 Rueda de la Vida** (semanal): puntaje y comentario en 9 áreas hechas para ti. Los meses, trimestres y años las promedian.
- **🔎 Pregúntale a tu…**: preguntas sobre ese periodo ("¿cuántas veces entrené pierna?", "¿qué me estresó?").
- El mes trae un **📅 calendario** con valoración por color, 🏋️ días entrenados, 📝 evaluaciones y reuniones.
- El año trae una **🔭 Revisión del año** escrita por la IA, incluyendo tus marcas personales.

## 4. Paneles
- [[Inicio]]: tu centro.
  - Reloj y tarjetas por área. Sus imágenes se cambian en **Ajustes → Raíz → Inicio**.
  - Frase del día, que sale de [[Frases]].
  - Cuadros de Metas, Rituales y Reflexión, que se editan en [[Mi espacio]].
  - Mapa de actividad del año: toca un día para ver sus notas.
  - Tu día y el mes.
  - **Preparar mi espacio** deja a la derecha el calendario, el grafo local y las conexiones.
- [[Panel académico]]: horario semanal, promedio por ramo, **nota que necesitas** en lo que queda y próximas evaluaciones (escala chilena 1–7, configurable).
- [[Panel de entrenamiento]]: sesiones por semana contra tu meta, racha, **tus metas de los últimos 7 días** (días cumplidos, promedio y racha), evolución de cualquier meta en 30 días contra su objetivo, volumen, peso y sueño, progresión de un ejercicio, mejores marcas y **🧠 Coach** con IA.
- Las notas de la semana y del mes también resumen tus metas.
- [[Agenda]]: los próximos 60 días, calendario y tareas con fecha.

## Estudio estilo Notion
Todo vive en `08 Académico/Estudio`.

**Las páginas**
- Organiza tus páginas en **Áreas** (por ejemplo Informática o Estudios complementarios). Dentro van **Asignaturas** y **Habilidades**, después **Temas** y al final **Apuntes** o **Conceptos**. Crea una con **Raíz: Estudio: nueva página** o con **Nueva subpágina** dentro de otra.
- Cada página tiene:
  - Migas de pan.
  - Un **ícono** que eliges al hacer clic.
  - **Portada**: imágenes tuyas de `06 Plantillas/Portadas`, una URL o una al azar.
  - **Importancia** de 1 a 5 estrellas.
  - Una tabla con sus subpáginas, con las vistas *Todas las notas*, *Por número de clase*, *Tarjetas* y *Lista simple*.
- Esas tablas son **Bases** de Obsidian: puedes editar celdas, ordenar, filtrar, agrupar y crear tus propias vistas, igual que en Notion.
- Las notas de clase se numeran solas (Clase 1, 2, 3…).
- Una **Colección** es una página que solo agrupa otras, como [[Notas de clase]] dentro de [[Informática]]. Su tabla trae las vistas *Todas las notas*, *Por número de curso*, *Tarjetas* y *Lista simple*, y un botón **Nueva entrada**.
- Las entradas nuevas **heredan las propiedades de sus hermanas**. Por ejemplo, si una asignatura tiene la casilla `revisado`, la siguiente que crees también la trae, sin marcar.

**Crear dentro de cualquier nota** (botón **Insertar** de la página, clic derecho en el editor, o `/` y escribe *Insertar*)
- **Nueva página dentro de esta.** Crea la subpágina y deja su `[[enlace]]` donde está el cursor.
- **Base con vistas.** Una tabla con las subpáginas de la nota y su botón **Nueva entrada**. Sirve en cualquier nota, no solo en las de estudio.
- **Tarjeta de otra página.** Un enlace visual con portada, ícono, ubicación y resumen, como las tarjetas de Notion.
- **Módulo.** Cualquier panel del sistema dentro de la nota: Hoy, calendario del mes, agenda, tareas pendientes, biblioteca (completa o de una categoría), panel académico, entrenamiento, repaso, bandeja, conocimiento, notas del tema, mapa de contenido, etiquetas o mapa de actividad.
- **Convertir esta nota en página.** Le da ícono, portada, importancia y subpáginas a una nota que ya tenías, sin tocar lo que escribiste.
- Si escribes un `[[enlace]]` a una nota que no existe y le haces clic dentro de una página, la nota nace como **subpágina** suya, guardada a su lado. Puedes apagarlo en los ajustes de Raíz.

**Escribir a mano**
- Escribe `/` para abrir el menú de bloques, como en Notion. Están los **Bloque: …**:
  - Nota, Importante, Definición, Ejemplo, Ojo.
  - Desplegable.
  - Código, ecuación LaTeX, tabla, comparación A vs B y diagrama.
  - Pregunta de repaso.

**Escribir con IA** (botón **IA** de la página, o clic derecho sobre texto seleccionado)
- **Redactar el apunte a partir del título.** Llega con un aviso para revisarlo: el modelo local puede equivocarse, sobre todo en código.
- **Explicar o mejorar** la selección.
- **Ejemplo de código.**
- **Resumir** en la propiedad `resumen`.
- **Sugerir etiquetas** de tema.
- **Generar preguntas** de repaso.

**Del método del video**
- Cada mapa tiene **Todas las notas del tema**, ordenables por importancia o fecha.
- **Grafo local** abre al lado las conexiones de la nota.

## Biblioteca: juegos, libros, anime, manga, películas, series, videos y cursos
- **Videos y Cursos de YouTube:** pega el enlace al agregar. Se traen el título, el canal y la miniatura.
- **Ver tablero:** la biblioteca se ordena en columnas por estado (Pendiente, En curso, Terminado…), con fechas y nota.
En [[Biblioteca]] o con el ícono de librería en la barra izquierda:
- **＋ Agregar**: busca el título y elige el resultado. La portada, el autor o estudio, el año, los géneros y el total de episodios o páginas se completan solos. La portada se guarda en el vault, así que funciona sin internet y en el celular.
- **De dónde salen los datos**:
  - Juegos: Steam y Wikipedia.
  - Libros: OpenLibrary.
  - Anime y manga: AniList, con MyAnimeList de respaldo.
  - Series: TVMaze.
  - Películas: Wikipedia.
- **Filtros**: categoría, estado, género, favoritos y búsqueda. Puedes ordenar por recientes, puntuación, título, año o progreso, y cambiar el tamaño de las portadas.
- **En cada título**: cambia el estado, ponle nota del 1 al 10 (de "Malo" a "Obra maestra"), avanza el progreso con **＋/−** y márcalo como favorito. Las fechas de inicio y fin se ponen solas.
- **Categorías propias** (por ejemplo, juegos de mesa o podcasts): agrégalas en **Ajustes → Raíz → Biblioteca**, con su emoji, color, buscador y unidad.
- **Vista planilla** para editar en masa: abre `Biblioteca.base`.

## Conocimiento: notas conectadas
Basado en la idea de *enlazar en vez de archivar*:
- **Raíz: Nueva nota de conocimiento**: una idea por nota, conectada a un **mapa** (MOC) o a una **asignatura**.
- Cada asignatura funciona como mapa: sus apuntes aparecen solos en **🧠 Apuntes conectados**.
- [[Conocimiento]] muestra tus mapas, las notas **huérfanas** (sin enlaces), las más conectadas y tus temas. Desde ahí también abres el grafo.

### Panel de conexiones
Ábrelo con el ícono de nodos de la barra izquierda o con **Raíz: Abrir panel de conexiones**. Se actualiza con la nota que tengas abierta y tiene tres partes:
- **Menciona sin enlazar**: nombres de otras notas que escribiste sin `[[ ]]`. Se enlazan con un clic o todas juntas.
- **Te nombran sin enlace**: otras notas que nombran a esta. Puedes enlazarlas desde aquí.
- **✨ Relacionadas (IA local)**: notas parecidas por significado, aunque no compartan palabras, con **＋ Enlazar**.
  - Usa el modelo `bge-m3`, que entiende bien el español y corre en tu PC.
  - El índice se actualiza solo al abrir Obsidian. A mano: **Raíz: Indexar notas para la IA**.

### Pregúntale a tu vault
**Raíz: Pregúntale a todo tu vault**: haz una pregunta. La IA busca las notas más relevantes, responde citándolas con [n] y puedes abrir cada fuente.

### Bandeja de entrada
- **Capturar**: **📥 Capturar** (en Inicio o en la barra izquierda) guarda una idea en segundos, sin pensar dónde va.
- **Procesar**: en [[Bandeja]], cada captura se convierte en:
  - **🧠 Nota**, conectada a un mapa o asignatura.
  - **✅ Tarea** para hoy.
  - **📚 Biblioteca**: busca el título.
  - **📅 Evento**.
  - **🗑**: se descarta.
- **✨ IA** te sugiere el destino y el mapa, y lo aplicas con un clic.
- La semana trae un recordatorio para vaciar la bandeja.

### Etiquetas
- **Convención**:
  - `#tema/…` para el contenido (`#tema/sql`).
  - `#estado/…` para el avance.
  - `#tipo/…` para la forma.
- [[Etiquetas]] detecta duplicadas (`SQL` y `sql`, singular y plural) y las **unifica** en todo el vault.
- También ordena las sueltas bajo `tema/` y te avisa cuando un tema tiene 5 notas o más, para crearle un **mapa**.
- Cada mapa tiene **Etiquetas que reúne**: las notas con esas etiquetas que aún no están conectadas aparecen en el mapa con **＋ Conectar**.

### Repaso de apuntes
- **Crear preguntas**: en un apunte, **🃏 Generar preguntas** crea preguntas tipo certamen con su respuesta. También puedes escribirlas a mano: `- ❓ ¿Pregunta? ➜ Respuesta`.
- **Repasar**: en [[Repaso]] se usa repetición espaciada. Lo que te sabes vuelve cada vez más tarde y lo que te cuesta vuelve pronto.
  - Atajos: **espacio** muestra la respuesta y **1–4** califica.
- **Modo certamen**: si una asignatura tiene una evaluación en los próximos 21 días, aparece este modo para practicar todas sus tarjetas.
- Tu nota del día te avisa cuántas tarjetas tocan hoy.

## 5. Crear cosas
`Ctrl+P` y escribe **Raíz**:
- **Nueva asignatura**: nombre, código, semestre, horario (`Lun 08:15-09:45 | Sala A-12`, uno por línea). Después llena las evaluaciones con `[pond:: 30] [fecha:: 2026-10-20] [nota:: 5,5]`.
- **Nuevo evento o reunión**: aparece en tu día, en el calendario y en la agenda.
- **Nueva rutina**: una línea por ejercicio en `## Ejercicios`.

## 6. Personalizar
En **Ajustes → Raíz** puedes cambiar:
- **Mis metas** (botón **Editar mis metas**).
- Hábitos de sí o no (`clave | etiqueta`).
- Áreas de la Rueda de la Vida (`clave | emoji | etiqueta | color | descripción`).
- Tipos de entrenamiento y meta de sesiones por semana.
- Escala de notas y semestre actual.

Los cambios aplican a las notas nuevas.

### Tipografía
En **Ajustes → Raíz → Tipografía** eliges la fuente del **texto**, de los **títulos** y de la **interfaz**:
- **Fuentes incluidas**: EB Garamond (libro clásico), Cormorant, Lora, Playfair, Merriweather, Georgia, Palatino, Inter, Space Grotesk, Nunito, JetBrains Mono, Caveat (a mano) y la del sistema.
- **Cualquiera instalada en tu PC**: escribe su nombre.
- **Archivos de fuentes**: con **Agregar fuente** subes .ttf, .otf, .woff o .woff2. Se guardan en el plugin y no se suben a GitHub.

Hay una vista previa para ver cómo queda.

### Estilo visual
El tema está en `.obsidian/snippets/raiz-theme.css` y usa la paleta "bosque nocturno":
- **Un color por día de la semana**: lunes celeste, martes menta, miércoles lima, jueves ámbar, viernes coral, sábado violeta y domingo turquesa.
- **Un color por periodo**: semana violeta, mes ámbar, trimestre celeste y año rosa.

### Imagen de fondo de cada apartado
En cualquier nota usa el botón **Fondo** de la cabecera, la opción **Cambiar imagen de fondo** del menú de la nota (⋯ o clic derecho en la pestaña) o el comando **Raíz: Cambiar imagen de fondo**. Puedes:
- **Elegir una imagen de tu PC.** Se copia a `06 Plantillas/Portadas`, que no se sube a GitHub.
- Pegar una URL, o usar uno de los fondos de Raíz o una imagen al azar.
- Aplicarla **solo a esa nota** o a **todo el apartado**: días, semanas, meses, trimestres, años, Académico, Entrenamiento, Agenda, Biblioteca, Conocimiento, Inicio o Bandeja. Con todo el apartado cambian las notas que ya tienes ahí y las que crees después. Tus portadas propias se respetan.
- **Restaurar el original** cuando quieras. En **Ajustes → Raíz → Fondos por apartado** ves los que cambiaste.

Los banners se generan con código (aurora, curvas de nivel y raíces) y están en `06 Plantillas/Banners`. Para cambiar un color, edita las variables `--raiz-a1` y `--raiz-a2` del snippet.

> Todo es tuyo: el plugin está en `.obsidian/plugins/raiz/main.js` (JavaScript plano, sin compilar) y las plantillas en `06 Plantillas`. El vault tiene historial con git, así que cualquier cambio se puede deshacer.
