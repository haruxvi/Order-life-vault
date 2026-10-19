---
cssclasses:
  - raiz-panel
---
# 📖 Guía de Raíz

Raíz es el motor propio de este vault: **IA 100 % local e ilimitada** (con Ollama, sin API key ni licencia), entrenamiento, vida académica, agenda, hábitos y gráficos. Todo vive en tus archivos.

## 1. Activar la IA (una vez por equipo)
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
- **🌡️ Check-in**: ánimo, energía, sueño, peso, horas de estudio y hábitos.

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
- [[Inicio]]: tu día, la semana en números y el mes.
- [[Panel académico]]: horario semanal, promedio por ramo, **nota que necesitas** en lo que queda y próximas evaluaciones (escala chilena 1–7, configurable).
- [[Panel de entrenamiento]]: sesiones por semana contra tu meta, racha, volumen, peso y sueño, progresión de un ejercicio, mejores marcas y **🧠 Coach** con IA.
- [[Agenda]]: los próximos 60 días, calendario y tareas con fecha.

## 📚 Biblioteca: juegos, libros, anime, manga, películas, series
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

## 🧠 Conocimiento: notas conectadas
Basado en la idea de *enlazar en vez de archivar*:
- **Raíz: Nueva nota de conocimiento**: una idea por nota, conectada a un **mapa** (MOC) o a una **asignatura**.
- Cada asignatura funciona como mapa: sus apuntes aparecen solos en **🧠 Apuntes conectados**.
- [[Conocimiento]] muestra tus mapas, las notas **huérfanas** (sin enlaces), las más conectadas y tus temas. Desde ahí también abres el grafo.

### 🔗 Panel de conexiones
Ábrelo con el ícono de nodos de la barra izquierda o con **Raíz: Abrir panel de conexiones**. Se actualiza con la nota que tengas abierta y tiene tres partes:
- **Menciona sin enlazar**: nombres de otras notas que escribiste sin `[[ ]]`. Se enlazan con un clic o todas juntas.
- **Te nombran sin enlace**: otras notas que nombran a esta. Puedes enlazarlas desde aquí.
- **✨ Relacionadas (IA local)**: notas parecidas por significado, aunque no compartan palabras, con **＋ Enlazar**.
  - Usa el modelo `bge-m3`, que entiende bien el español y corre en tu PC.
  - El índice se actualiza solo al abrir Obsidian. A mano: **Raíz: Indexar notas para la IA**.

### 🔎 Pregúntale a tu vault
**Raíz: Pregúntale a todo tu vault**: haz una pregunta. La IA busca las notas más relevantes, responde citándolas con [n] y puedes abrir cada fuente.

### 📥 Bandeja de entrada
- **Capturar**: **📥 Capturar** (en Inicio o en la barra izquierda) guarda una idea en segundos, sin pensar dónde va.
- **Procesar**: en [[Bandeja]], cada captura se convierte en:
  - **🧠 Nota**, conectada a un mapa o asignatura.
  - **✅ Tarea** para hoy.
  - **📚 Biblioteca**: busca el título.
  - **📅 Evento**.
  - **🗑**: se descarta.
- **✨ IA** te sugiere el destino y el mapa, y lo aplicas con un clic.
- La semana trae un recordatorio para vaciar la bandeja.

### 🏷️ Etiquetas
- **Convención**:
  - `#tema/…` para el contenido (`#tema/sql`).
  - `#estado/…` para el avance.
  - `#tipo/…` para la forma.
- [[Etiquetas]] detecta duplicadas (`SQL` y `sql`, singular y plural) y las **unifica** en todo el vault.
- También ordena las sueltas bajo `tema/` y te avisa cuando un tema tiene 5 notas o más, para crearle un **mapa**.
- Cada mapa tiene **Etiquetas que reúne**: las notas con esas etiquetas que aún no están conectadas aparecen en el mapa con **＋ Conectar**.

### 🃏 Repaso de apuntes
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
- Hábitos (`clave | etiqueta`).
- Áreas de la Rueda de la Vida (`clave | emoji | etiqueta | color | descripción`).
- Tipos de entrenamiento y meta de sesiones por semana.
- Escala de notas y semestre actual.
- El texto **Sobre ti**, que la IA usa como contexto.

Los cambios aplican a las notas nuevas.

### Estilo visual
El tema está en `.obsidian/snippets/raiz-theme.css` y usa la paleta "bosque nocturno":
- **Un color por día de la semana**: lunes celeste, martes menta, miércoles lima, jueves ámbar, viernes coral, sábado violeta y domingo turquesa.
- **Un color por periodo**: semana violeta, mes ámbar, trimestre celeste y año rosa.

Los banners se generan con código (aurora, curvas de nivel y raíces) y están en `06 Templates/Banners`. Para cambiar un color, edita las variables `--raiz-a1` y `--raiz-a2` del snippet.

> Todo es tuyo: el plugin está en `.obsidian/plugins/raiz/main.js` (JavaScript plano, sin compilar) y las plantillas en `06 Templates`. El vault tiene historial con git, así que cualquier cambio se puede deshacer.
