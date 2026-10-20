'use strict';
/*
 * Raíz — plugin propio del vault.
 * IA 100% local vía Ollama (sin API key, sin límites), entrenamiento, vida académica,
 * agenda, hábitos y gráficos. Expone su API en window.raiz para las plantillas de Templater
 * y los bloques dataviewjs.
 */
const { Plugin, PluginSettingTab, Setting, Notice, Modal, FuzzySuggestModal, ItemView, MarkdownRenderer, MarkdownView, Menu, setIcon, getIconIds, getAllTags, requestUrl, TFile, moment } = require('obsidian');

// ───────────────────────────── Proveedores de IA ─────────────────────────────
// kind "openai" = API compatible con OpenAI (/chat/completions). Los modelos son solo sugerencias:
// en los ajustes, "Cargar modelos" trae la lista real de cada proveedor.
const AI_PROVIDERS = {
  ollama: { label: 'Ollama (local, en tu PC)', kind: 'ollama', local: true },
  lmstudio: { label: 'LM Studio (local)', kind: 'openai', local: true, baseUrl: 'http://127.0.0.1:1234/v1', hint: 'Abre LM Studio, carga un modelo y activa el servidor local (Developer → Start server).' },
  openai: { label: 'OpenAI (ChatGPT, GPT)', kind: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true, json: true, fast: 'gpt-4.1-mini', deep: 'gpt-4.1', embed: 'text-embedding-3-small', keyUrl: 'https://platform.openai.com/api-keys', hint: 'La suscripción de ChatGPT (Plus, Codex) no incluye la API: necesitas una API key de platform.openai.com, que se cobra aparte por uso.' },
  anthropic: { label: 'Anthropic (Claude)', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', needsKey: true, fast: 'claude-haiku-5-5', deep: 'claude-sonnet-5-5', keyUrl: 'https://console.anthropic.com/settings/keys', hint: 'La suscripción de Claude (Pro, Max) no incluye la API: necesitas una API key de la consola de Anthropic, que se cobra por uso.' },
  xai: { label: 'xAI (Grok)', kind: 'openai', baseUrl: 'https://api.x.ai/v1', needsKey: true, json: true, keyUrl: 'https://console.x.ai', hint: 'Usa "Cargar modelos" para elegir entre los Grok disponibles en tu cuenta.' },
  deepseek: { label: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', needsKey: true, json: true, fast: 'deepseek-chat', deep: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys' },
  kimi: { label: 'Kimi (Moonshot AI)', kind: 'openai', baseUrl: 'https://api.moonshot.ai/v1', needsKey: true, json: true, keyUrl: 'https://platform.moonshot.ai/console/api-keys', hint: 'Usa "Cargar modelos" para elegir un modelo Kimi.' },
  qwen: { label: 'Qwen (Alibaba Cloud)', kind: 'openai', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', needsKey: true, json: true, fast: 'qwen-plus', deep: 'qwen-max', keyUrl: 'https://modelstudio.console.alibabacloud.com/' },
  gemini: { label: 'Google Gemini', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true, json: true, fast: 'gemini-2.5-flash', deep: 'gemini-2.5-pro', keyUrl: 'https://aistudio.google.com/apikey' },
  openrouter: { label: 'OpenRouter (cientos de modelos con una sola key)', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, keyUrl: 'https://openrouter.ai/keys', hint: 'Con una sola key usas modelos de OpenAI, Anthropic, Google, xAI, DeepSeek, Qwen, Kimi y más.' },
  groq: { label: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', needsKey: true, json: true, fast: 'llama-3.3-70b-versatile', deep: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys' },
  mistral: { label: 'Mistral AI', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', needsKey: true, json: true, fast: 'mistral-small-latest', deep: 'mistral-large-latest', embed: 'mistral-embed', keyUrl: 'https://console.mistral.ai/api-keys' },
  together: { label: 'Together AI', kind: 'openai', baseUrl: 'https://api.together.xyz/v1', needsKey: true, json: true, keyUrl: 'https://api.together.ai/settings/api-keys', hint: 'Modelos abiertos (Llama, Qwen, DeepSeek, Kimi, GLM…). Usa "Cargar modelos".' },
  fireworks: { label: 'Fireworks AI', kind: 'openai', baseUrl: 'https://api.fireworks.ai/inference/v1', needsKey: true, json: true, keyUrl: 'https://fireworks.ai/account/api-keys' },
  perplexity: { label: 'Perplexity (responde buscando en internet)', kind: 'openai', baseUrl: 'https://api.perplexity.ai', needsKey: true, noModels: true, fast: 'sonar', deep: 'sonar-pro', keyUrl: 'https://www.perplexity.ai/settings/api' },
  cerebras: { label: 'Cerebras (muy rápido)', kind: 'openai', baseUrl: 'https://api.cerebras.ai/v1', needsKey: true, keyUrl: 'https://cloud.cerebras.ai' },
  sambanova: { label: 'SambaNova', kind: 'openai', baseUrl: 'https://api.sambanova.ai/v1', needsKey: true, keyUrl: 'https://cloud.sambanova.ai/apis' },
  huggingface: { label: 'Hugging Face (Inference Providers)', kind: 'openai', baseUrl: 'https://router.huggingface.co/v1', needsKey: true, keyUrl: 'https://huggingface.co/settings/tokens', hint: 'Usa un token de Hugging Face con permiso de inferencia.' },
  nvidia: { label: 'NVIDIA NIM', kind: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1', needsKey: true, keyUrl: 'https://build.nvidia.com' },
  zai: { label: 'Z.ai (GLM de Zhipu)', kind: 'openai', baseUrl: 'https://api.z.ai/api/paas/v4', needsKey: true, keyUrl: 'https://z.ai/manage-apikey/apikey-list' },
  minimax: { label: 'MiniMax', kind: 'openai', baseUrl: 'https://api.minimax.io/v1', needsKey: true, noModels: true, keyUrl: 'https://www.minimax.io/platform', hint: 'Escribe el nombre del modelo que tengas disponible en tu cuenta.' },
  cohere: { label: 'Cohere', kind: 'openai', baseUrl: 'https://api.cohere.ai/compatibility/v1', needsKey: true, keyUrl: 'https://dashboard.cohere.com/api-keys' },
  vercel: { label: 'Vercel AI Gateway (muchos proveedores con una key)', kind: 'openai', baseUrl: 'https://ai-gateway.vercel.sh/v1', needsKey: true, keyUrl: 'https://vercel.com/ai-gateway', hint: 'Los modelos van como proveedor/modelo (ej. anthropic/claude-sonnet-5-5).' },
  azure: { label: 'Azure OpenAI', kind: 'openai', baseUrl: '', needsKey: true, keyHeader: 'api-key', hint: 'URL base: https://<tu-recurso>.openai.azure.com/openai/v1 · Modelo: el nombre de tu despliegue.' },
  opencode: { label: 'OpenCode Zen', kind: 'openai', baseUrl: 'https://opencode.ai/zen/v1', needsKey: true, keyUrl: 'https://opencode.ai/zen', hint: 'Usa tu API key de OpenCode Zen y "Cargar modelos" para elegir el modelo.' },
  openclaw: { label: 'OpenClaw (tu agente personal)', kind: 'openai', local: true, baseUrl: 'http://127.0.0.1:18789/v1', fast: 'openclaw:main', deep: 'openclaw:main', hint: 'Activa en OpenClaw gateway.http.endpoints.chatCompletions.enabled. El modelo es openclaw:<id del agente> (ej. openclaw:main), y en "API key" va el token del gateway si lo usas. Revisa el puerto de tu gateway.' },
  // Suscripciones: se usan a través del programa oficial de cada empresa, con tu sesión iniciada (sin API key)
  claude_cli: { label: 'Claude Pro / Max (con Claude Code)', kind: 'cli', bin: 'claude', args: ['-p', '--output-format', 'text', '--model', '{model}'], stdin: true, fast: 'haiku', deep: 'sonnet', models: ['haiku', 'sonnet', 'opus'], login: 'claude (y luego /login)', install: 'https://claude.com/claude-code', hint: 'Usa tu plan de Claude a través de Claude Code. Instálalo, abre una terminal, escribe "claude" e inicia sesión con tu cuenta. Cada respuesta cuenta en el límite de uso de tu plan.' },
  codex_cli: { label: 'ChatGPT Plus / Pro (con Codex CLI)', kind: 'cli', bin: 'codex', args: ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '-m', '{model}', 'Lee la petición que llega por la entrada estándar y respóndela.'], stdin: true, login: 'codex login', install: 'https://developers.openai.com/codex/cli', hint: 'Usa tu plan de ChatGPT a través de Codex CLI. Instálalo y ejecuta "codex login" para iniciar sesión con tu cuenta de ChatGPT. Si dejas el modelo vacío, usa el que tenga tu plan.' },
  gemini_cli: { label: 'Google Gemini (con Gemini CLI)', kind: 'cli', bin: 'gemini', args: ['-m', '{model}', '-p', 'Lee la petición que llega por la entrada estándar y respóndela.'], stdin: true, fast: 'gemini-2.5-flash', deep: 'gemini-2.5-pro', models: ['gemini-2.5-flash', 'gemini-2.5-pro'], login: 'gemini', install: 'https://geminicli.com', hint: 'Usa tu cuenta de Google (tiene un plan gratis) a través de Gemini CLI. Instálalo, escribe "gemini" en una terminal e inicia sesión.' },
  kimi_cli: { label: 'Kimi (con Kimi Code CLI)', kind: 'cli', bin: 'kimi', args: ['--output-format', 'text', '-p', 'Lee el archivo {archivo} y responde exactamente lo que pide. No modifiques archivos.'], stdin: false, login: 'kimi (y luego /login)', install: 'https://www.kimi.com/code', hint: 'Usa tu membresía de Kimi a través de Kimi Code CLI. Instálalo, escribe "kimi" en una terminal e inicia sesión con /login.' },
  opencode_cli: { label: 'OpenCode (con su CLI y las cuentas que conectes)', kind: 'cli', bin: 'opencode', args: ['run', '-m', '{model}', 'Lee el archivo {archivo} y responde exactamente lo que pide. No modifiques archivos.'], stdin: false, login: 'opencode auth login', install: 'https://opencode.ai', hint: 'Usa los proveedores que conectaste en OpenCode. El modelo va como proveedor/modelo (ej. opencode/grok-code); vacío = el que tengas por defecto.' },
  custom_cli: { label: 'Otra CLI o agente (comando propio)', kind: 'cli', bin: '', args: [], stdin: true, hint: 'Escribe el programa y sus argumentos. La petición llega por la entrada estándar; usa {archivo} si el programa la necesita en un archivo y {model} donde va el modelo.' },
  custom: { label: 'Otro (cualquier API compatible con OpenAI)', kind: 'openai', baseUrl: '', hint: 'Sirve para vLLM, llama.cpp, Jan, LocalAI, LiteLLM, Azure, Mistral, Together, Fireworks, agentes con API propia… Pon la URL base que termina en /v1.' },
};

// ───────────────────────────── Tipografías ─────────────────────────────
// "g" = familia de Google Fonts (se descarga al elegirla); "css" = la pila de fuentes con respaldo del sistema.
const FONT_PRESETS = {
  '': { label: 'Raíz (Inter y Space Grotesk)' },
  garamond: { label: 'Libro clásico · EB Garamond', css: '"EB Garamond", Garamond, Georgia, serif', g: 'EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400' },
  cormorant: { label: 'Elegante · Cormorant Garamond', css: '"Cormorant Garamond", Garamond, Georgia, serif', g: 'Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400' },
  lora: { label: 'Lectura cómoda · Lora', css: 'Lora, Georgia, serif', g: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400' },
  playfair: { label: 'Editorial · Playfair Display', css: '"Playfair Display", Georgia, serif', g: 'Playfair+Display:ital,wght@0,400;0,600;0,700;1,400' },
  merriweather: { label: 'Periódico · Merriweather', css: 'Merriweather, Georgia, serif', g: 'Merriweather:ital,wght@0,400;0,700;1,400' },
  georgia: { label: 'Georgia (del sistema)', css: 'Georgia, "Times New Roman", serif' },
  palatino: { label: 'Palatino (del sistema)', css: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif' },
  inter: { label: 'Moderna · Inter', css: 'Inter, "Segoe UI", system-ui, sans-serif', g: 'Inter:wght@400;500;600;700' },
  grotesk: { label: 'Geométrica · Space Grotesk', css: '"Space Grotesk", Inter, system-ui, sans-serif', g: 'Space+Grotesk:wght@400;500;600;700' },
  nunito: { label: 'Redondeada · Nunito', css: 'Nunito, "Segoe UI", sans-serif', g: 'Nunito:ital,wght@0,400;0,600;0,700;1,400' },
  sistema: { label: 'La del sistema (Segoe UI, San Francisco…)', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  mono: { label: 'Monoespaciada · JetBrains Mono', css: '"JetBrains Mono", Consolas, monospace', g: 'JetBrains+Mono:wght@400;600' },
  caveat: { label: 'Escrita a mano · Caveat', css: 'Caveat, "Segoe Print", cursive', g: 'Caveat:wght@400;600;700' },
  custom: { label: 'Otra instalada en tu PC (escribe el nombre)' },
};

// ───────────────────────────── Configuración por defecto ─────────────────────────────

const DEFAULT_SETTINGS = {
  // Proveedor de IA: 'ollama' (local) o cualquiera de AI_PROVIDERS. Las API keys NO van aquí (se guardan por dispositivo).
  ai: { provider: 'ollama', providers: {}, embedVia: 'ollama' },
  fonts: { text: '', headings: '', ui: '' },
  ollamaUrl: 'http://127.0.0.1:11434',
  modelMode: 'auto', // auto: elige según la RAM del equipo · manual: usa siempre los de abajo
  fastModel: 'qwen2.5:3b',
  deepModel: 'qwen2.5:7b',
  lowRamDeepModel: 'qwen2.5:3b',
  lowRamThresholdGB: 12,
  numCtx: 8192,
  userProfile: '',
  semestreActual: '',
  notaAprobacion: 4.0,
  notaMin: 1.0,
  notaMax: 7.0,
  metaSesionesSemana: 4,
  // Metas diarias: cada quien pone las suyas (los números son solo un ejemplo hasta que el usuario los ajuste)
  goals: [
    { key: 'kcal', label: 'Calorías', icon: 'utensils', unit: 'kcal', goal: 2000, step: 100, color: '#22c55e', group: 'Comida', tipo: 'meta', estilo: 'anillo' },
    { key: 'proteina', label: 'Proteína', icon: 'beef', unit: 'g', goal: 120, step: 10, color: '#f472b6', group: 'Comida', tipo: 'meta', estilo: 'barra' },
    { key: 'carbos', label: 'Carbohidratos', icon: 'wheat', unit: 'g', goal: 250, step: 10, color: '#fbbf24', group: 'Comida', tipo: 'meta', estilo: 'barra' },
    { key: 'grasas', label: 'Grasas', icon: 'droplets', unit: 'g', goal: 70, step: 5, color: '#a78bfa', group: 'Comida', tipo: 'meta', estilo: 'barra' },
    { key: 'agua', label: 'Agua', icon: 'droplet', unit: 'L', goal: 2.5, step: 0.25, color: '#38bdf8', group: 'Comida', tipo: 'meta', estilo: 'anillo' },
    { key: 'ejercicio', label: 'Ejercicio', icon: 'flame', unit: 'min', goal: 45, step: 5, color: '#f97316', group: 'Actividad', tipo: 'meta', estilo: 'anillo' },
    { key: 'pasos', label: 'Pasos', icon: 'footprints', unit: 'pasos', goal: 7000, step: 500, color: '#14b8a6', group: 'Actividad', tipo: 'meta', estilo: 'anillo' },
    { key: 'sueno', label: 'Sueño', icon: 'moon', unit: 'h', goal: 8, step: 0.5, color: '#6366f1', group: 'Cuerpo', tipo: 'meta', estilo: 'anillo' },
    { key: 'peso', label: 'Peso', icon: 'scale', unit: 'kg', goal: null, step: 0.1, color: '#ab47bc', group: 'Cuerpo', tipo: 'medida', estilo: 'anillo' },
    { key: 'lectura', label: 'Lectura', icon: 'book-open', unit: 'min', goal: 20, step: 5, color: '#eab308', group: 'Mente', tipo: 'meta', estilo: 'anillo' },
    { key: 'horasEstudio', label: 'Estudio', icon: 'graduation-cap', unit: 'h', goal: 2, step: 0.5, color: '#8b5cf6', group: 'Mente', tipo: 'meta', estilo: 'anillo' },
  ],
  goalsReviewed: false,
  sectionBanners: {},
  restSeconds: 90,
  embedModel: 'bge-m3',
  hubCards: '',
  newCardsPerDay: 15,
  autoIndex: true,
  autoSubpages: true,
  mediaStates: ['Pendiente', 'En curso', 'Terminado', 'Pausado', 'Abandonado'],
  mediaCategories: [
    { key: 'juego', label: 'Juegos', emoji: '🎮', color: '#a78bfa', provider: 'steam', unidad: 'horas' },
    { key: 'libro', label: 'Libros', emoji: '📚', color: '#f59e0b', provider: 'openlibrary', unidad: 'páginas' },
    { key: 'anime', label: 'Anime', emoji: '🌸', color: '#fb7185', provider: 'anime', unidad: 'episodios' },
    { key: 'manga', label: 'Manga', emoji: '📖', color: '#38bdf8', provider: 'manga', unidad: 'capítulos' },
    { key: 'pelicula', label: 'Películas', emoji: '🎬', color: '#34d399', provider: 'wikipedia', unidad: 'min' },
    { key: 'serie', label: 'Series', emoji: '📺', color: '#f472b6', provider: 'tvmaze', unidad: 'episodios' },
  ],
  trainingTypes: ['Empuje', 'Tirón', 'Pierna', 'Torso', 'Full body', 'Calistenia', 'Skills', 'Cardio', 'Deporte', 'Movilidad', 'Descanso'],
  wheelAreas: [
    { key: 'salud', emoji: '😴', label: 'Salud y descanso', color: '#26a69a', desc: 'sueño, alimentación, energía, enfermedades, chequeos' },
    { key: 'entrenamiento', emoji: '🏋️', label: 'Entrenamiento', color: '#ef5350', desc: 'gym, calistenia, deportes, constancia y progreso' },
    { key: 'trabajo', emoji: '💼', label: 'Trabajo y carrera', color: '#42a5f5', desc: 'trabajo, proyectos, práctica, desarrollo profesional' },
    { key: 'estudios', emoji: '🎓', label: 'Estudios y aprendizaje', color: '#7e57c2', desc: 'universidad, ramos, evaluaciones, cursos, lectura técnica' },
    { key: 'relaciones', emoji: '❤️', label: 'Familia y pareja', color: '#ec407a', desc: 'familia, pareja, relaciones cercanas' },
    { key: 'social', emoji: '👥', label: 'Amigos y vida social', color: '#ab47bc', desc: 'amigos, salidas, comunidad' },
    { key: 'finanzas', emoji: '💰', label: 'Finanzas', color: '#66bb6a', desc: 'gastos, ahorro, ingresos, compras' },
    { key: 'mente', emoji: '🧘', label: 'Mente y propósito', color: '#ffa726', desc: 'ánimo, estrés, reflexión, metas personales, crecimiento' },
    { key: 'ocio', emoji: '🎮', label: 'Ocio y diversión', color: '#ffca28', desc: 'hobbies, juegos, series, descanso activo' },
  ],
  habits: [
    { key: 'aprender', label: '🧠 Aprender algo nuevo' },
    { key: 'planificar', label: '🗒️ Planificar el día' },
    { key: 'pantallas', label: '📵 Sin pantallas antes de dormir' },
  ],
  folders: {
    daily: '01 Diario',
    weekly: '02 Semanal',
    monthly: '03 Mensual',
    quarterly: '04 Trimestral',
    yearly: '05 Anual',
    templates: '06 Plantillas/Raiz',
    academic: '08 Académico',
    training: '09 Entrenamiento',
    agenda: '10 Agenda',
    library: '11 Biblioteca',
    banners: '06 Plantillas/Banners',
    dashboard: '00 Dashboard',
    covers: '06 Plantillas/Portadas',
    knowledge: '12 Conocimiento',
    inbox: '00 Bandeja',
  },
};

const LEVELS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
const CHILD = { weekly: 'daily', monthly: 'weekly', quarterly: 'monthly', yearly: 'quarterly' };
const SUMMARY_FIELD = { weekly: 'resumen', monthly: 'resumen', quarterly: 'resumen', yearly: 'resumen' };
const LEVEL_NAME = { daily: 'día', weekly: 'semana', monthly: 'mes', quarterly: 'trimestre', yearly: 'año' };
const LEVEL_THIS = { daily: 'este día', weekly: 'esta semana', monthly: 'este mes', quarterly: 'este trimestre', yearly: 'este año' };
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SKIP_SECTIONS = /fotos|pregúntale|check-in|(^|\s)hoy$|otros años|revisión de la semana/i;

// ───────────────────────────── Utilidades puras ─────────────────────────────

function num(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function avg(arr) {
  const v = Array.from(arr).filter((x) => x !== null && x !== undefined && Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}
function sum(arr) {
  return Array.from(arr).filter((x) => Number.isFinite(x)).reduce((s, x) => s + x, 0);
}
function r1(x) {
  return x === null || x === undefined ? null : Math.round(x * 10) / 10;
}
function fmtNum(x, d = 1) {
  if (x === null || x === undefined) return '—';
  return Number(x).toLocaleString('es-CL', { maximumFractionDigits: d });
}
function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}
function cap(s) {
  s = String(s || '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function toArr(v) {
  if (v === null || v === undefined || v === '') return [];
  if (typeof v.array === 'function') return Array.from(v.array());
  if (Array.isArray(v)) return Array.from(v);
  return [v];
}
function hasTipo(page, tipo) {
  return toArr(page.tipo).some((t) => String(t).toLowerCase() === tipo);
}
function deEmoji(t) {
  return String(t).replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim();
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function safeName(s) {
  return String(s).replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim();
}
function isoDate(m) {
  return m.format('YYYY-MM-DD');
}
function fechaLarga(m) {
  m = moment(m);
  return `${cap(DIAS_LARGO[m.isoWeekday() - 1])} ${m.date()} de ${MESES[m.month()]}, ${m.year()}`;
}
function fechaCorta(m) {
  m = moment(m);
  return `${DIAS[m.isoWeekday() - 1]} ${m.date()}/${m.month() + 1}`;
}
/** Convierte cualquier valor de fecha (string, Luxon de Dataview, Date, moment) a moment, o null. */
function toMoment(v) {
  if (!v) return null;
  if (moment.isMoment(v)) return v.clone();
  if (typeof v === 'object' && typeof v.toISODate === 'function') return moment(v.toISODate(), 'YYYY-MM-DD');
  if (v instanceof Date) return moment(v);
  const s = String(v).trim();
  const m = moment(s.slice(0, 10), 'YYYY-MM-DD', true);
  return m.isValid() ? m : null;
}
function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function ratingColor(r, alpha = 0.35) {
  if (r === null || r === undefined) return 'transparent';
  const hue = Math.round(((clamp(r, 1, 10) - 1) / 9) * 120); // rojo → verde
  return `hsla(${hue}, 70%, 50%, ${alpha})`;
}

/** Limpia la respuesta del modelo: quita <think>, cercos de código y espacios. */
function cleanResponse(text) {
  let t = String(text || '');
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
  t = t.trim();
  const fence = t.match(/^```(?:markdown|md|json)?\s*\n([\s\S]*?)\n```$/i);
  if (fence) t = fence[1];
  return t.trim();
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch (e2) {
        /* sigue */
      }
    }
  }
  throw new Error('El modelo no devolvió un JSON válido. Intenta de nuevo.');
}

/**
 * Lee las líneas de ejercicios de la sección "Entrenamiento" de una nota.
 * Formatos aceptados (grupos separados por ';'):
 *   - Press banca: 4x8 @ 60kg
 *   - Sentadilla: 1x5 @ 100kg; 3x8 @ 80kg
 *   - Dominadas: 4x8            (peso corporal)
 *   - Dominadas lastradas: 4x6 @ +10kg
 *   - Plancha: 3x45s            (isométrico, también "min")
 *   - Trote: 5km 28min
 */
function parseTraining(text) {
  const lines = String(text || '').split(/\r?\n/);
  let inSection = false;
  let inCode = false;
  const out = [];
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      inSection = /entren/i.test(h[1]);
      continue;
    }
    if (!inSection) continue;
    const m = line.match(/^\s*[-*+]\s+(?:\[[ xX]\]\s+)?([^:`#\[%][^:`]*?)\s*:\s*(.+)$/);
    if (!m) continue;
    const ex = parseExercise(m[1], m[2]);
    if (ex) out.push(ex);
  }
  return out;
}
function parseExercise(name, spec) {
  const ex = {
    name: name.trim(),
    key: norm(name),
    raw: spec.trim(),
    sets: 0,
    totalReps: 0,
    maxReps: 0,
    topKg: null,
    maxSec: 0,
    volume: 0,
    e1rm: 0,
    km: null,
    minutes: null,
  };
  let matched = false;
  for (const groupRaw of spec.split(/;|\s\+\s/)) {
    const group = groupRaw.replace(/(\d),(\d)/g, '$1.$2');
    const sm = group.match(/(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(s|seg|segs|min)?\b/i);
    const wm = group.match(/([+\-]?\d+(?:\.\d+)?)\s*kg/i);
    const kg = wm ? parseFloat(wm[1]) : null;
    if (wm && wm[1].startsWith('+')) ex.lastre = true;
    if (sm) {
      matched = true;
      const sets = parseInt(sm[1], 10);
      const val = parseFloat(sm[2]);
      const unit = (sm[3] || '').toLowerCase();
      ex.sets += sets;
      if (unit) {
        const secs = unit === 'min' ? val * 60 : val;
        ex.maxSec = Math.max(ex.maxSec, secs);
      } else {
        ex.totalReps += sets * val;
        ex.maxReps = Math.max(ex.maxReps, val);
        if (kg !== null) {
          ex.topKg = ex.topKg === null ? kg : Math.max(ex.topKg, kg);
          if (kg > 0) {
            ex.volume += sets * val * kg;
            if (val <= 15) ex.e1rm = Math.max(ex.e1rm, kg * (1 + val / 30));
          }
        }
      }
    }
    const km = group.match(/(\d+(?:\.\d+)?)\s*km\b/i);
    if (km) {
      matched = true;
      ex.km = (ex.km || 0) + parseFloat(km[1]);
    }
    const mins = !sm && group.match(/(\d+(?:\.\d+)?)\s*min\b/i);
    if (mins) {
      matched = true;
      ex.minutes = (ex.minutes || 0) + parseFloat(mins[1]);
    }
  }
  return matched ? ex : null;
}
/** Métrica principal para comparar marcas de un ejercicio. */
function bestMetric(ex) {
  if (ex.e1rm > 0 && ex.lastre) return { value: ex.e1rm, label: `+${fmtNum(ex.topKg)} kg × ${fmtNum(ex.maxReps, 0)}`, kind: 'e1rm' };
  if (ex.e1rm > 0) return { value: ex.e1rm, label: `${fmtNum(ex.topKg)} kg (1RM≈${fmtNum(ex.e1rm, 0)})`, kind: 'e1rm' };
  if (ex.maxReps > 0) return { value: ex.maxReps, label: `${fmtNum(ex.maxReps, 0)} reps`, kind: 'reps' };
  if (ex.maxSec > 0) return { value: ex.maxSec, label: `${fmtNum(ex.maxSec, 0)} s`, kind: 'sec' };
  if (ex.km) return { value: ex.km, label: `${fmtNum(ex.km)} km`, kind: 'km' };
  return null;
}

/** Cálculo de notas del sistema chileno (escala 1–7 por defecto). */
function gradeInfo(evals, pass, min, max) {
  const all = evals.filter((e) => e.pond !== null && e.pond > 0);
  const graded = all.filter((e) => e.nota !== null);
  const sumW = sum(all.map((e) => e.pond));
  const doneW = sum(graded.map((e) => e.pond));
  const acc = sum(graded.map((e) => e.nota * e.pond));
  const pendW = sumW - doneW;
  const parcial = doneW > 0 ? acc / doneW : null;
  const final = sumW > 0 && pendW <= 0 && graded.length ? acc / sumW : null;
  let necesaria = null;
  let estado = 'sin datos';
  if (sumW > 0 && pendW > 0) {
    necesaria = (pass * sumW - acc) / pendW;
    if (necesaria <= min) estado = 'asegurado';
    else if (necesaria > max) estado = 'imposible';
    else if (necesaria > 5.5) estado = 'dificil';
    else if (necesaria > 4.5) estado = 'atento';
    else estado = 'bien';
  } else if (final !== null) {
    estado = final >= pass ? 'aprobado' : 'reprobado';
  }
  return { sumW, doneW, pendW, parcial, final, necesaria, estado, avance: sumW ? doneW / sumW : 0 };
}
const ESTADO_LABEL = {
  asegurado: '✅ Aprobación asegurada',
  bien: '🟢 Vas bien',
  atento: '🟡 Atento',
  dificil: '🟠 Cuesta arriba',
  imposible: '🔴 Matemáticamente difícil',
  aprobado: '✅ Aprobado',
  reprobado: '🔴 Reprobado',
  'sin datos': '⚪ Sin evaluaciones',
};

/** "Lun 08:15-09:45 | Sala A-12" → {dow:1, start:'08:15', end:'09:45', room:'Sala A-12'} */
function parseSchedule(s) {
  const m = String(s).match(/^\s*(lu|ma|mi|ju|vi|s[aá]|do)[a-záéíóú]*\.?\s+(\d{1,2}(?:[:.]\d{2})?)\s*[-–]\s*(\d{1,2}(?:[:.]\d{2})?)(?:\s*[|·,]\s*(.*))?$/i);
  if (!m) return null;
  const map = { lu: 1, ma: 2, mi: 3, ju: 4, vi: 5, sa: 6, 'sá': 6, do: 7 };
  const pad = (t) => (/[:.]/.test(t) ? t.replace('.', ':') : `${t}:00`).padStart(5, '0');
  return { dow: map[m[1].toLowerCase()], start: pad(m[2]), end: pad(m[3]), room: (m[4] || '').trim() };
}

// ───────────────────────────── Modales ─────────────────────────────

class FormModal extends Modal {
  constructor(app, title, fields, onSubmit) {
    super(app);
    this.title = title;
    this.fields = fields;
    this.onSubmit = onSubmit;
    this.values = {};
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('raiz-form');
    contentEl.createEl('h3', { text: this.title });
    for (const f of this.fields) {
      this.values[f.key] = f.value ?? '';
      const s = new Setting(contentEl).setName(f.label);
      if (f.desc) s.setDesc(f.desc);
      if (f.type === 'select') {
        s.addDropdown((d) => {
          for (const o of f.options) d.addOption(o, o);
          d.setValue(this.values[f.key] || f.options[0]);
          this.values[f.key] = d.getValue();
          d.onChange((v) => (this.values[f.key] = v));
        });
      } else if (f.type === 'textarea') {
        s.addTextArea((t) => {
          t.setPlaceholder(f.placeholder || '').setValue(String(this.values[f.key]));
          t.inputEl.rows = 3;
          t.onChange((v) => (this.values[f.key] = v));
        });
      } else {
        s.addText((t) => {
          t.setPlaceholder(f.placeholder || '').setValue(String(this.values[f.key]));
          if (f.type === 'date') t.inputEl.type = 'date';
          if (f.type === 'time') t.inputEl.type = 'time';
          t.onChange((v) => (this.values[f.key] = v));
          t.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.submit();
          });
        });
      }
    }
    new Setting(contentEl).addButton((b) => b.setButtonText('Crear').setCta().onClick(() => this.submit()));
  }
  submit() {
    const missing = this.fields.find((f) => f.required && !String(this.values[f.key] || '').trim());
    if (missing) {
      new Notice(`Falta: ${missing.label}`);
      return;
    }
    this.close();
    this.onSubmit(this.values);
  }
  onClose() {
    this.contentEl.empty();
  }
}

class FilePicker extends FuzzySuggestModal {
  constructor(app, files, placeholder, onChoose) {
    super(app);
    this.files = files;
    this.onChoose = onChoose;
    this.setPlaceholder(placeholder);
  }
  getItems() {
    return this.files;
  }
  getItemText(f) {
    return f.basename;
  }
  onChooseItem(f) {
    this.onChoose(f);
  }
}

// ───────────────────────────── Plugin ─────────────────────────────


/** Ventana para agregar juegos, libros, anime, manga… buscando portada y datos en servicios públicos. */
class MediaModal extends Modal {
  constructor(plugin, catKey) {
    super(plugin.app);
    this.plugin = plugin;
    this.catKey = catKey || plugin.settings.mediaCategories[0]?.key;
  }
  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass('raiz-media-modal');
    contentEl.createEl('h3', { text: '＋ Agregar a la biblioteca' });
    const row = contentEl.createDiv({ cls: 'raiz-lib-bar' });
    const sel = row.createEl('select', { cls: 'raiz-select dropdown' });
    for (const c of this.plugin.settings.mediaCategories) sel.createEl('option', { value: c.key, text: `${c.emoji} ${c.label}` });
    sel.value = this.catKey;
    sel.addEventListener('change', () => {
      this.catKey = sel.value;
      if (this.input.value.trim()) this.search();
    });
    this.input = row.createEl('input', { cls: 'raiz-input', attr: { type: 'search', placeholder: 'Título…' } });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.search();
    });
    row.createEl('button', { cls: 'mod-cta', text: 'Buscar' }).addEventListener('click', () => this.search());
    this.status = contentEl.createDiv({ cls: 'raiz-muted' });
    this.status.setText('Busca un título: traigo portada, autor/estudio, año y géneros automáticamente.');
    this.results = contentEl.createDiv({ cls: 'raiz-grid raiz-grid-sm' });
    const foot = contentEl.createDiv({ cls: 'raiz-lib-bar' });
    this.openAfter = false;
    const chk = foot.createEl('label', { cls: 'raiz-muted' });
    const cb = chk.createEl('input', { attr: { type: 'checkbox' } });
    chk.appendText(' Abrir la nota al agregar');
    cb.addEventListener('change', () => (this.openAfter = cb.checked));
    foot.createEl('button', { cls: 'raiz-chip', text: '✍️ Agregar sin buscar' }).addEventListener('click', () => {
      const t = this.input.value.trim();
      if (!t) return new Notice('Escribe el título primero.');
      this.add({ titulo: t });
    });
    setTimeout(() => this.input.focus(), 50);
    if (this.prefill) {
      this.input.value = this.prefill;
      this.search();
    }
  }
  async search() {
    const q = this.input.value.trim();
    if (!q) return;
    const cat = this.plugin.mediaCat(this.catKey);
    this.status.setText(`Buscando "${q}" en ${cat.label}…`);
    this.results.empty();
    try {
      const list = await this.plugin.mediaSearch(cat, q);
      this.status.setText(list.length ? `${list.length} resultados · haz clic para agregar` : 'Sin resultados. Puedes agregarlo sin buscar.');
      for (const r of list.slice(0, 18)) {
        const card = this.results.createDiv({ cls: 'raiz-card' });
        card.style.setProperty('--c', cat.color);
        const cover = card.createDiv({ cls: 'raiz-card-cover' });
        if (r.portada) {
          const img = cover.createEl('img', { attr: { src: r.portada, loading: 'lazy' } });
          img.addEventListener('error', () => {
            if (r.portadaAlt && img.src !== r.portadaAlt) {
              img.src = r.portadaAlt;
              r.portada = r.portadaAlt;
            } else {
              img.remove();
              cover.addClass('is-placeholder');
              cover.createDiv({ cls: 'raiz-ph', text: cat.emoji });
            }
          });
        } else {
          cover.addClass('is-placeholder');
          cover.createDiv({ cls: 'raiz-ph', text: cat.emoji });
        }
        const body = card.createDiv({ cls: 'raiz-card-body' });
        body.createDiv({ cls: 'raiz-card-title', text: r.titulo });
        const sub = [r.sub || r.creador, r.anio && !String(r.sub || '').includes(String(r.anio)) ? r.anio : ''].filter(Boolean).join(' · ');
        if (sub) body.createDiv({ cls: 'raiz-card-sub', text: sub });
        card.addEventListener('click', () => this.add(r));
      }
    } catch (e) {
      this.status.setText(`No pude buscar (${e.message}). Revisa tu conexión o agrégalo sin buscar.`);
    }
  }
  async add(data) {
    this.status.setText(`Agregando "${data.titulo}"…`);
    const created = await this.plugin.run(() => this.plugin.createMedia(this.catKey, data, { open: this.openAfter }));
    if (created) this.onAdded?.(created);
    if (this.openAfter) this.close();
    else {
      this.status.setText(`✅ "${data.titulo}" agregado. Puedes seguir agregando.`);
      this.input.select();
    }
  }
  onClose() {
    this.contentEl.empty();
  }
}


/** Selector simple de textos. */
class StringPicker extends FuzzySuggestModal {
  constructor(app, items, placeholder, onChoose) {
    super(app);
    this.items = items;
    this.onChoose = onChoose;
    this.setPlaceholder(placeholder);
  }
  getItems() {
    return this.items;
  }
  getItemText(i) {
    return i;
  }
  onChooseItem(i) {
    this.onChoose(i);
  }
}

const CONN_VIEW = 'raiz-conexiones';

/** Panel lateral "Conexiones": menciones sin enlazar + notas relacionadas por IA local. */
class ConnectionsView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return CONN_VIEW;
  }
  getDisplayText() {
    return 'Conexiones';
  }
  getIcon() {
    return 'waypoints';
  }
  async onOpen() {
    this.registerEvent(this.app.workspace.on('file-open', () => this.schedule()));
    this.registerEvent(
      this.app.metadataCache.on('changed', (f) => {
        if (f === this.file) this.schedule(1500);
      })
    );
    this.schedule(0);
  }
  async onClose() {
    clearTimeout(this.timer);
  }
  schedule(ms = 350) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.render(), ms);
  }
  async render() {
    const p = this.plugin;
    const file = this.app.workspace.getActiveFile();
    const el = this.contentEl;
    el.empty();
    el.addClass('raiz-conn');
    this.file = file;
    if (!file || file.extension !== 'md') {
      el.createDiv({ cls: 'raiz-muted', text: 'Abre una nota para ver sus conexiones.' });
      return;
    }
    el.createDiv({ cls: 'raiz-conn-title', text: file.basename });

    // 1) Menciones sin enlazar en esta nota
    const mentions = await p.findMentionsIn(file);
    const s1 = el.createDiv({ cls: 'raiz-conn-sec' });
    const h1 = s1.createDiv({ cls: 'raiz-conn-h' });
    h1.createSpan({ text: `🔗 Menciona sin enlazar · ${mentions.length}` });
    if (mentions.length > 1) h1.createEl('button', { cls: 'raiz-chip', text: 'Enlazar todas' }).addEventListener('click', () => p.run(() => p.linkAllMentions(file)));
    if (!mentions.length) s1.createDiv({ cls: 'raiz-muted', text: 'Nada pendiente en esta nota.' });
    for (const m of mentions.slice(0, 25)) {
      const row = s1.createDiv({ cls: 'raiz-conn-item' });
      const top = row.createDiv({ cls: 'raiz-conn-row' });
      p.link(top, m.target);
      top.createEl('button', { cls: 'raiz-chip', text: 'Enlazar' }).addEventListener('click', () => p.run(() => p.linkMention(file, m)));
      p.renderContext(row, m);
    }

    // 2) Otras notas que nombran a esta sin enlazarla
    const back = await p.mentionsOf(file);
    const s2 = el.createDiv({ cls: 'raiz-conn-sec' });
    s2.createDiv({ cls: 'raiz-conn-h', text: `📣 Te nombran sin enlace · ${back.length}` });
    if (!back.length) s2.createDiv({ cls: 'raiz-muted', text: 'Ninguna.' });
    for (const m of back.slice(0, 15)) {
      const row = s2.createDiv({ cls: 'raiz-conn-item' });
      const top = row.createDiv({ cls: 'raiz-conn-row' });
      p.link(top, m.source);
      top.createEl('button', { cls: 'raiz-chip', text: 'Enlazar allá' }).addEventListener('click', () => p.run(() => p.linkMention(m.source, m)));
      p.renderContext(row, m);
    }

    // 3) Relacionadas por significado (IA local)
    const s3 = el.createDiv({ cls: 'raiz-conn-sec' });
    const h3 = s3.createDiv({ cls: 'raiz-conn-h' });
    h3.createSpan({ text: '✨ Relacionadas (IA local)' });
    h3.createEl('button', { cls: 'raiz-chip', text: '🔎 Preguntar al vault' }).addEventListener('click', () => new AskVaultModal(p).open());
    const box = s3.createDiv({ cls: 'raiz-muted', text: 'Buscando…' });
    try {
      const rel = await p.relatedTo(file, 10);
      box.remove();
      if (!rel.length) s3.createDiv({ cls: 'raiz-muted', text: 'Aún no hay notas indexadas. Usa "Raíz: Indexar notas para la IA".' });
      const linked = p.linkedPaths(file);
      for (const r of rel) {
        const row = s3.createDiv({ cls: 'raiz-conn-item' });
        const top = row.createDiv({ cls: 'raiz-conn-row' });
        p.link(top, r.file);
        top.createSpan({ cls: 'raiz-conn-score', text: `${Math.round(r.score * 100)}%` });
        if (linked.has(r.file.path)) top.createSpan({ cls: 'raiz-pill e-terminado', text: 'enlazada' });
        else top.createEl('button', { cls: 'raiz-chip', text: '＋ Enlazar' }).addEventListener('click', () => p.run(() => p.appendLink(file, r.file)));
        const meta = row.createDiv({ cls: 'raiz-conn-meta' });
        meta.setText(r.file.parent?.path || '');
        const bar = row.createDiv({ cls: 'raiz-bar raiz-bar-wide' });
        bar.createDiv({ cls: 'raiz-bar-fill' }).style.width = `${Math.round(clamp((r.score - 0.4) / 0.5, 0.05, 1) * 100)}%`;
      }
      const st = await p.indexStatus();
      if (st.stale) {
        const b = s3.createEl('button', { cls: 'raiz-chip', text: `🔄 Indexar ${st.stale} nota(s) nuevas o cambiadas` });
        b.addEventListener('click', () => p.run(() => p.indexVault()));
      }
    } catch (e) {
      box.setText(`IA no disponible: ${e.message}`);
    }
  }
}

/** Pregúntale a todo tu vault (búsqueda por significado + respuesta con fuentes). */
class AskVaultModal extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass('raiz-media-modal');
    contentEl.createEl('h3', { text: '🔎 Pregúntale a tu vault' });
    const input = contentEl.createEl('textarea', { cls: 'raiz-input raiz-ask', attr: { rows: '3', placeholder: 'Ej: ¿Qué aprendí sobre normalización? · ¿Qué anime me gustó más este año? · ¿Cuándo me sentí más estresado y por qué?' } });
    const row = contentEl.createDiv({ cls: 'raiz-lib-bar' });
    const btn = row.createEl('button', { cls: 'mod-cta', text: 'Preguntar' });
    const out = contentEl.createDiv({ cls: 'raiz-ask-out' });
    const go = async () => {
      const q = input.value.trim();
      if (!q) return;
      btn.disabled = true;
      out.empty();
      out.createDiv({ cls: 'raiz-muted', text: 'Buscando en tus notas…' });
      try {
        const { answer, sources } = await this.plugin.askVault(q);
        out.empty();
        const md = out.createDiv({ cls: 'raiz-ask-answer' });
        await MarkdownRenderer.render(this.app, answer, md, '', this.plugin);
        const src = out.createDiv({ cls: 'raiz-ask-src' });
        src.createDiv({ cls: 'raiz-muted', text: 'Fuentes:' });
        sources.forEach((s, i) => {
          const a = src.createEl('a', { text: `[${i + 1}] ${s.file.basename}`, cls: 'raiz-chip' });
          a.addEventListener('click', () => {
            this.app.workspace.openLinkText(s.file.path, '', false);
            this.close();
          });
        });
      } catch (e) {
        out.empty();
        out.createDiv({ cls: 'raiz-error', text: `⚠️ ${e.message}` });
      } finally {
        btn.disabled = false;
      }
    };
    btn.addEventListener('click', go);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go();
    });
    setTimeout(() => input.focus(), 50);
  }
  onClose() {
    this.contentEl.empty();
  }
}


/** Selector de íconos (Lucide) con búsqueda y vista previa, al estilo Notion. */
class IconModal extends Modal {
  constructor(plugin, onChoose) {
    super(plugin.app);
    this.plugin = plugin;
    this.onChoose = onChoose;
  }
  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass('raiz-icon-modal');
    contentEl.createEl('h3', { text: 'Ícono de la página' });
    const input = contentEl.createEl('input', { cls: 'raiz-input', attr: { type: 'search', placeholder: 'Buscar en inglés: book, code, brain, flask, cpu, sigma… o pega un emoji' } });
    const grid = contentEl.createDiv({ cls: 'raiz-icon-grid' });
    const all = getIconIds().map((id) => id.replace(/^lucide-/, '')).sort();
    const featured = ['book-open', 'notebook-pen', 'graduation-cap', 'code-2', 'cpu', 'brain', 'sigma', 'calculator', 'flask-conical', 'atom', 'network', 'database', 'server', 'globe', 'languages', 'music', 'palette', 'dumbbell', 'heart-pulse', 'briefcase', 'lightbulb', 'puzzle', 'rocket', 'compass', 'layers', 'pen-tool', 'scroll-text', 'library', 'microscope', 'binary', 'terminal', 'git-branch', 'bot', 'chart-line', 'map', 'star'];
    const draw = (q) => {
      grid.empty();
      const list = q ? all.filter((x) => x.includes(q.toLowerCase())).slice(0, 160) : featured.filter((x) => all.includes(x));
      for (const id of list) {
        const b = grid.createEl('button', { cls: 'raiz-icon-cell', attr: { 'aria-label': id, title: id } });
        setIcon(b, id);
        b.addEventListener('click', () => {
          this.close();
          this.onChoose(id);
        });
      }
      if (q && /\p{Extended_Pictographic}/u.test(q)) {
        const b = grid.createEl('button', { cls: 'raiz-icon-cell', text: q.trim() });
        b.addEventListener('click', () => {
          this.close();
          this.onChoose(q.trim());
        });
      }
      if (!grid.childElementCount) grid.createDiv({ cls: 'raiz-muted', text: 'Sin resultados.' });
    };
    input.addEventListener('input', () => draw(input.value.trim()));
    const row = contentEl.createDiv({ cls: 'raiz-lib-bar' });
    row.createEl('button', { cls: 'raiz-chip', text: 'Quitar ícono' }).addEventListener('click', () => {
      this.close();
      this.onChoose('');
    });
    draw('');
    setTimeout(() => input.focus(), 50);
  }
  onClose() {
    this.contentEl.empty();
  }
}

/** Selector de portada: imágenes de tu carpeta de portadas, una URL o una al azar. */
class CoverModal extends Modal {
  constructor(plugin, file) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
  }
  onOpen() {
    const p = this.plugin;
    const { contentEl } = this;
    this.modalEl.addClass('raiz-media-modal');
    contentEl.createEl('h3', { text: 'Portada' });
    const folder = p.settings.folders.covers;
    const imgs = this.app.vault.getFiles().filter((f) => f.path.startsWith(folder + '/') && /^(png|jpe?g|gif|webp|avif|svg)$/i.test(f.extension));
    const set = async (value) => {
      await this.app.fileManager.processFrontMatter(this.file, (fm) => {
        if (value) {
          fm.banner = value;
          fm['banner-height'] = fm['banner-height'] || 260;
          fm['content-start'] = fm['content-start'] || 190;
          fm['banner-fade'] = fm['banner-fade'] ?? -70;
          fm['banner-radius'] = fm['banner-radius'] ?? 16;
        } else delete fm.banner;
      });
      this.close();
    };
    const bar = contentEl.createDiv({ cls: 'raiz-lib-bar' });
    const url = bar.createEl('input', { cls: 'raiz-input', attr: { type: 'url', placeholder: 'Pega la URL de una imagen…' } });
    bar.createEl('button', { cls: 'mod-cta', text: 'Usar URL' }).addEventListener('click', () =>
      p.run(async () => {
        const u = url.value.trim();
        if (!u) return;
        const saved = await p.downloadCover(u, `portada ${this.file.basename}`, null, folder);
        await set(saved ? `[[${saved}]]` : u);
      })
    );
    if (imgs.length) {
      bar.createEl('button', { cls: 'raiz-chip', text: 'Al azar' }).addEventListener('click', () => set(`[[${imgs[Math.floor(Math.random() * imgs.length)].path}]]`));
    }
    bar.createEl('button', { cls: 'raiz-chip', text: 'Quitar portada' }).addEventListener('click', () => set(''));
    contentEl.createDiv({ cls: 'raiz-muted', text: imgs.length ? `${imgs.length} imágenes en "${folder}". Agrega las tuyas a esa carpeta.` : `Agrega tus imágenes favoritas a la carpeta "${folder}" para elegirlas aquí.` });
    const grid = contentEl.createDiv({ cls: 'raiz-cover-grid' });
    for (const f of imgs) {
      const cell = grid.createDiv({ cls: 'raiz-cover-cell' });
      cell.createEl('img', { attr: { src: this.app.vault.getResourcePath(f), loading: 'lazy', alt: f.basename } });
      cell.addEventListener('click', () => set(`[[${f.path}]]`));
    }
  }
  onClose() {
    this.contentEl.empty();
  }
}

/** Editor de "Mis metas": cada quien define qué mide, cuánto y en qué unidad. */
class GoalsModal extends Modal {
  constructor(plugin, onSave) {
    super(plugin.app);
    this.plugin = plugin;
    this.onSave = onSave;
    this.goals = JSON.parse(JSON.stringify(plugin.settings.goals || []));
  }
  onOpen() {
    this.modalEl.addClass('raiz-goals-modal');
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Mis metas' });
    contentEl.createDiv({
      cls: 'raiz-muted',
      text: 'Pon tus propios números: no hay fórmulas ni valores "correctos". Una meta suma hacia un objetivo (agua, pasos, lectura…); una medida solo se registra (peso, por ejemplo) y puede tener un objetivo opcional.',
    });
    const list = contentEl.createDiv({ cls: 'raiz-goal-edit-list' });
    const head = list.createDiv({ cls: 'raiz-goal-edit-row is-head' });
    for (const t of ['', '', 'Nombre', 'Objetivo', 'Unidad', 'Paso', 'Grupo', 'Tipo', 'Estilo', '', '']) head.createSpan({ text: t });
    this.goals.forEach((g, i) => {
      const row = list.createDiv({ cls: 'raiz-goal-edit-row' + (g.on === false ? ' is-off' : '') });
      const on = row.createEl('input', { attr: { type: 'checkbox', 'aria-label': 'Activa' } });
      on.checked = g.on !== false;
      on.addEventListener('change', () => ((g.on = on.checked), row.toggleClass('is-off', !on.checked)));
      const ic = row.createEl('button', { cls: 'raiz-goal-edit-icon', attr: { 'aria-label': 'Ícono y color' } });
      ic.style.color = g.color || 'var(--interactive-accent)';
      setIcon(ic, g.icon || 'target');
      ic.addEventListener('click', () => new IconModal(this.plugin, (v) => ((g.icon = v), this.render())).open());
      const inp = (key, type, ph, w) => {
        const el = row.createEl('input', { cls: 'raiz-input', attr: { type, placeholder: ph } });
        el.value = g[key] ?? '';
        if (w) el.style.width = w;
        el.addEventListener('input', () => (g[key] = type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value));
        return el;
      };
      inp('label', 'text', 'Ej: Agua');
      inp('goal', 'number', '—');
      inp('unit', 'text', 'L, g, min…');
      inp('step', 'number', '1');
      inp('group', 'text', 'Grupo');
      const sel = (key, opts) => {
        const s = row.createEl('select', { cls: 'dropdown' });
        for (const [v, t] of opts) s.createEl('option', { value: v, text: t });
        s.value = g[key] || opts[0][0];
        s.addEventListener('change', () => (g[key] = s.value));
      };
      sel('tipo', [['meta', 'Meta'], ['medida', 'Medida']]);
      sel('estilo', [['anillo', 'Anillo'], ['barra', 'Barra']]);
      const color = row.createEl('input', { attr: { type: 'color', 'aria-label': 'Color' } });
      color.value = /^#[0-9a-f]{6}$/i.test(g.color || '') ? g.color : '#22c55e';
      color.addEventListener('input', () => ((g.color = color.value), (ic.style.color = color.value)));
      const tools = row.createDiv({ cls: 'raiz-goal-edit-tools' });
      const tool = (icon, label, fn) => {
        const b = tools.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } });
        setIcon(b, icon);
        b.addEventListener('click', fn);
      };
      tool('arrow-up', 'Subir', () => i > 0 && (([this.goals[i - 1], this.goals[i]] = [this.goals[i], this.goals[i - 1]]), this.render()));
      tool('trash-2', 'Quitar', () => (this.goals.splice(i, 1), this.render()));
    });
    const bar = contentEl.createDiv({ cls: 'raiz-goal-edit-bar' });
    bar.createEl('button', { text: 'Agregar meta' }).addEventListener('click', () => {
      this.goals.push({ key: '', label: '', icon: 'target', unit: '', goal: null, step: 1, color: '#22c55e', group: this.goals[this.goals.length - 1]?.group || 'Mis metas', tipo: 'meta', estilo: 'anillo', on: true });
      this.render();
    });
    bar.createEl('button', { cls: 'mod-cta', text: 'Guardar' }).addEventListener('click', () => this.save());
  }
  async save() {
    const used = new Set();
    const goals = [];
    for (const g of this.goals) {
      if (!String(g.label || '').trim()) continue;
      let key = g.key || norm(g.label).replace(/[^a-z0-9]/g, '') || 'meta';
      while (used.has(key)) key += '2';
      used.add(key);
      goals.push({ ...g, key, label: g.label.trim(), step: num(g.step) || 1, goal: num(g.goal) });
    }
    this.plugin.settings.goals = goals;
    this.plugin.settings.goalsReviewed = true;
    await this.plugin.saveSettings();
    this.close();
    new Notice('Metas guardadas.');
    this.onSave?.();
  }
  onClose() {
    this.contentEl.empty();
  }
}

/** Portada o fondo de una nota, o de todo su apartado (días, semanas, académico…). */
class BackgroundModal extends Modal {
  constructor(plugin, file) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
    this.section = plugin.sectionOf(file);
    this.scope = 'nota';
  }
  onOpen() {
    const p = this.plugin;
    const { contentEl } = this;
    this.modalEl.addClass('raiz-media-modal');
    contentEl.createEl('h3', { text: 'Imagen de fondo' });
    if (this.section) {
      const scope = contentEl.createDiv({ cls: 'raiz-scope' });
      const opts = [['nota', 'Solo esta nota'], ['apartado', `Todo el apartado: ${this.section.label}`]];
      const btns = opts.map(([k, t]) => {
        const b = scope.createEl('button', { cls: 'raiz-chip' + (k === this.scope ? ' is-active' : ''), text: t });
        b.addEventListener('click', () => {
          this.scope = k;
          btns.forEach((x) => x.removeClass('is-active'));
          b.addClass('is-active');
        });
        return b;
      });
      contentEl.createDiv({ cls: 'raiz-muted', text: `"Todo el apartado" cambia las notas que ya tienes ahí y las que crees después.` });
    }
    const set = (value) =>
      p.run(async () => {
        if (this.scope === 'apartado' && this.section) await p.applySectionBanner(this.section, value);
        else await p.setBanner(this.file, value);
        this.close();
      });
    const bar = contentEl.createDiv({ cls: 'raiz-lib-bar' });
    const url = bar.createEl('input', { cls: 'raiz-input', attr: { type: 'url', placeholder: 'Pega la URL de una imagen…' } });
    bar.createEl('button', { cls: 'mod-cta', text: 'Usar URL' }).addEventListener('click', () =>
      p.run(async () => {
        const u = url.value.trim();
        if (!u) return;
        const saved = await p.downloadCover(u, `fondo ${this.scope === 'apartado' && this.section ? this.section.label : this.file.basename}`, null, p.settings.folders.covers);
        await set(saved ? `[[${saved}]]` : u);
      })
    );
    // Imagen desde el computador (o el teléfono): se copia a la carpeta de portadas, que no se sube a GitHub
    const picker = bar.createEl('input', { attr: { type: 'file', accept: 'image/*' } });
    picker.style.display = 'none';
    bar.createEl('button', { cls: 'raiz-chip is-go', text: 'Elegir imagen del PC' }).addEventListener('click', () => picker.click());
    picker.addEventListener('change', () =>
      p.run(async () => {
        const file = picker.files?.[0];
        if (!file) return;
        const dir = p.settings.folders.covers;
        await p.ensureFolder(dir);
        const ext = (file.name.match(/\.(png|jpe?g|gif|webp|avif|svg)$/i)?.[1] || 'png').toLowerCase();
        const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'fondo';
        let path = `${dir}/${base}.${ext}`;
        for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = `${dir}/${base} ${i}.${ext}`;
        await this.app.vault.createBinary(path, await file.arrayBuffer());
        await set(`[[${path}]]`);
      })
    );
    const covers = p.settings.folders.covers;
    const isImg = (f) => /^(png|jpe?g|gif|webp|avif|svg)$/i.test(f.extension);
    const mine = this.app.vault.getFiles().filter((f) => f.path.startsWith(covers + '/') && isImg(f));
    const own = this.app.vault.getFiles().filter((f) => f.path.startsWith(p.settings.folders.banners + '/') && isImg(f));
    const all = mine.concat(own);
    if (all.length) bar.createEl('button', { cls: 'raiz-chip', text: 'Al azar' }).addEventListener('click', () => set(`[[${all[Math.floor(Math.random() * all.length)].path}]]`));
    bar.createEl('button', { cls: 'raiz-chip', text: 'Restaurar el original' }).addEventListener('click', () => set(null));
    bar.createEl('button', { cls: 'raiz-chip', text: 'Sin imagen' }).addEventListener('click', () => set(''));
    const grid = (title, files, empty) => {
      contentEl.createEl('h4', { cls: 'raiz-bg-title', text: title });
      if (!files.length) return contentEl.createDiv({ cls: 'raiz-muted', text: empty });
      const g = contentEl.createDiv({ cls: 'raiz-cover-grid' });
      for (const f of files) {
        const cell = g.createDiv({ cls: 'raiz-cover-cell' });
        cell.createEl('img', { attr: { src: this.app.vault.getResourcePath(f), loading: 'lazy', alt: f.basename } });
        cell.addEventListener('click', () => set(`[[${f.path}]]`));
      }
    };
    grid('Tus imágenes', mine, `Agrega tus fotos o fondos favoritos a la carpeta "${covers}" y aparecen aquí.`);
    grid('Fondos de Raíz', own, 'No hay fondos en la carpeta de banners.');
  }
  onClose() {
    this.contentEl.empty();
  }
}

/** Asistente de IA: escanea qué tienes (local, suscripciones, API keys) y lo configura con un clic. */
class AiScanModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin;
    this.onDone = onDone;
  }
  onOpen() {
    this.modalEl.addClass('raiz-ai-modal');
    this.scan();
  }
  async scan() {
    const p = this.plugin;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Tus IAs' });
    const status = contentEl.createDiv({ cls: 'raiz-muted', text: 'Buscando…' });
    let found = [];
    try {
      found = await p.scanAI((t) => status.setText(t));
    } catch (e) {
      status.setText(`No pude terminar la búsqueda: ${e.message}`);
    }
    p.lastScan = found;
    this.render(found);
  }
  render(found) {
    const p = this.plugin;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Tus IAs' });
    contentEl.createDiv({
      cls: 'raiz-muted',
      text: found.length ? `Encontré ${found.length} opción(es). Elige una y Raíz configura los modelos y parámetros por ti. Puedes cambiar cuando quieras.` : 'No encontré ninguna IA todavía. Abajo tienes cómo agregar la que prefieras.',
    });
    const current = p.aiId();
    const groups = [
      ['local', 'En tu equipo', 'Gratis, sin límites y privado: tus notas no salen de tu PC.'],
      ['sub', 'Tus suscripciones', 'Usa tu plan (Claude, ChatGPT, Gemini, Kimi…) a través de su programa oficial. Cada respuesta cuenta en el límite de tu plan.'],
      ['api', 'Tus API keys', 'Pago por uso en la cuenta del proveedor.'],
    ];
    for (const [type, title, desc] of groups) {
      const items = found.filter((f) => f.type === type);
      if (!items.length) continue;
      contentEl.createEl('h4', { cls: 'raiz-ai-group', text: title });
      contentEl.createDiv({ cls: 'raiz-muted raiz-ai-group-desc', text: desc });
      const grid = contentEl.createDiv({ cls: 'raiz-ai-grid' });
      for (const f of items) {
        const card = grid.createDiv({ cls: 'raiz-ai-card' + (f.id === current ? ' is-current' : '') + (f.ok === false ? ' is-bad' : '') });
        card.createDiv({ cls: 'raiz-ai-name', text: f.label });
        const det = [];
        if (f.models.length) det.push(`${f.models.length} modelo(s)`);
        if (f.path) det.push('instalado');
        if (f.keyFrom) det.push(`key: ${f.keyFrom}`);
        if (f.ok === false) det.push('la key no funcionó');
        card.createDiv({ cls: 'raiz-ai-det', text: det.join(' · ') });
        const m = p.autoModels(f);
        const names = f.models.map((x) => x.name).filter((n) => !/embed|bge|nomic|rerank|whisper|tts|guard/i.test(n));
        const pick = (label, key) => {
          const row = card.createDiv({ cls: 'raiz-ai-pick' });
          row.createSpan({ text: label });
          if (names.length > 1) {
            const sel = row.createEl('select', { cls: 'dropdown' });
            for (const n of names) sel.createEl('option', { value: n, text: n });
            sel.value = names.includes(m[key]) ? m[key] : names[0];
            m[key] = sel.value;
            sel.addEventListener('change', () => (m[key] = sel.value));
          } else row.createSpan({ cls: 'raiz-ai-model', text: m[key] || 'el de tu cuenta' });
        };
        pick('Rápido', 'fast');
        pick('Profundo', 'deep');
        const btn = card.createEl('button', { cls: f.id === current ? '' : 'mod-cta', text: f.id === current ? 'Usar con estos modelos' : 'Usar esta' });
        btn.disabled = f.ok === false;
        btn.addEventListener('click', () =>
          p.run(async () => {
            await p.useScanned(f, m);
            this.close();
            this.onDone?.();
          })
        );
      }
    }
    // Lo que no está: cómo agregarlo, por tipo (abierto si casi no hay nada)
    const have = new Set(found.map((f) => f.id));
    const more = contentEl.createEl('details', { cls: 'raiz-ai-more' });
    if (found.length < 3) more.setAttr('open', '');
    more.createEl('summary', { text: 'Agregar otra IA' });
    const order = ['openrouter', 'vercel']; // una sola key para muchos modelos: primero
    const entries = Object.entries(AI_PROVIDERS)
      .filter(([id]) => !have.has(id) && id !== 'custom' && id !== 'custom_cli')
      .sort((x, y) => (order.includes(y[0]) ? 1 : 0) - (order.includes(x[0]) ? 1 : 0));
    const sections = [
      ['Con API key (pago por uso)', ([, pv]) => (pv.kind === 'openai' || pv.kind === 'anthropic') && !pv.local],
      ['Con tu suscripción (programa oficial)', ([, pv]) => pv.kind === 'cli'],
      ['En tu equipo', ([, pv]) => pv.local || pv.kind === 'ollama'],
    ];
    for (const [title, test] of sections) {
      const items = entries.filter(test);
      if (!items.length) continue;
      more.createEl('h5', { cls: 'raiz-ai-add-title', text: title });
      const list = more.createDiv({ cls: 'raiz-ai-add' });
      for (const [id, pv] of items) {
        const row = list.createDiv({ cls: 'raiz-ai-add-row' });
        const info = row.createDiv();
        info.createDiv({ cls: 'raiz-ai-name', text: pv.label });
        info.createDiv({ cls: 'raiz-muted', text: pv.kind === 'cli' ? `Instala el programa e inicia sesión con: ${pv.login || pv.bin}` : pv.local ? 'Ábrelo en tu PC y vuelve a buscar.' : pv.kind === 'ollama' ? 'Instálalo desde ollama.com.' : pv.hint || 'Pega tu API key para usarlo.' });
        const act = row.createDiv({ cls: 'raiz-ai-add-act' });
        if ((pv.kind === 'openai' || pv.kind === 'anthropic') && !pv.local) {
          const inp = act.createEl('input', { cls: 'raiz-input', attr: { type: 'password', placeholder: 'API key' } });
          act.createEl('button', { cls: 'mod-cta', text: 'Guardar' }).addEventListener('click', () => {
            if (!inp.value.trim()) return;
            p.setApiKey(id, inp.value);
            new Notice(`Key de ${pv.label} guardada en el Llavero.`);
            this.scan();
          });
          if (pv.keyUrl) act.createEl('button', { text: 'Conseguir key' }).addEventListener('click', () => window.open(pv.keyUrl));
        }
        const url = pv.install || (pv.kind === 'ollama' ? 'https://ollama.com' : id === 'lmstudio' ? 'https://lmstudio.ai' : id === 'openclaw' ? 'https://openclaw.ai' : null);
        if (url) act.createEl('button', { text: pv.kind === 'cli' ? 'Instalar' : 'Descargar' }).addEventListener('click', () => window.open(url));
        if (pv.kind === 'cli' && pv.login)
          act.createEl('button', { text: 'Copiar comando' }).addEventListener('click', () => {
            navigator.clipboard.writeText(pv.login.split(' (')[0]);
            new Notice(`Copiado: ${pv.login}. Pégalo en una terminal para iniciar sesión.`);
          });
      }
    }
    more.createDiv({ cls: 'raiz-muted raiz-ai-add-foot', text: '¿No está el tuyo? Cualquier servicio, bot o agente con API compatible con OpenAI, o cualquier programa de terminal, se agrega en "Configuración manual".' });
    const bar = contentEl.createDiv({ cls: 'raiz-ai-bar' });
    bar.createEl('button', { text: 'Buscar de nuevo' }).addEventListener('click', () => this.scan());
    bar.createEl('button', { text: 'Configuración manual' }).addEventListener('click', () => {
      p.settings.ai.showAdvanced = true;
      p.saveSettings();
      this.close();
      p.openSettings();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
}

// ───────────────────────────── Plugin principal ─────────────────────────────

module.exports = class RaizPlugin extends Plugin {
  async onload() {
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.trainingCache = new Map();
    this.api = this.buildApi();
    window.raiz = this.api; // disponible lo antes posible para Templater
    await this.loadSettings();

    this.addSettingTab(new RaizSettingTab(this.app, this));
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('raiz-status');
    this.statusEl.setText('✦ IA…');
    this.statusEl.onClickEvent(async () => {
      const st = await this.checkAI(true);
      if (!st.ok) new AiScanModal(this).open();
    });
    this.loadUserFonts().then(() => this.applyFonts());

    this.addCommand({ id: 'open-settings', name: 'Abrir ajustes', callback: () => this.openSettings() });
    this.addCommand({ id: 'check-ollama', name: 'Comprobar la IA', callback: () => this.checkAI(true) });
    this.addCommand({ id: 'ai-scan', name: 'IA: buscar mis IAs y configurarlas', callback: () => new AiScanModal(this).open() });
    this.addCommand({ id: 'pull-models', name: 'Descargar modelos de IA recomendados', callback: () => this.pullModels() });
    this.addCommand({ id: 'open-today', name: 'Abrir la nota de hoy', callback: () => this.openToday() });
    this.addCommand({ id: 'new-course', name: 'Nueva asignatura', callback: () => this.newCourse() });
    this.addCommand({ id: 'new-event', name: 'Nuevo evento o reunión', callback: () => this.newEvent() });
    this.addCommand({ id: 'new-routine', name: 'Nueva rutina de entrenamiento', callback: () => this.newRoutine() });
    this.addCommand({ id: 'insert-routine', name: 'Cargar rutina en la nota de hoy', callback: () => this.run(() => this.insertRoutine()) });
    this.addCommand({ id: 'training-coach', name: 'Coach de entrenamiento (IA)', callback: () => this.run(() => this.trainingCoach()) });
    this.registerView(CONN_VIEW, (leaf) => new ConnectionsView(leaf, this));
    this.registerDomEvent(document, 'keydown', (e) => this.flashKeys?.(e));
    this.addCommand({ id: 'open-connections', name: 'Abrir panel de conexiones', callback: () => this.openConnections() });
    this.addCommand({ id: 'link-all-mentions', name: 'Enlazar todas las menciones de esta nota', callback: () => this.run(() => this.linkAllMentions()) });
    this.addCommand({ id: 'index-vault', name: 'Indexar notas para la IA (conexiones y preguntas)', callback: () => this.run(() => this.indexVault()) });
    this.addCommand({ id: 'ask-vault', name: 'Pregúntale a todo tu vault', callback: () => new AskVaultModal(this).open() });
    this.addCommand({ id: 'capture', name: 'Captura rápida a la bandeja', callback: () => this.capture() });
    this.addCommand({ id: 'generate-cards', name: 'Generar preguntas de repaso de esta nota', callback: () => this.run(() => this.generateCards()) });
    this.addCommand({ id: 'new-study-page', name: 'Estudio: nueva página', callback: () => this.newStudyPage() });
    this.addCommand({ id: 'new-child', name: 'Página: nueva entrada dentro de la nota abierta', callback: () => this.run(() => this.newChild()) });
    this.addCommand({ id: 'insert-subpage', name: 'Insertar: nueva página enlazada aquí', editorCallback: () => this.run(() => this.insertSubpage()) });
    this.addCommand({ id: 'insert-base', name: 'Insertar: base con vistas (subpáginas)', editorCallback: () => this.run(() => this.insertChildrenBase()) });
    this.addCommand({ id: 'insert-page-card', name: 'Insertar: tarjeta de otra página', editorCallback: () => this.run(() => this.insertPageCard()) });
    this.addCommand({ id: 'insert-module', name: 'Insertar: módulo (agenda, biblioteca, repaso…)', editorCallback: () => this.run(() => this.insertModule()) });
    this.addCommand({ id: 'make-page', name: 'Convertir esta nota en página (ícono, portada, subpáginas)', callback: () => this.run(() => this.makePage()) });
    this.addCommand({ id: 'new-class-note', name: 'Estudio: nueva nota de clase aquí', callback: () => { const f = this.app.workspace.getActiveFile(); this.newStudyPage(f && this.isStudyPage(f) ? { padre: f.basename, clase: 'apunte' } : { clase: 'apunte' }); } });
    this.addCommand({ id: 'change-cover', name: 'Cambiar imagen de fondo (de la nota o de todo su apartado)', callback: () => new BackgroundModal(this, this.activeFile()).open() });
    this.addCommand({ id: 'edit-goals', name: 'Editar mis metas (agua, comida, pasos, lectura…)', callback: () => this.editGoals() });
    this.addCommand({ id: 'change-icon', name: 'Cambiar ícono de la nota', callback: () => { const f = this.activeFile(); new IconModal(this, (v) => this.app.fileManager.processFrontMatter(f, (x) => { x.icono = v; })).open(); } });
    this.addCommand({ id: 'local-graph', name: 'Abrir grafo local al lado', callback: () => this.run(() => this.openLocalGraph()) });
    this.addCommand({ id: 'ai-draft', name: 'IA: redactar apunte a partir del título', callback: () => this.run(() => this.aiDraft()) });
    this.addCommand({ id: 'ai-explain', name: 'IA: explicar la selección', editorCallback: () => this.run(() => this.aiOnSelection('explicar')) });
    this.addCommand({ id: 'ai-improve', name: 'IA: mejorar la redacción de la selección', editorCallback: () => this.run(() => this.aiOnSelection('mejorar')) });
    this.addCommand({ id: 'ai-code', name: 'IA: ejemplo de código', editorCallback: () => this.run(() => this.aiOnSelection('codigo')) });
    this.addCommand({ id: 'ai-tags', name: 'IA: sugerir etiquetas de tema', callback: () => this.run(() => this.aiTags()) });
    this.addCommand({ id: 'ai-summary-prop', name: 'IA: resumir la nota en una frase', callback: () => this.run(() => this.aiSummaryProp()) });
    for (const [id, name, text] of this.blockDefs()) this.addCommand({ id: `block-${id}`, name: `Bloque: ${name}`, editorCallback: () => this.run(() => this.insertBlock(text)) });
    // Fondo de la nota o de su apartado desde el menú de la nota (⋯ o clic derecho en la pestaña)
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        menu.addItem((i) => i.setTitle('Cambiar imagen de fondo').setIcon('image').setSection('action').onClick(() => new BackgroundModal(this, file).open()));
      })
    );
    // Menú contextual del editor para escribir con IA sobre lo seleccionado
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        menu.addItem((i) => i.setTitle('Insertar página, base, tarjeta o módulo…').setIcon('plus').onClick((evt) => this.insertMenu(evt)));
        if (!editor.getSelection().trim()) return;
        menu.addItem((i) => i.setTitle('IA: explicar').setIcon('message-square-text').onClick(() => this.run(() => this.aiOnSelection('explicar'))));
        menu.addItem((i) => i.setTitle('IA: mejorar redacción').setIcon('wand-2').onClick(() => this.run(() => this.aiOnSelection('mejorar'))));
        menu.addItem((i) => i.setTitle('IA: ejemplo de código').setIcon('code-2').onClick(() => this.run(() => this.aiOnSelection('codigo'))));
      })
    );
    this.addCommand({ id: 'prepare-workspace', name: 'Preparar mi espacio (calendario, grafo local y conexiones)', callback: () => this.run(() => this.prepareWorkspace()) });
    this.addCommand({ id: 'add-media', name: 'Agregar a la biblioteca (juego, libro, anime, manga…)', callback: () => new MediaModal(this).open() });
    this.addCommand({ id: 'new-knowledge-note', name: 'Nueva nota de conocimiento', callback: () => this.newKnowledgeNote() });
    this.addCommand({ id: 'new-moc', name: 'Nuevo mapa de contenido (MOC)', callback: () => this.newMoc() });
    this.addCommand({ id: 'stop-rest', name: 'Cerrar el temporizador de descanso', callback: () => this.stopRest() });
    this.addCommand({ id: 'ai-day', name: 'IA: nota y título del día', callback: () => this.run(() => this.dailyRate({ rating: true, alias: true })) });
    this.addCommand({ id: 'ai-rate', name: 'IA: valorar el día', callback: () => this.run(() => this.dailyRate({ rating: true })) });
    this.addCommand({ id: 'ai-title', name: 'IA: ponerle título a la nota', callback: () => this.run(() => (this.levelOf(this.activeFile()) === 'daily' ? this.dailyRate({ alias: true }) : this.periodAlias(this.levelOf(this.activeFile())))) });
    this.addCommand({ id: 'ai-wheel', name: 'IA: Rueda de la Vida de la semana', callback: () => this.run(() => this.wheelOfLife()) });
    this.addCommand({ id: 'ai-year-review', name: 'IA: revisión del año', callback: () => this.run(() => this.yearReview()) });
    this.addCommand({ id: 'ask-note', name: 'IA: responder la pregunta de esta nota', callback: () => this.run(() => this.qa()) });
    this.addCommand({ id: 'quick-avance', name: 'Nota rápida: avance', callback: () => this.run(() => this.quickNote('avance')) });
    this.addCommand({ id: 'quick-destacado', name: 'Nota rápida: destacado', callback: () => this.run(() => this.quickNote('destacado')) });
    this.addCommand({ id: 'quick-idea', name: 'Nota rápida: idea', callback: () => this.run(() => this.quickNote('idea')) });
    this.addCommand({ id: 'summarize-current', name: 'IA: resumir / valorar la nota actual', callback: () => this.run(() => this.smartSummarize()) });

    this.app.workspace.onLayoutReady(async () => {
      this.layoutReadyAt = Date.now();
      this.registerEvent(this.app.vault.on('create', (f) => this.onLinkedNoteCreated(f).catch((e) => console.error('[Raíz]', e))));
      if (this.aiId() !== 'ollama') this.checkAI(false);
      if (!this.settings.ai?.configured)
        this.checkAI(false).then((r) => {
          if (r.ok) ((this.settings.ai.configured = true), this.saveSettings());
          else new Notice('✦ Configura tu IA: haz clic en "✦ IA" abajo a la derecha y Raíz buscará las que tienes.', 12000);
        });
      const st = this.embedUsesProvider() ? { ok: true, installed: [] } : await this.checkOllama(false);
      // Indexado en segundo plano para las conexiones (solo si el modelo de embeddings está disponible)
      const hasEmbed = this.embedUsesProvider() || (st.ok && st.installed.some((m) => m.replace(/:latest$/, '') === this.settings.embedModel.replace(/:latest$/, '')));
      if (this.settings.autoIndex && hasEmbed) setTimeout(() => this.indexVault(true).catch(() => {}), 20000);
    });
  }

  onunload() {
    this.clearFonts();
    this.stopRest();
    if (window.raiz === this.api) delete window.raiz;
  }

  async loadSettings() {
    const data = (await this.loadData()) || {};
    this.settings = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), data);
    this.settings.folders = Object.assign({}, DEFAULT_SETTINGS.folders, data.folders || {});
    // Agua, proteína y lectura pasaron de casillas a metas con número
    if (!data.goals && Array.isArray(data.habits)) {
      const old = ['💧 2 L de agua', '🥩 Meta de proteína', '📖 Leer 20 min'];
      this.settings.habits = data.habits.filter((h) => !old.includes(h.label));
    }
    for (const c of [{ key: 'video', label: 'Videos', emoji: '▶️', color: '#ef4444', provider: 'youtube', unidad: 'min' }, { key: 'curso', label: 'Cursos', emoji: '🧭', color: '#22d3ee', provider: 'youtube', unidad: 'lecciones' }])
      if (!this.settings.mediaCategories.some((x) => x.key === c.key)) this.settings.mediaCategories.push(c);
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  openSettings() {
    this.app.setting.open();
    this.app.setting.openTabById(this.manifest.id);
  }

  // ───────────── API pública (window.raiz) ─────────────
  buildApi() {
    const p = this;
    return {
      version: '1.3.0',
      rootPath: '/',
      get settings() {
        return p.settings;
      },
      ai: {
        chat: (o) => p.chat(o),
        check: () => p.checkAI(true),
      },
      build: (tp) => p.buildFromTp(tp),
      training: {
        insertRoutine: () => p.run(() => p.insertRoutine()),
        coach: () => p.run(() => p.trainingCoach()),
        parse: parseTraining,
      },
      charts: p.buildCharts(),
      templates: {
        habitsFrontmatter: () => p.habitsFrontmatter(),
        habitsBlock: () => p.habitsBlock(),
        wheelFrontmatter: () => p.wheelFrontmatter(),
        wheelDisplay: () => p.wheelDisplay(),
        trainingBlock: () => p.trainingBlock(),
      },
      util: { fechaLarga, fechaCorta, parseTraining, gradeInfo, parseSchedule, rangeOf: (f) => p.rangeOf(f) },
    };
  }

  async run(fn) {
    try {
      return await fn();
    } catch (e) {
      console.error('[Raíz]', e);
      new Notice(`❌ ${e.message}`, 8000);
      return null;
    }
  }

  // ───────────── Suscripciones vía CLIs oficiales (Claude Code, Codex, Gemini CLI, Kimi Code, OpenCode…) ─────────────
  /** Busca un ejecutable en el PATH y en las carpetas donde suelen instalarse estas CLIs. */
  findBin(name) {
    if (!name) return null;
    let fs, path, os;
    try {
      fs = require('fs');
      path = require('path');
      os = require('os');
    } catch (e) {
      return null; // móvil
    }
    if (path.isAbsolute(name)) return fs.existsSync(name) ? name : null;
    const win = process.platform === 'win32';
    const home = os.homedir();
    const env = process.env;
    const dirs = String(env.PATH || env.Path || '')
      .split(path.delimiter)
      .concat(
        win
          ? [path.join(home, '.local', 'bin'), path.join(env.APPDATA || '', 'npm'), path.join(home, '.bun', 'bin'), path.join(home, '.cargo', 'bin'), path.join(env.LOCALAPPDATA || '', 'Programs', name), path.join(env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links'), path.join(home, 'scoop', 'shims')]
          : [path.join(home, '.local', 'bin'), path.join(home, '.npm-global', 'bin'), path.join(home, '.bun', 'bin'), path.join(home, '.cargo', 'bin'), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin']
      )
      .filter(Boolean);
    const exts = win ? ['.exe', '.cmd', '.bat', ''] : [''];
    for (const d of dirs) for (const e of exts) {
      const p = path.join(d, name + e);
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch (err) {
        /* no está */
      }
    }
    return null;
  }
  cliArgs(c, model, promptFile) {
    const out = [];
    const args = Array.isArray(c.args) ? c.args : String(c.args || '').match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"|"$/g, '')) || [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '{model}') {
        if (!model) out.pop(); // sin modelo: se quita también su flag (ej. --model)
        else out.push(model);
      } else out.push(a.replace('{archivo}', promptFile));
    }
    return out;
  }
  /** Ejecuta la CLI en una carpeta vacía (no toca tu vault) y devuelve lo que responde. */
  async chatCli({ system, prompt, schema, model }) {
    let cp, fs, path, os;
    try {
      cp = require('child_process');
      fs = require('fs');
      path = require('path');
      os = require('os');
    } catch (e) {
      throw new Error('Las suscripciones por CLI solo funcionan en el computador. En el celular usa un proveedor con API o tu PC vía Ollama.');
    }
    const c = this.aiConf();
    const bin = this.findBin(c.bin);
    if (!bin) throw new Error(`No encuentro el programa "${c.bin || '(sin definir)'}"${c.install ? `. Descárgalo en ${c.install}` : ''} e inicia sesión una vez con: ${c.login || c.bin}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiz-ia-'));
    const full =
      `INSTRUCCIONES:\n${system || this.systemPrompt()}\n` +
      (schema ? `Responde SOLO con un objeto JSON válido (sin texto alrededor ni bloques de código) que siga este esquema: ${JSON.stringify(schema)}\n` : '') +
      `No uses herramientas, no crees ni modifiques archivos y no expliques lo que vas a hacer: responde directamente.\n\nPETICIÓN:\n${prompt}`;
    const file = path.join(dir, 'peticion.md');
    fs.writeFileSync(file, full, 'utf8');
    const args = this.cliArgs(c, model, file);
    const isCmd = /\.(cmd|bat)$/i.test(bin);
    // Los .cmd de npm necesitan cmd.exe; los argumentos van entre comillas (son cortos: la petición va por stdin o archivo)
    const q = (a) => `"${String(a).replace(/"/g, '""')}"`;
    const child = isCmd
      ? cp.spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${[q(bin), ...args.map(q)].join(' ')}"`], { cwd: dir, windowsHide: true, windowsVerbatimArguments: true, env: process.env })
      : cp.spawn(bin, args, { cwd: dir, windowsHide: true, env: process.env });
    return await new Promise((resolve, reject) => {
      let out = '';
      let err = '';
      const kill = setTimeout(() => {
        child.kill();
        reject(new Error(`${c.label} tardó más de 5 minutos.`));
      }, 300000);
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', (e) => (clearTimeout(kill), reject(new Error(`No pude abrir ${c.bin}: ${e.message}`))));
      child.on('close', (code) => {
        clearTimeout(kill);
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch (e) {
          /* nada */
        }
        const clean = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim();
        if (code !== 0 && !clean(out)) {
          const e = clean(err).split('\n').slice(-6).join('\n');
          if (/log ?in|auth|credential|unauthori|sign in/i.test(e)) return reject(new Error(`${c.label}: falta iniciar sesión. Abre una terminal y ejecuta "${c.login || c.bin}".`));
          return reject(new Error(`${c.label} (código ${code}): ${e || 'sin detalles'}`));
        }
        resolve(clean(out));
      });
      if (c.stdin) child.stdin.end(full, 'utf8');
      else child.stdin.end();
    });
  }
  // ───────────── Escáner: qué IAs tienes disponibles (local, suscripciones y API keys) ─────────────
  envKeyFor(id) {
    const vars = { openai: ['OPENAI_API_KEY'], anthropic: ['ANTHROPIC_API_KEY'], xai: ['XAI_API_KEY', 'GROK_API_KEY'], deepseek: ['DEEPSEEK_API_KEY'], kimi: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'], qwen: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY'], gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], openrouter: ['OPENROUTER_API_KEY'], groq: ['GROQ_API_KEY'], opencode: ['OPENCODE_API_KEY'], mistral: ['MISTRAL_API_KEY'], together: ['TOGETHER_API_KEY'], fireworks: ['FIREWORKS_API_KEY'], perplexity: ['PERPLEXITY_API_KEY', 'PPLX_API_KEY'], cerebras: ['CEREBRAS_API_KEY'], sambanova: ['SAMBANOVA_API_KEY'], huggingface: ['HF_TOKEN', 'HUGGINGFACE_API_KEY'], nvidia: ['NVIDIA_API_KEY'], zai: ['ZAI_API_KEY', 'ZHIPUAI_API_KEY'], minimax: ['MINIMAX_API_KEY'], cohere: ['COHERE_API_KEY', 'CO_API_KEY'], vercel: ['AI_GATEWAY_API_KEY'], azure: ['AZURE_OPENAI_API_KEY'] }[id];
    try {
      for (const v of vars || []) if (process.env[v]) return { key: process.env[v], from: v };
    } catch (e) {
      /* móvil */
    }
    return null;
  }
  /** Revisa el equipo y tus cuentas. No envía tus notas a nadie: solo pregunta qué modelos hay. */
  async scanAI(onStep) {
    const found = [];
    const probe = async (url, headers = {}) => {
      try {
        const r = await Promise.race([requestUrl({ url, method: 'GET', headers, throw: false }), new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 2500))]);
        return r.status < 400 ? r : null;
      } catch (e) {
        return null;
      }
    };
    onStep?.('Buscando IA local en tu equipo…');
    const o = await probe(`${this.ollamaUrl()}/api/tags`);
    if (o) found.push({ id: 'ollama', type: 'local', label: AI_PROVIDERS.ollama.label, models: (o.json.models || []).map((m) => ({ name: m.name, size: m.size || 0, params: m.details?.parameter_size || '' })) });
    const locals = [
      ['lmstudio', 'LM Studio', 'http://127.0.0.1:1234/v1'],
      ['openclaw', 'OpenClaw', 'http://127.0.0.1:18789/v1'],
      ['custom', 'Jan', 'http://127.0.0.1:1337/v1'],
      ['custom', 'llama.cpp / LocalAI', 'http://127.0.0.1:8080/v1'],
      ['custom', 'vLLM', 'http://127.0.0.1:8000/v1'],
    ];
    // Todos los servidores locales a la vez (cada uno espera como máximo 2,5 s)
    const replies = await Promise.all(locals.map(([id, , url]) => probe(`${url}/models`, id === 'openclaw' && this.apiKey('openclaw') ? { Authorization: `Bearer ${this.apiKey('openclaw')}` } : {})));
    locals.forEach(([id, name, url], i) => {
      const r = replies[i];
      if (r) found.push({ id, type: 'local', label: id === 'custom' ? `${name} (local)` : AI_PROVIDERS[id].label, baseUrl: url, models: (r.json?.data || []).map((m) => ({ name: m.id })) });
    });
    onStep?.('Buscando tus suscripciones (Claude, ChatGPT, Gemini, Kimi, OpenCode)…');
    for (const [id, pv] of Object.entries(AI_PROVIDERS)) {
      if (pv.kind !== 'cli' || !pv.bin) continue;
      const path = this.findBin(this.settings.ai?.providers?.[id]?.bin || pv.bin);
      if (path) found.push({ id, type: 'sub', label: pv.label, path, models: (pv.models || []).map((name) => ({ name })) });
    }
    onStep?.('Revisando tus API keys…');
    for (const [id, pv] of Object.entries(AI_PROVIDERS)) {
      if (pv.kind === 'cli' || pv.local || id === 'custom' || id === 'ollama') continue;
      const own = this.apiKey(id);
      const env = own ? null : this.envKeyFor(id);
      const key = own || env?.key;
      if (!key) continue;
      let models = [];
      let ok = true;
      try {
        models = (await this.listModels(id, key)).map((name) => ({ name }));
      } catch (e) {
        ok = false;
      }
      found.push({ id, type: 'api', label: pv.label, keyFrom: own ? 'Llavero' : env.from, envKey: env?.key, ok, models });
    }
    return found;
  }
  /** Elige el modelo rápido y el profundo según lo que tengas (y la RAM, si es local). */
  autoModels(f) {
    const P = AI_PROVIDERS[f.id] || {};
    const chat = f.models.filter((m) => !/embed|bge|nomic|rerank|whisper|tts|dall-?e|image|moderation|audio|realtime|transcri|guard/i.test(m.name));
    const names = chat.map((m) => m.name);
    if (f.type === 'sub') return { fast: P.fast || '', deep: P.deep || P.fast || '' };
    if (f.id === 'ollama') {
      const ram = this.totalRamGB() || 8;
      const fit = chat.filter((m) => !m.size || m.size / 1024 ** 3 < ram * 0.45).sort((a, b) => a.size - b.size);
      const list = fit.length ? fit : chat.slice().sort((a, b) => a.size - b.size);
      const fast = list.find((m) => m.size / 1024 ** 3 >= 1.2) || list[0];
      return { fast: fast?.name || '', deep: list[list.length - 1]?.name || fast?.name || '' };
    }
    if (!names.length) return { fast: P.fast || '', deep: P.deep || P.fast || '' };
    const has = (x) => x && names.includes(x);
    const fast = has(P.fast) ? P.fast : names.find((n) => /mini|flash|haiku|lite|small|turbo|fast|nano|instant|8b/i.test(n)) || names[0];
    const deep = has(P.deep) ? P.deep : names.find((n) => /pro|opus|sonnet|max|large|70b|405b|plus|reasoner|-4\b|k2/i.test(n) && !/mini|lite|nano/i.test(n)) || fast;
    return { fast, deep };
  }
  /** Deja configurada la IA elegida en el escáner, con sus modelos y parámetros. */
  async useScanned(f, models = this.autoModels(f)) {
    const s = this.settings;
    s.ai = s.ai || { provider: 'ollama', providers: {}, embedVia: 'ollama' };
    s.ai.providers = s.ai.providers || {};
    s.ai.provider = f.id;
    if (f.id === 'ollama') {
      const ram = this.totalRamGB() || 8;
      // El vault se usa en equipos con distinta RAM: se mantiene "automático" (este equipo usa lo elegido;
      // uno con más RAM usa el modelo más grande que tengas instalado)
      s.fastModel = models.fast || s.fastModel;
      const chat = f.models.filter((m) => !/embed|bge|nomic|rerank/i.test(m.name)).sort((a, b) => a.size - b.size);
      if (ram < s.lowRamThresholdGB) {
        s.lowRamDeepModel = models.deep || s.lowRamDeepModel;
        const top = chat[chat.length - 1];
        const named = top && chat.find((m) => m.size === top.size && !/:latest$/.test(m.name)); // "qwen2.5:7b" mejor que "qwen2.5:latest"
        s.deepModel = (named || top)?.name || s.deepModel;
      } else s.deepModel = models.deep || s.deepModel;
      s.modelMode = 'auto';
      s.numCtx = ram >= 15 ? 16384 : 8192; // más RAM = puede leer más notas a la vez
    } else {
      const own = (s.ai.providers[f.id] = s.ai.providers[f.id] || {});
      own.fast = models.fast || '';
      own.deep = models.deep || '';
      if (f.baseUrl) own.baseUrl = f.baseUrl;
      if (f.envKey && !this.apiKey(f.id)) this.setApiKey(f.id, f.envKey); // la key de tu variable de entorno pasa al Llavero
    }
    // Notas relacionadas: Ollama local si tiene un modelo de embeddings; si no, el proveedor (cuando lo soporta)
    const ol = this.lastScan?.find((x) => x.id === 'ollama');
    const emb = ol?.models.find((m) => /bge|nomic|embed|e5|gte|arctic/i.test(m.name));
    if (emb) {
      s.ai.embedVia = 'ollama';
      s.embedModel = emb.name.replace(/:latest$/, '');
    } else if (AI_PROVIDERS[f.id]?.embed) s.ai.embedVia = 'provider';
    s.ai.configured = true;
    await this.saveSettings();
    await this.checkAI(false);
    new Notice(`✅ IA configurada: ${f.label}\nRápido: ${this.modelFor('fast') || 'el de tu cuenta'}\nProfundo: ${this.modelFor('deep') || 'el de tu cuenta'}`, 8000);
  }

  // ───────────── Proveedores de IA: local (Ollama, LM Studio…) o en la nube (OpenAI, Claude, DeepSeek…) ─────────────
  aiProviders() {
    return AI_PROVIDERS;
  }
  aiId() {
    const id = this.settings.ai?.provider || 'ollama';
    return AI_PROVIDERS[id] ? id : 'ollama';
  }
  aiConf(id = this.aiId()) {
    const preset = AI_PROVIDERS[id];
    const own = this.settings.ai?.providers?.[id] || {};
    const set = Object.fromEntries(Object.entries(own).filter(([, v]) => v !== '' && v !== null && v !== undefined));
    return { ...preset, ...set, baseUrl: String(set.baseUrl || preset.baseUrl || '').replace(/\/+$/, '') };
  }
  isLocalAI() {
    return this.aiId() === 'ollama' || !!AI_PROVIDERS[this.aiId()].local;
  }
  /** Las API keys van al Llavero cifrado de Obsidian (o, si no existe, al almacenamiento local): nunca al vault ni a git. */
  apiKey(id = this.aiId()) {
    try {
      const ss = this.app.secretStorage;
      if (ss?.getSecret) return ss.getSecret(`raiz-${id}`) || '';
      return this.app.loadLocalStorage(`raiz-key-${id}`) || '';
    } catch (e) {
      return '';
    }
  }
  setApiKey(id, v) {
    v = v ? v.trim() : '';
    try {
      const ss = this.app.secretStorage;
      if (ss?.setSecret) {
        if (v) ss.setSecret(`raiz-${id}`, v);
        else ss.deleteSecret?.(`raiz-${id}`);
      } else this.app.saveLocalStorage(`raiz-key-${id}`, v || null);
    } catch (e) {
      new Notice(`No pude guardar la key: ${e.message}`);
    }
  }
  aiHeaders(c, id, key = this.apiKey(id)) {
    if (c.kind === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    const h = key ? (c.keyHeader ? { [c.keyHeader]: key } : { Authorization: `Bearer ${key}` }) : {};
    if (id === 'openrouter') Object.assign(h, { 'HTTP-Referer': 'https://obsidian.md', 'X-Title': 'Raiz' });
    return h;
  }
  async aiRequest(url, { method = 'POST', body, headers = {} } = {}) {
    const req = requestUrl({ url, method, contentType: 'application/json', headers, body: body ? JSON.stringify(body) : undefined, throw: false });
    const limit = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 300000));
    try {
      return await Promise.race([req, limit]);
    } catch (e) {
      if (e.message === 'timeout') throw new Error('La IA tardó más de 5 minutos. Intenta de nuevo o usa un modelo más liviano.');
      throw new Error(`No pude conectar con ${new URL(url).host}. Revisa la URL y tu conexión.`);
    }
  }
  aiError(res) {
    let msg = '';
    try {
      const j = res.json;
      msg = j?.error?.message || j?.error || j?.message || '';
    } catch (e) {
      /* no es json */
    }
    msg = String(msg || res.text || res.status).slice(0, 300);
    if (res.status === 401 || res.status === 403) return `La API key no es válida o no tiene permiso (${res.status}). Revísala en Ajustes → Raíz → IA.`;
    if (res.status === 429) return `El proveedor dice que llegaste al límite o que no queda saldo (429): ${msg}`;
    return msg;
  }
  /** Chat con un proveedor externo (formato OpenAI o Claude). */
  async chatRemote({ system, prompt, schema, temperature, maxTokens, model }) {
    const id = this.aiId();
    const c = this.aiConf(id);
    if (c.kind === 'cli') return this.chatCli({ system, prompt, schema, model });
    if (!c.baseUrl) throw new Error('Falta la URL del proveedor de IA (Ajustes → Raíz → IA).');
    if (c.needsKey && !this.apiKey(id)) throw new Error(`Falta tu API key de ${c.label} (Ajustes → Raíz → IA).`);
    const sys = (system || this.systemPrompt()) + (schema ? `\nResponde SOLO con un objeto JSON válido (sin texto alrededor ni bloques de código) que siga este esquema: ${JSON.stringify(schema)}` : '');
    const max = maxTokens || (schema ? 900 : 1500);
    if (c.kind === 'anthropic') {
      const res = await this.aiRequest(`${c.baseUrl}/messages`, { headers: this.aiHeaders(c, id), body: { model, system: sys, max_tokens: max, temperature, messages: [{ role: 'user', content: prompt }] } });
      if (res.status >= 400) throw new Error(`${c.label}: ${this.aiError(res)}`);
      return (res.json?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    }
    // Formato OpenAI (OpenAI, DeepSeek, Kimi, Qwen, Gemini, OpenRouter, Groq, LM Studio…)
    const body = { model, messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }], temperature, max_tokens: max };
    if (schema && c.json) body.response_format = { type: 'json_object' };
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await this.aiRequest(`${c.baseUrl}/chat/completions`, { headers: this.aiHeaders(c, id), body });
      if (res.status < 400) {
        const m = res.json?.choices?.[0]?.message;
        return String(m?.content ?? '');
      }
      const msg = this.aiError(res);
      // Algunos modelos (los que razonan) no aceptan temperature o piden max_completion_tokens
      if (/max_tokens/i.test(msg) && body.max_tokens) ((body.max_completion_tokens = Math.max(body.max_tokens, 4000)), delete body.max_tokens);
      else if (/temperature/i.test(msg) && 'temperature' in body) delete body.temperature;
      else if (/response_format|json_object/i.test(msg) && body.response_format) delete body.response_format;
      else throw new Error(`${c.label}: ${msg}`);
    }
    throw new Error(`${c.label} rechazó la petición.`);
  }
  /** Lista de modelos del proveedor elegido (para elegirlos en los ajustes). */
  async listModels(id = this.aiId(), key) {
    const c = this.aiConf(id);
    if (c.kind === 'cli' || c.noModels) return [c.fast, c.deep].filter((x, i, a) => x && a.indexOf(x) === i);
    if (id === 'ollama') {
      const res = await this.aiRequest(`${this.ollamaUrl()}/api/tags`, { method: 'GET' });
      if (res.status >= 400) throw new Error(this.aiError(res));
      return (res.json.models || []).map((m) => m.name).sort();
    }
    const res = await this.aiRequest(`${c.baseUrl}/models`, { method: 'GET', headers: this.aiHeaders(c, id, key || this.apiKey(id)) });
    if (res.status >= 400) throw new Error(`${c.label}: ${this.aiError(res)}`);
    return (res.json?.data || res.json?.models || []).map((m) => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean).sort();
  }
  /** Comprueba la IA elegida y actualiza la barra de estado. */
  async checkAI(verbose) {
    if (this.aiId() === 'ollama') return this.checkOllama(verbose);
    const c = this.aiConf();
    if (c.kind === 'cli') {
      const bin = this.findBin(c.bin);
      this.statusEl?.setText(bin ? `✦ IA lista · ${c.label.split(' (')[0]}` : `✦ IA: falta ${c.bin || 'el programa'}`);
      if (verbose) new Notice(bin ? `✅ ${c.label}: encontré ${bin}.\nUsa "Probar" para comprobar que tu sesión está iniciada.` : `No encuentro "${c.bin}". Instálalo e inicia sesión con: ${c.login || c.bin}`, 9000);
      return { ok: !!bin, installed: [], missing: [] };
    }
    try {
      if (c.needsKey && !this.apiKey()) throw new Error('falta la API key');
      const models = await this.listModels();
      const fast = this.modelFor('fast');
      const known = !models.length || models.includes(fast);
      this.statusEl?.setText(`✦ IA lista · ${fast}`);
      if (verbose) new Notice(`✅ ${c.label} responde.\nRápido: ${fast}\nProfundo: ${this.modelFor('deep')}${known ? '' : `\n⚠️ No veo "${fast}" en su lista de modelos: revisa el nombre.`}`, 8000);
      return { ok: true, installed: models, missing: [] };
    } catch (e) {
      this.statusEl?.setText('✦ IA sin conexión');
      if (verbose) new Notice(`${c.label}: ${e.message}`, 10000);
      return { ok: false, installed: [], missing: [] };
    }
  }
  embedUsesProvider() {
    const c = this.aiConf();
    return this.settings.ai?.embedVia === 'provider' && this.aiId() !== 'ollama' && c.kind === 'openai' && !!c.embed;
  }
  /** Identificador del índice de notas: si cambia el modelo de embeddings, se reindexa. */
  embedModelId() {
    return this.embedUsesProvider() ? `${this.aiId()}:${this.aiConf().embed}` : this.settings.embedModel;
  }
  // ───────────── Tipografía: fuentes para el texto, los títulos y la interfaz ─────────────
  fontOptions() {
    const opts = Object.entries(FONT_PRESETS).map(([v, f]) => [v, f.label]);
    for (const n of this.userFonts || []) opts.splice(opts.length - 1, 0, [`file:${n}`, `Tu fuente · ${n}`]);
    return opts;
  }
  fontCss(slot) {
    const f = this.settings.fonts || {};
    const v = f[slot] || '';
    if (!v) return null;
    if (v === 'custom') return f[`${slot}Custom`] ? `"${String(f[`${slot}Custom`]).replace(/"/g, '')}", system-ui, sans-serif` : null;
    if (v.startsWith('file:')) return `"${v.slice(5)}", system-ui, sans-serif`;
    return FONT_PRESETS[v]?.css || null;
  }
  applyFonts() {
    const f = this.settings.fonts || {};
    const vars = { text: '--font-text-theme', headings: '--raiz-display', ui: '--font-interface-theme' };
    const google = [];
    for (const [slot, prop] of Object.entries(vars)) {
      const css = this.fontCss(slot);
      if (css) document.body.style.setProperty(prop, css);
      else document.body.style.removeProperty(prop);
      const g = FONT_PRESETS[f[slot]]?.g;
      if (g) google.push(g);
    }
    let link = document.getElementById('raiz-fonts-link');
    if (google.length) {
      if (!link) link = document.head.createEl('link', { attr: { id: 'raiz-fonts-link', rel: 'stylesheet' } });
      const href = 'https://fonts.googleapis.com/css2?' + [...new Set(google)].map((g) => `family=${g}`).join('&') + '&display=swap';
      if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    } else link?.remove();
  }
  clearFonts() {
    for (const prop of ['--font-text-theme', '--raiz-display', '--font-interface-theme']) document.body.style.removeProperty(prop);
    document.getElementById('raiz-fonts-link')?.remove();
    for (const ff of this.fontFaces || []) document.fonts.delete(ff);
    this.fontFaces = [];
  }
  fontDir() {
    return `${this.manifest.dir}/fuentes`;
  }
  /** Fuentes que agregaste desde tu PC (quedan en la carpeta del plugin, no se suben a GitHub). */
  async loadUserFonts() {
    for (const ff of this.fontFaces || []) document.fonts.delete(ff);
    this.fontFaces = [];
    this.userFonts = [];
    const a = this.app.vault.adapter;
    if (!(await a.exists(this.fontDir()))) return;
    for (const path of (await a.list(this.fontDir())).files) {
      const m = path.match(/([^/\\]+)\.(ttf|otf|woff2?)$/i);
      if (!m) continue;
      try {
        const ff = new FontFace(m[1], await a.readBinary(path));
        await ff.load();
        document.fonts.add(ff);
        this.fontFaces.push(ff);
        this.userFonts.push(m[1]);
      } catch (e) {
        console.warn('[Raíz] No pude cargar la fuente', path, e);
      }
    }
  }
  pickFont(after) {
    const inp = createEl('input', { attr: { type: 'file', accept: '.ttf,.otf,.woff,.woff2' } });
    inp.addEventListener('change', () =>
      this.run(async () => {
        const file = inp.files?.[0];
        if (!file) return;
        const a = this.app.vault.adapter;
        if (!(await a.exists(this.fontDir()))) await a.mkdir(this.fontDir());
        await a.writeBinary(`${this.fontDir()}/${file.name}`, await file.arrayBuffer());
        await this.loadUserFonts();
        new Notice(`Fuente agregada: ${file.name.replace(/\.[^.]+$/, '')}. Elígela en Tipografía.`);
        after?.();
      })
    );
    inp.click();
  }
  /** Prueba rápida del proveedor de IA elegido. */
  async testAI() {
    const r = await this.chat({ prompt: 'Responde solo con la palabra: listo', tier: 'fast', maxTokens: 30, temperature: 0, label: 'Probando la IA' });
    await this.checkAI(false);
    new Notice(`✅ ${this.aiConf().label} respondió: "${String(r).trim().slice(0, 60)}"\nModelo: ${this.modelFor('fast')}`, 8000);
  }

  // ───────────── Ollama ─────────────
  ollamaUrl() {
    let url = this.settings.ollamaUrl;
    try {
      url = window.localStorage.getItem('raiz-ollama-url') || url;
    } catch (e) {
      /* sin localStorage */
    }
    return String(url).replace(/\/+$/, '');
  }
  totalRamGB() {
    try {
      return require('os').totalmem() / 1024 ** 3;
    } catch (e) {
      return null; // móvil: no hay módulo os
    }
  }
  /** Equipo con poca RAM (ej. 8 GB): se descargan antes los modelos para no competir por memoria. */
  lowRam() {
    const r = this.totalRamGB();
    return r !== null && r < this.settings.lowRamThresholdGB;
  }
  modelFor(tier) {
    const s = this.settings;
    if (this.aiId() !== 'ollama') {
      const c = this.aiConf();
      return tier === 'deep' ? c.deep || c.fast || '' : c.fast || c.deep || '';
    }
    if (tier !== 'deep') return s.fastModel;
    if (s.modelMode === 'manual') return s.deepModel;
    const ram = this.totalRamGB();
    return ram !== null && ram < s.lowRamThresholdGB ? s.lowRamDeepModel : s.deepModel;
  }
  neededModels() {
    return [...new Set([this.modelFor('fast'), this.modelFor('deep')])];
  }

  async chat({ system, prompt, tier = 'fast', schema = null, temperature = 0.5, label = 'Pensando', maxTokens }) {
    const model = this.modelFor(tier);
    if (this.aiId() !== 'ollama') {
      if (!model && this.aiConf().kind !== 'cli') throw new Error(`Elige un modelo para ${this.aiConf().label} en Ajustes → Raíz → Inteligencia artificial.`);
      const n = new Notice(`✦ ${label} · ${model}…`, 0);
      try {
        const content = cleanResponse(await this.chatRemote({ system, prompt, schema, temperature, maxTokens, model }));
        if (!content) throw new Error('El modelo respondió vacío. Intenta de nuevo.');
        return schema ? parseJson(content) : content;
      } finally {
        n.hide();
      }
    }
    const base = this.ollamaUrl();
    const notice = new Notice(`✦ ${label} · ${model}…`, 0);
    try {
      const body = {
        model,
        stream: false,
        keep_alive: this.lowRam() ? '2m' : '10m',
        messages: [
          { role: 'system', content: system || this.systemPrompt() },
          { role: 'user', content: prompt },
        ],
        // Tope de tokens y penalización de repetición: un modelo chico no puede quedarse en bucle
        options: { temperature, num_ctx: this.settings.numCtx, num_predict: maxTokens || (schema ? 900 : 1500), repeat_penalty: 1.1 },
      };
      if (schema) body.format = schema;
      if (/qwen3|deepseek-r1|gpt-oss|magistral/i.test(model)) body.think = false;
      let res;
      try {
        const req = requestUrl({ url: `${base}/api/chat`, method: 'POST', contentType: 'application/json', body: JSON.stringify(body), throw: false });
        const limit = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 300000));
        res = await Promise.race([req, limit]);
      } catch (e) {
        if (e.message === 'timeout') throw new Error('La IA tardó más de 5 minutos. Intenta de nuevo o usa un modelo más liviano.');
        throw new Error(`No pude conectar con Ollama en ${base}. ¿Está abierto?`);
      }
      if (res.status >= 400) {
        let msg = '';
        try {
          msg = res.json.error;
        } catch (e) {
          msg = res.text;
        }
        if (/not found|pull/i.test(msg)) throw new Error(`Falta el modelo "${model}". Usa el comando "Raíz: Descargar modelos de IA recomendados".`);
        throw new Error(`Ollama: ${msg}`);
      }
      const content = cleanResponse(res.json?.message?.content ?? '');
      if (!content) throw new Error('El modelo respondió vacío. Intenta de nuevo.');
      return schema ? parseJson(content) : content;
    } finally {
      notice.hide();
    }
  }

  async checkOllama(verbose) {
    const base = this.ollamaUrl();
    try {
      const res = await requestUrl({ url: `${base}/api/tags`, method: 'GET', throw: false });
      if (res.status >= 400) throw new Error(String(res.status));
      const installed = (res.json.models || []).map((m) => m.name);
      const has = (m) => installed.some((i) => i === m || i === `${m}:latest` || i.replace(/:latest$/, '') === m);
      const missing = this.neededModels().filter((m) => !has(m));
      const mine = this.aiId() === 'ollama';
      if (!mine) return { ok: true, installed, missing };
      if (missing.length) {
        this.statusEl?.setText('✦ IA: faltan modelos');
        if (verbose) new Notice(`Ollama está activo, pero faltan modelos: ${missing.join(', ')}.\nUsa "Raíz: Descargar modelos de IA recomendados".`, 10000);
      } else {
        this.statusEl?.setText(`✦ IA lista · ${this.modelFor('fast')}`);
        if (verbose) new Notice(`✅ IA local lista.\nRápido: ${this.modelFor('fast')}\nProfundo: ${this.modelFor('deep')}`);
      }
      return { ok: true, installed, missing };
    } catch (e) {
      if (this.aiId() === 'ollama') this.statusEl?.setText('✦ IA apagada');
      if (verbose) new Notice(`No encuentro Ollama en ${base}.\nInstálalo desde ollama.com y ábrelo.`, 10000);
      return { ok: false, installed: [], missing: this.neededModels() };
    }
  }

  async pullModels() {
    const base = this.ollamaUrl();
    // Con un proveedor externo solo hace falta (si se usa) el modelo local de embeddings
    const list = this.aiId() === 'ollama' ? [...this.neededModels(), this.settings.embedModel] : this.embedUsesProvider() ? [] : [this.settings.embedModel];
    if (!list.length) return new Notice('Tu proveedor de IA no necesita descargar modelos.');
    for (const model of list) {
      const n = new Notice(`⬇️ Descargando ${model}… (puede tardar varios minutos)`, 0);
      try {
        const res = await requestUrl({ url: `${base}/api/pull`, method: 'POST', contentType: 'application/json', body: JSON.stringify({ model, stream: false }), throw: false });
        if (res.status >= 400) throw new Error(res.text);
        new Notice(`✅ ${model} descargado`);
      } catch (e) {
        new Notice(`❌ No pude descargar ${model}: ${e.message || e}`, 10000);
      } finally {
        n.hide();
      }
    }
    await this.checkOllama(true);
  }

  systemPrompt() {
    return (
      (String(this.settings.userProfile || '').trim()
        ? `Eres el asistente privado del diario personal de esta persona: ${this.settings.userProfile.trim()}\n`
        : 'Eres el asistente privado de un diario personal.\n') +
      'Reglas: responde SIEMPRE en español, hablándole de "tú", con tono cercano, honesto y concreto. ' +
      'Usa solo la información de las notas: no inventes hechos, nombres ni números. ' +
      'Prefiere ejemplos específicos a frases genéricas.'
    );
  }

  // ───────────── Notas, niveles y rangos ─────────────
  activeFile() {
    const f = this.app.workspace.getActiveFile();
    if (!f) throw new Error('Abre una nota primero.');
    return f;
  }
  fm(file) {
    return this.app.metadataCache.getFileCache(file)?.frontmatter || {};
  }
  levelOf(file) {
    for (const level of LEVELS) {
      if (file.path.startsWith(this.settings.folders[level] + '/')) return level;
    }
    return null;
  }
  rangeOf(file, level = this.levelOf(file)) {
    const t = file.basename;
    let s = null;
    let e = null;
    if (level === 'daily') {
      s = moment(t.slice(0, 10), 'YYYY-MM-DD', true);
      e = s.clone();
    } else if (level === 'weekly') {
      s = moment(t.slice(0, 8), 'GGGG-[W]WW', true).startOf('isoWeek');
      e = s.clone().endOf('isoWeek');
    } else if (level === 'monthly') {
      s = moment(t.slice(0, 7), 'YYYY-MM', true).startOf('month');
      e = s.clone().endOf('month');
    } else if (level === 'quarterly') {
      s = moment(t.slice(0, 7), 'YYYY-[Q]Q', true).startOf('quarter');
      e = s.clone().endOf('quarter');
    } else if (level === 'yearly') {
      s = moment(t.slice(0, 4), 'YYYY', true).startOf('year');
      e = s.clone().endOf('year');
    }
    if (!s || !s.isValid()) return null;
    return { level, start: s.startOf('day'), end: e.endOf('day') };
  }
  /** Notas de un nivel cuyo "ancla" cae dentro del rango (semanas: su jueves ISO). */
  filesIn(level, start, end) {
    const folder = this.settings.folders[level] + '/';
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(folder)) continue;
      const r = this.rangeOf(f, level);
      if (!r) continue;
      const anchor = level === 'weekly' ? r.start.clone().add(3, 'days') : r.start;
      if (anchor.isBetween(start, end, 'day', '[]')) out.push({ file: f, range: r });
    }
    return out.sort((a, b) => a.range.start - b.range.start);
  }
  dailiesIn(start, end) {
    return this.filesIn('daily', start, end).map((x) => ({ file: x.file, date: x.range.start, fm: this.fm(x.file) }));
  }
  dailyFor(date) {
    const d = this.filesIn('daily', moment(date).startOf('day'), moment(date).endOf('day'));
    return d.length ? d[0].file : null;
  }
  labelOf(file, level = this.levelOf(file)) {
    const r = this.rangeOf(file, level);
    if (!r) return file.basename;
    if (level === 'daily') return fechaLarga(r.start);
    if (level === 'weekly') return `Semana ${r.start.isoWeek()} (${fechaCorta(r.start)} – ${fechaCorta(r.end)})`;
    if (level === 'monthly') return `${cap(MESES[r.start.month()])} ${r.start.year()}`;
    if (level === 'quarterly') return `T${r.start.quarter()} ${r.start.year()}`;
    return String(r.start.year());
  }

  /** Texto escrito por la persona en una nota, sin bloques de código, botones ni secciones automáticas. */
  async noteText(file) {
    let txt = await this.app.vault.cachedRead(file);
    txt = txt.replace(/\r\n/g, '\n');
    txt = txt.replace(/^---\n[\s\S]*?\n---\n?/, '');
    txt = txt.replace(/```[\s\S]*?```/g, '');
    txt = txt.replace(/%%[\s\S]*?%%/g, '');
    txt = txt.replace(/^.*`(?:BUTTON|INPUT|VIEW)\[.*$/gm, ''); // líneas de widgets (botones, campos)
    txt = txt.replace(/<%[\s\S]*?%>/g, '');
    txt = txt.replace(/<p hidden>[^<]*<\/p>/g, '');
    txt = txt.replace(/<[^>]+>/g, '');
    txt = txt.replace(/!\[\[[^\]]*\]\]/g, '');
    txt = txt.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1');
    const sections = [];
    let current = { head: '', lines: [] };
    for (const line of txt.split('\n')) {
      const h = line.match(/^#{1,6}\s+(.*)$/);
      if (h) {
        sections.push(current);
        current = { head: h[1].trim(), lines: [] };
        continue;
      }
      const t = line.trim();
      if (!t || t === '-' || t === '---' || /^-\s*\[ \]\s*$/.test(t) || /^>\s*(\[!.*)?$/.test(t) || /^✧/.test(t)) continue;
      current.lines.push(line.replace(/\s+$/, ''));
    }
    sections.push(current);
    return sections
      .filter((s) => s.lines.length && !SKIP_SECTIONS.test(s.head))
      .map((s) => (s.head ? `${s.head}:\n` : '') + s.lines.join('\n'))
      .join('\n')
      .trim();
  }
  hasContent(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().length > 15;
  }

  dataLine(fm) {
    const d = [];
    const add = (label, v, suf = '') => {
      if (v !== null && v !== undefined && v !== '') d.push(`${label}: ${v}${suf}`);
    };
    add('valoración', num(fm.valoracion), '/10');
    add('ánimo', num(fm.animo), '/5');
    add('energía', num(fm.energia), '/5');
    add('sueño', num(fm.sueno), ' h');
    add('peso', num(fm.peso), ' kg');
    add('estudio', num(fm.horasEstudio), ' h');
    if (fm.entreno) d.push(`entrenamiento: ${fm.entreno}${num(fm.duracion) ? ` ${num(fm.duracion)} min` : ''}${num(fm.rpe) ? ` RPE ${num(fm.rpe)}` : ''}`);
    const hab = fm.habitos && typeof fm.habitos === 'object' ? fm.habitos : null;
    if (hab) {
      const done = this.settings.habits.filter((h) => hab[h.key] === true).map((h) => h.label.replace(/^\S+\s/, ''));
      if (done.length) d.push(`hábitos cumplidos: ${done.join(', ')}`);
    }
    return d.join(' · ');
  }
  async dailyContext(file, { withRating = true } = {}) {
    const fm = Object.assign({}, this.fm(file));
    if (!withRating) delete fm.valoracion;
    const r = this.rangeOf(file, 'daily');
    const body = await this.noteText(file);
    const data = this.dataLine(fm);
    if (!this.hasContent(body) && !data) return '';
    return `### ${r ? fechaLarga(r.start) : file.basename}${fm.alias ? ` — ${fm.alias}` : ''}\n${data ? `[${data}]\n` : ''}${body}`;
  }

  budget() {
    return Math.floor(this.settings.numCtx * 2.4);
  }
  /** Junta las fuentes de un periodo: resúmenes del nivel inferior si existen; si no, baja hasta los diarios. */
  async sourcesText(level, start, end) {
    const child = CHILD[level];
    const parts = [];
    const covered = [];
    if (child !== 'daily') {
      for (const { file, range } of this.filesIn(child, start, end)) {
        const s = this.fm(file)[SUMMARY_FIELD[child]];
        let text = '';
        if (s && String(s).trim()) text = String(s).trim();
        else text = await this.sourcesText(child, moment.max(range.start, start), moment.min(range.end, end));
        if (this.hasContent(text)) {
          parts.push(`### ${this.labelOf(file, child)}\n${text}`);
          covered.push(range);
        }
      }
    }
    // Días que no quedaron cubiertos por un resumen del nivel inferior
    for (const d of this.dailiesIn(start, end)) {
      if (covered.some((r) => d.date.isBetween(r.start, r.end, 'day', '[]'))) continue;
      const ctx = await this.dailyContext(d.file);
      if (ctx) parts.push(ctx);
    }
    return this.fitBudget(parts, this.budget());
  }
  async fitBudget(parts, budget) {
    const total = parts.join('\n\n');
    if (total.length <= budget) return total;
    const per = Math.max(500, Math.floor(budget / parts.length));
    const out = [];
    for (const part of parts) {
      if (part.length <= per) {
        out.push(part);
        continue;
      }
      const [head, ...rest] = part.split('\n');
      const s = await this.chat({
        tier: 'fast',
        temperature: 0.2,
        label: 'Condensando notas',
        prompt: `Resume este fragmento de mi diario en máximo ${Math.max(40, Math.round(per / 7))} palabras. Conserva fechas, nombres, números y hechos concretos. Solo el resumen, sin introducción.\n\n${rest.join('\n')}`,
      });
      out.push(`${head}\n${s}`);
    }
    const joined = out.join('\n\n');
    return joined.length > budget * 1.3 ? joined.slice(0, Math.floor(budget * 1.3)) : joined;
  }

  // ───────────── Estadísticas de un periodo ─────────────
  async trainingOf(file) {
    const cached = this.trainingCache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime) return cached.ex;
    const ex = parseTraining(await this.app.vault.cachedRead(file));
    this.trainingCache.set(file.path, { mtime: file.stat.mtime, ex });
    return ex;
  }
  isSession(fm, exercises) {
    const tipo = String(fm.entreno || '').trim();
    if (/descanso/i.test(tipo)) return false;
    return !!tipo || exercises.length > 0;
  }
  async sessionsIn(start, end) {
    const out = [];
    for (const d of this.dailiesIn(start, end)) {
      const exercises = await this.trainingOf(d.file);
      if (!this.isSession(d.fm, exercises)) continue;
      out.push({
        file: d.file,
        date: d.date,
        tipo: String(d.fm.entreno || 'Entrenamiento'),
        duracion: num(d.fm.duracion),
        rpe: num(d.fm.rpe),
        exercises,
        volume: sum(exercises.map((e) => e.volume)),
      });
    }
    return out;
  }
  /** Marcas personales: recorre todo el historial y marca las que se superaron dentro del rango. */
  async personalRecords(start, end) {
    const best = new Map();
    const prs = [];
    const all = await this.sessionsIn(moment('2000-01-01'), end);
    for (const s of all) {
      for (const ex of s.exercises) {
        const m = bestMetric(ex);
        if (!m) continue;
        const prev = best.get(ex.key);
        const comparable = !prev || prev.kind === m.kind;
        if (prev && comparable && m.value > prev.value + 1e-9 && s.date.isBetween(start, end, 'day', '[]')) {
          prs.push({ name: ex.name, date: s.date, file: s.file, label: m.label, prev: prev.label });
        }
        if (!prev || (comparable && m.value > prev.value) || (!comparable && m.kind === 'e1rm')) {
          best.set(ex.key, { value: m.value, kind: m.kind, label: m.label, name: ex.name, date: s.date, file: s.file, count: (prev?.count || 0) + 1 });
        } else {
          prev.count = (prev.count || 0) + 1;
        }
      }
    }
    return { prs, best };
  }
  async stats(start, end) {
    const days = this.dailiesIn(start, end);
    const sessions = await this.sessionsIn(start, end);
    const habits = {};
    for (const h of this.settings.habits) {
      const vals = days.map((d) => d.fm.habitos?.[h.key]).filter((v) => v !== undefined && v !== null);
      habits[h.key] = { label: h.label, done: vals.filter((v) => v === true).length, total: days.length };
    }
    const types = {};
    for (const s of sessions) types[s.tipo] = (types[s.tipo] || 0) + 1;
    return {
      days: days.length,
      rating: avg(days.map((d) => num(d.fm.valoracion))),
      animo: avg(days.map((d) => num(d.fm.animo))),
      energia: avg(days.map((d) => num(d.fm.energia))),
      sueno: avg(days.map((d) => num(d.fm.sueno))),
      peso: avg(days.map((d) => num(d.fm.peso))),
      estudio: sum(days.map((d) => num(d.fm.horasEstudio))),
      sesiones: sessions.length,
      minutos: sum(sessions.map((s) => s.duracion)),
      rpe: avg(sessions.map((s) => s.rpe)),
      volumen: sum(sessions.map((s) => s.volume)),
      types,
      habits,
    };
  }
  statsText(st) {
    const l = [];
    l.push(`- Días con nota: ${st.days}`);
    if (st.rating !== null) l.push(`- Valoración promedio: ${fmtNum(st.rating)}/10`);
    if (st.animo !== null) l.push(`- Ánimo promedio: ${fmtNum(st.animo)}/5 · Energía: ${fmtNum(st.energia)}/5`);
    if (st.sueno !== null) l.push(`- Sueño promedio: ${fmtNum(st.sueno)} h`);
    if (st.peso !== null) l.push(`- Peso promedio: ${fmtNum(st.peso)} kg`);
    if (st.estudio) l.push(`- Horas de estudio: ${fmtNum(st.estudio)}`);
    l.push(`- Sesiones de entrenamiento: ${st.sesiones}${st.minutos ? ` (${fmtNum(st.minutos, 0)} min)` : ''}${st.rpe !== null ? `, RPE promedio ${fmtNum(st.rpe)}` : ''}`);
    if (Object.keys(st.types).length) l.push(`- Tipos de entrenamiento: ${Object.entries(st.types).map(([k, v]) => `${k} ×${v}`).join(', ')}`);
    const hab = Object.values(st.habits).filter((h) => h.total);
    if (hab.length) l.push(`- Hábitos: ${hab.map((h) => `${h.label.replace(/^\S+\s/, '')} ${h.done}/${h.total}`).join(', ')}`);
    return l.join('\n');
  }

  // ───────────── IA: diario ─────────────
  async dailyRate({ rating = false, alias = false }) {
    const file = this.activeFile();
    if (this.levelOf(file) !== 'daily') throw new Error('Esto funciona en una nota diaria.');
    const ctx = await this.dailyContext(file, { withRating: false });
    if (!ctx) throw new Error('Tu día está vacío: escribe algo primero 🙂');
    const props = {};
    const req = [];
    const task = [];
    if (rating) {
      props.puntaje = { type: 'integer', minimum: 1, maximum: 10 };
      props.motivo = { type: 'string' };
      req.push('puntaje', 'motivo');
      task.push('- "puntaje": nota del 1 al 10 para el día (1 = terrible, 5 = normal, 10 = perfecto). Sé honesto: pesa logros, ánimo, energía, sueño, entrenamiento y estudio.');
      task.push('- "motivo": 1 o 2 frases explicando la nota, hablándome de tú.');
    }
    if (alias) {
      props.momentos = { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 };
      req.push('momentos');
      task.push('- "momentos": exactamente 3 momentos o actividades clave del día, de 2 a 4 palabras cada uno, usando palabras del texto.');
    }
    const out = await this.chat({
      tier: 'fast',
      temperature: 0.3,
      label: rating && alias ? 'Valorando y titulando tu día' : rating ? 'Valorando tu día' : 'Titulando tu día',
      schema: { type: 'object', properties: props, required: req },
      prompt: `Analiza este día de mi diario y responde en JSON con:\n${task.join('\n')}\n\nDÍA:\n${ctx}`,
    });
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (rating && out.puntaje !== undefined) {
        fm.valoracion = clamp(Math.round(num(out.puntaje) || 5), 1, 10);
        fm.motivoValoracion = String(out.motivo || '').trim();
      }
      if (alias && Array.isArray(out.momentos)) fm.alias = out.momentos.map(cap).filter(Boolean).join(' · ');
    });
    const msg = [rating && `⭐ ${out.puntaje}/10 — ${out.motivo}`, alias && `🏷️ ${(out.momentos || []).join(' · ')}`].filter(Boolean).join('\n');
    new Notice(msg, 8000);
  }

  // ───────────── IA: preguntas y respuestas ─────────────
  async trainingLogText(start, end) {
    const sessions = await this.sessionsIn(start, end);
    if (!sessions.length) return 'Sin sesiones de entrenamiento.';
    return sessions
      .map((s) => {
        const extra = [s.duracion ? `${s.duracion} min` : '', s.rpe ? `RPE ${s.rpe}` : ''].filter(Boolean).join(', ');
        const ex = s.exercises.map((e) => `${e.name} ${e.raw}`).join('; ');
        return `- ${fechaLarga(s.date)}: ${s.tipo}${extra ? ` (${extra})` : ''}${ex ? ` → ${ex}` : ''}`;
      })
      .join('\n');
  }
  async prText(start, end) {
    const { prs } = await this.personalRecords(start, end);
    if (!prs.length) return 'Ninguna marca nueva.';
    return prs.map((p) => `- ${fechaLarga(p.date)}: ${p.name} ${p.label} (antes ${p.prev})`).join('\n');
  }
  /** Sección de números calculada por código (la IA no la escribe, así no se equivoca). */
  numbersMarkdown(st) {
    const l = [];
    const train = [`${st.sesiones} sesiones`];
    if (st.minutos) train.push(`${fmtNum(st.minutos, 0)} min`);
    if (st.rpe !== null) train.push(`RPE ${fmtNum(st.rpe)}`);
    if (st.volumen) train.push(`${fmtNum(st.volumen / 1000, 1)} t de volumen`);
    l.push(`- 🏋️ ${train.join(' · ')}`);
    if (st.estudio) l.push(`- 📚 ${fmtNum(st.estudio)} h de estudio`);
    if (st.sueno !== null) l.push(`- 😴 ${fmtNum(st.sueno)} h de sueño promedio`);
    if (st.animo !== null) l.push(`- 🙂 Ánimo ${fmtNum(st.animo)}/5` + (st.energia !== null ? ` · ⚡ energía ${fmtNum(st.energia)}/5` : ''));
    if (st.rating !== null) l.push(`- ⭐ Valoración ${fmtNum(st.rating)}/10`);
    const hab = Object.values(st.habits).filter((h) => h.total && h.done);
    if (hab.length) l.push('- ✅ ' + hab.map((h) => `${h.label} ${h.done}/${h.total}`).join(' · '));
    return `**📊 En números**\n${l.join('\n')}`;
  }
  async contextFor(file) {
    const level = this.levelOf(file);
    if (level === 'daily') return this.dailyContext(file);
    const r = this.rangeOf(file, level);
    if (!r) throw new Error('No entiendo el nombre de esta nota.');
    const own = this.fm(file)[SUMMARY_FIELD[level]];
    const sources = await this.sourcesText(level, r.start, r.end);
    const st = this.statsText(await this.stats(r.start, r.end));
    const log = await this.trainingLogText(r.start, r.end);
    const prs = await this.prText(r.start, r.end);
    return (
      (own ? `RESUMEN YA ESCRITO:\n${own}\n\n` : '') +
      `DATOS:\n${st}\n\nENTRENAMIENTO (registro exacto):\n${log}\n\nMARCAS PERSONALES:\n${prs}\n\nNOTAS:\n${sources}`
    );
  }
  /** Sin `question`: lee pregunta del frontmatter y escribe respuesta. Con `question`: solo devuelve la respuesta. */
  async qa(question) {
    let file;
    try {
      file = this.activeFile();
    } catch (e) {
      new Notice(e.message);
      return { success: false, error: e.message };
    }
    const write = question === undefined || question === null;
    const q = String(write ? this.fm(file).pregunta || '' : question).trim();
    if (!q) {
      new Notice('Escribe una pregunta primero.');
      return { success: false, error: 'Sin pregunta' };
    }
    const level = this.levelOf(file) || 'daily';
    try {
      const ctx = await this.contextFor(file);
      if (!this.hasContent(ctx)) throw new Error(`No hay notas en ${LEVEL_THIS[level]} para responder.`);
      const answer = await this.chat({
        tier: level === 'daily' ? 'fast' : 'deep',
        temperature: 0.2,
        label: 'Buscando en tus notas',
        system:
          `${this.systemPrompt()}\nEres la memoria de ${LEVEL_THIS[level]}. Responde solo con lo que aparece en el contexto; si no está, dilo claramente. ` +
          'Copia fechas y números exactamente como aparecen. Para preguntas de entrenamiento usa la sección ENTRENAMIENTO. Responde en 2 a 5 frases, sin títulos ni preguntas de seguimiento.',
        prompt: `PREGUNTA: ${q}\n\nCONTEXTO DE ${LEVEL_THIS[level].toUpperCase()}:\n${ctx}`,
      });
      if (write) {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          fm.respuesta = answer;
          delete fm.pregunta;
        });
      }
      return { success: true, answer };
    } catch (e) {
      if (write) {
        new Notice(`❌ ${e.message}`, 8000);
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          fm.respuesta = `Error: ${e.message}`;
        });
      }
      return { success: false, error: e.message };
    }
  }

  // ───────────── IA: resúmenes, títulos, rueda de la vida, revisión anual ─────────────
  periodFile(level) {
    const file = this.activeFile();
    const actual = this.levelOf(file);
    if (actual !== level) throw new Error(`Esto funciona en una nota de ${LEVEL_NAME[level]}.`);
    const r = this.rangeOf(file, level);
    if (!r) throw new Error('No entiendo el nombre de esta nota.');
    return { file, r };
  }
  summaryInstructions(level) {
    const common =
      'Usa markdown. Nada genérico: nombra eventos, personas, lugares, ejercicios y ramos concretos. No inventes. NO escribas una sección de números ni estadísticas: esa la agrego yo.';
    if (level === 'weekly')
      return `Escribe el resumen de mi semana con estas secciones:\n**Día a día**: una viñeta por día con su fecha y lo más importante (omite días sin notas).\n**Lo clave de la semana**: 3 a 6 viñetas con avances y momentos concretos.\n**Para la próxima semana**: 1 a 3 sugerencias concretas basadas en lo anterior.\n${common}`;
    if (level === 'monthly')
      return `Escribe el resumen de mi mes con estas secciones:\n**En pocas palabras**: 2-3 frases.\n**Semana a semana**: una viñeta por semana.\n**Logros**, **Entrenamiento y salud**, **Estudios y trabajo**, **Relaciones y vida social** (omite las que no tengan información).\n**Para el próximo mes**: 2-3 focos concretos.\n${common}`;
    if (level === 'quarterly')
      return `Escribe el resumen de mi trimestre con estas secciones:\n**En pocas palabras**, **Mes a mes** (una viñeta por mes), **Mayores logros**, **Patrones que se repiten**, **Entrenamiento y salud**, **Estudios y trabajo**, **Foco para el próximo trimestre**.\n${common}`;
    return `Escribe el resumen de mi año con estas secciones:\n**El año en una frase**, **Trimestre a trimestre**, **Los momentos que marcaron el año**, **Lo que aprendí**, **Entrenamiento y salud**, **Estudios y carrera**, **Personas importantes**.\n${common}`;
  }
  async summarize(level) {
    const { file, r } = this.periodFile(level);
    const sources = await this.sourcesText(level, r.start, r.end);
    if (!this.hasContent(sources)) throw new Error(`No encontré notas dentro de ${LEVEL_THIS[level]}.`);
    const stats = await this.stats(r.start, r.end);
    const log = await this.trainingLogText(r.start, r.end);
    const out = await this.chat({
      tier: 'deep',
      temperature: 0.4,
      label: `Resumiendo ${LEVEL_THIS[level]}`,
      prompt: `${this.summaryInstructions(level)}\n\nPERIODO: ${this.labelOf(file, level)}\n\nENTRENAMIENTO (registro exacto):\n${log}\n\nNOTAS:\n${sources}`,
    });
    // Si igual escribió una sección de números, se quita: la nuestra es la exacta.
    const clean = out.replace(/(^|\n)(#+\s*)?\**\s*(📊\s*)?En números\s*\**:?[\s\S]*?(?=\n(#+\s|\*\*)|$)/i, '$1').trim();
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[SUMMARY_FIELD[level]] = `${this.numbersMarkdown(stats)}\n\n${clean}`;
    });
    new Notice(`✅ Resumen de ${LEVEL_THIS[level]} listo`);
  }
  async periodAlias(level) {
    const { file, r } = this.periodFile(level);
    const own = this.fm(file)[SUMMARY_FIELD[level]];
    const sources = own && String(own).trim() ? String(own) : await this.sourcesText(level, r.start, r.end);
    if (!this.hasContent(sources)) throw new Error(`No encontré notas dentro de ${LEVEL_THIS[level]}.`);
    const out = await this.chat({
      tier: 'fast',
      temperature: 0.6,
      label: `Titulando ${LEVEL_THIS[level]}`,
      schema: { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'] },
      prompt: `Crea un título para ${LEVEL_THIS[level]} de mi diario, de máximo 12 palabras, nombrando 2 o 3 eventos o actividades CONCRETAS (lugares, proyectos, ramos, ejercicios). Prohibido usar frases genéricas como "una semana de", "navegando" o "un mes lleno de". Responde en JSON con "titulo".\n\nCONTENIDO:\n${sources}`,
    });
    const titulo = cap(String(out.titulo || '').replace(/^["'«]|["'»]$/g, ''));
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.alias = titulo;
    });
    new Notice(`🏷️ ${titulo}`);
  }
  /** Puntaje de referencia calculado con datos (sueño, energía, sesiones, ánimo). */
  areaHints(st) {
    const h = {};
    const salud = avg([st.sueno !== null ? (st.sueno - 4) * 2 : null, st.energia !== null ? st.energia * 2 : null]);
    if (salud !== null) h.salud = { score: clamp(Math.round(salud), 1, 10), why: `sueño promedio ${fmtNum(st.sueno)} h, energía ${fmtNum(st.energia)}/5` };
    const meta = this.settings.metaSesionesSemana;
    if (st.days) {
      const score = clamp(Math.round((st.sesiones / meta) * 8 + (st.sesiones >= meta ? 2 : 0)), 1, 10);
      h.entrenamiento = { score, why: `${st.sesiones} de ${meta} sesiones de la meta semanal` };
    }
    if (st.animo !== null) h.mente = { score: clamp(Math.round(st.animo * 2), 1, 10), why: `ánimo promedio ${fmtNum(st.animo)}/5` };
    return h;
  }
  async wheelOfLife() {
    const { file, r } = this.periodFile('weekly');
    const sources = await this.sourcesText('weekly', r.start, r.end);
    if (!this.hasContent(sources)) throw new Error('No encontré notas diarias en esta semana.');
    const stats = await this.stats(r.start, r.end);
    const hints = this.areaHints(stats);
    const areas = this.settings.wheelAreas;
    // Un área por llamada (un modelo chico se enfoca mejor). El prefijo es idéntico en todas,
    // así Ollama reutiliza el contexto ya procesado y cada área sale más rápido.
    const log = await this.trainingLogText(r.start, r.end);
    const base = `NOTAS DE MI SEMANA:\n${sources}\n\nDATOS:\n${this.statsText(stats)}\n\nENTRENAMIENTO:\n${log}`;
    const schema = {
      type: 'object',
      properties: { puntaje: { type: 'integer', minimum: 1, maximum: 10 }, resumen: { type: 'string' } },
      required: ['puntaje', 'resumen'],
    };
    const results = {};
    for (const [i, a] of areas.entries()) {
      const hint = hints[a.key];
      const out = await this.chat({
        tier: 'fast',
        temperature: 0.3,
        label: `Rueda de la Vida: ${a.label} (${i + 1}/${areas.length})`,
        schema,
        prompt:
          `${base}\n\nEvalúa SOLO el área "${a.emoji} ${a.label}" (${a.desc}) de mi semana. Responde en JSON:\n` +
          '- "puntaje": de 1 a 10 usando toda la escala (1-3 mala, 4-6 regular, 7-8 buena, 9-10 excelente). Si las notas no dicen nada de esta área, pon 5.\n' +
          '- "resumen": 2 o 3 frases hablándome de tú, citando hechos concretos de las notas sobre esta área y terminando con una sugerencia breve. No hables de otras áreas.' +
          (hint ? `\nReferencia según mis datos: ${hint.why} → cerca de ${hint.score}.` : ''),
      });
      let score = clamp(Math.round(num(out.puntaje) || 5), 1, 10);
      if (hint) score = clamp(Math.round((score + hint.score) / 2), 1, 10);
      results[a.key] = { score, resumen: String(out.resumen || '').trim() };
    }
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      const w = fm.rueda && typeof fm.rueda === 'object' ? fm.rueda : {};
      for (const a of areas) {
        if (!results[a.key]) continue;
        w[a.key] = results[a.key].score;
        w[`${a.key}Resumen`] = results[a.key].resumen;
      }
      fm.rueda = w;
    });
    new Notice('🌟 Rueda de la Vida actualizada');
  }
  async yearReview() {
    const { file, r } = this.periodFile('yearly');
    const sources = await this.sourcesText('yearly', r.start, r.end);
    if (!this.hasContent(sources)) throw new Error('No encontré notas en este año.');
    const st = this.statsText(await this.stats(r.start, r.end));
    const { prs } = await this.personalRecords(r.start, r.end);
    const prText = prs.length ? prs.slice(-15).map((p) => `- ${p.name}: ${p.label} (${fechaCorta(p.date)})`).join('\n') : 'sin registros';
    const out = await this.chat({
      tier: 'deep',
      temperature: 0.6,
      label: 'Escribiendo tu revisión del año',
      maxTokens: 2200,
      prompt: `Escribe una revisión profunda de mi año en markdown, como un buen mentor que me conoce. Secciones: **Lo mejor del año**, **Logros concretos**, **Desafíos y cómo los enfrenté**, **Entrenamiento** (usa las marcas personales), **Estudios y carrera**, **Patrones que noté** (relaciona sueño, ánimo, entrenamiento y estudio), **3 intenciones para el próximo año**. No inventes nada.\n\nDATOS:\n${st}\n\nMARCAS PERSONALES:\n${prText}\n\nNOTAS:\n${sources}`,
    });
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.revision = out;
    });
    new Notice('🔭 Revisión del año lista');
  }
  async smartSummarize() {
    const file = this.activeFile();
    const level = this.levelOf(file);
    if (level === 'daily') return this.dailyRate({ rating: true, alias: true });
    if (level) return this.summarize(level);
    throw new Error('Abre una nota diaria, semanal, mensual, trimestral o anual.');
  }

  // ───────────── Entrenamiento ─────────────
  async insertRoutine() {
    const file = this.activeFile();
    if (this.levelOf(file) !== 'daily') throw new Error('Abre una nota diaria para cargar la rutina.');
    const folder = `${this.settings.folders.training}/Rutinas/`;
    const routines = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder));
    if (!routines.length) throw new Error(`No hay rutinas en "${folder}". Crea una con "Raíz: Nueva rutina de entrenamiento".`);
    const routine = await new Promise((resolve) => new FilePicker(this.app, routines, 'Elige una rutina…', resolve).open());
    if (!routine) return;
    const date = this.rangeOf(file, 'daily').start;
    const exercises = parseTraining((await this.app.vault.cachedRead(routine)).replace(/^## Ejercicios/m, '## Entrenamiento'));
    if (!exercises.length) throw new Error('La rutina no tiene ejercicios en su sección "## Ejercicios".');
    // Última vez que hiciste cada ejercicio → para progresar sobre eso
    const history = await this.sessionsIn(date.clone().subtract(180, 'days'), date.clone().subtract(1, 'day'));
    const last = new Map();
    for (const s of history) for (const ex of s.exercises) last.set(ex.key, { raw: ex.raw, date: s.date });
    const lines = exercises.map((ex) => {
      const prev = last.get(ex.key);
      return `- ${ex.name}: ${prev ? prev.raw : ex.raw}`;
    });
    const withHistory = exercises.filter((ex) => last.has(ex.key)).length;
    if ((await this.app.vault.read(file)).includes('%% /ejercicios %%')) {
      const sesion = this.sesionOf(this.fm(file));
      for (const ex of exercises) {
        const prev = last.get(ex.key);
        sesion.push({ ejercicio: ex.name, series: this.expandSets(prev ? prev.raw : ex.raw) });
      }
      await this.saveSesion(file, sesion);
      const tipoR = this.fm(routine).entreno || routine.basename;
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        if (!fm.entreno) fm.entreno = tipoR;
        fm.rutina = `[[${routine.basename}]]`;
      });
      new Notice(`🏋️ ${routine.basename} cargada.${withHistory ? `\n${withHistory} ejercicio(s) con tu última marca: ¡súbele un poco!` : ''}`, 7000);
      return;
    }
    await this.app.vault.process(file, (data) => {
      const marker = data.indexOf('%% ejercicios %%');
      const block = lines.join('\n') + '\n';
      if (marker !== -1) return data.slice(0, marker) + block + data.slice(marker);
      const h = data.search(/^#{1,6} .*Entrenamiento.*$/m);
      if (h !== -1) {
        const eol = data.indexOf('\n', h);
        return data.slice(0, eol + 1) + block + data.slice(eol + 1);
      }
      return data + `\n### 🏋️ Entrenamiento\n${block}`;
    });
    const tipo = this.fm(routine).entreno || routine.basename;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (!fm.entreno) fm.entreno = tipo;
      fm.rutina = `[[${routine.basename}]]`;
    });
    new Notice(`🏋️ ${routine.basename} cargada.${withHistory ? `\n${withHistory} ejercicio(s) con tu última marca: ¡súbele un poco!` : ''}`, 7000);
  }
  async trainingCoach() {
    const file = this.activeFile();
    const end = moment().endOf('day');
    const start = end.clone().subtract(28, 'days').startOf('day');
    const sessions = await this.sessionsIn(start, end);
    if (!sessions.length) throw new Error('No hay sesiones registradas en las últimas 4 semanas.');
    const { prs } = await this.personalRecords(start, end);
    const st = await this.stats(start, end);
    const log = sessions
      .map((s) => `${fechaCorta(s.date)} · ${s.tipo}${s.duracion ? ` · ${s.duracion} min` : ''}${s.rpe ? ` · RPE ${s.rpe}` : ''}\n${s.exercises.map((e) => `  - ${e.name}: ${e.raw}`).join('\n')}`)
      .join('\n');
    const out = await this.chat({
      tier: 'deep',
      temperature: 0.5,
      label: 'Tu coach está revisando el entrenamiento',
      system: `${this.systemPrompt()}\nActúa como un entrenador de fuerza y calistenia con criterio basado en evidencia. Sé directo y práctico.`,
      prompt: `Revisa mis últimas 4 semanas de entrenamiento y entrégame en markdown:\n**Cómo vas** (2-3 frases), **Progresos** (ejercicios que subieron), **Estancados o en riesgo** (ejercicios sin progreso, fatiga por RPE alto, desequilibrio empuje/tirón/pierna), **Plan para la próxima semana** (3-5 acciones concretas: cargas, series o reps sugeridas; considera si toca descarga).\nMeta: ${this.settings.metaSesionesSemana} sesiones por semana.\n\nDATOS:\n${this.statsText(st)}\n\nMARCAS NUEVAS:\n${prs.map((p) => `- ${p.name}: ${p.label} (antes ${p.prev})`).join('\n') || 'ninguna'}\n\nREGISTRO:\n${log}`,
    });
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.coach = out;
      fm.coachFecha = isoDate(moment());
    });
    new Notice('🧠 Coach listo');
  }

  // ───────────── Creación de notas ─────────────
  async fromTemplate(name, vars) {
    const path = `${this.settings.folders.templates}/${name}.md`;
    const tpl = this.app.vault.getAbstractFileByPath(path);
    if (!(tpl instanceof TFile)) throw new Error(`No encuentro la plantilla "${path}".`);
    const text = await this.app.vault.read(tpl);
    return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
  }
  async createNote(folder, name, content, open = true) {
    const dir = folder.replace(/\/+$/, '');
    await this.ensureFolder(dir);
    let path = `${dir}/${safeName(name)}.md`;
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(path)) path = `${dir}/${safeName(name)} ${i++}.md`;
    const file = await this.app.vault.create(path, content);
    if (open) await this.app.workspace.getLeaf(false).openFile(file);
    return file;
  }
  async ensureFolder(dir) {
    const parts = dir.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('/');
      if (!this.app.vault.getAbstractFileByPath(p)) await this.app.vault.createFolder(p);
    }
  }
  currentSemester() {
    if (this.settings.semestreActual) return this.settings.semestreActual;
    const now = moment();
    return `${now.year()}-${now.month() < 7 ? 1 : 2}`;
  }
  newCourse() {
    new FormModal(
      this.app,
      '🎓 Nueva asignatura',
      [
        { key: 'nombre', label: 'Nombre', required: true, placeholder: 'Ej: Ingeniería de Software' },
        { key: 'codigo', label: 'Código', placeholder: 'Ej: INF-322' },
        { key: 'semestre', label: 'Semestre', value: this.currentSemester(), placeholder: '2026-2' },
        { key: 'profesor', label: 'Profesor/a' },
        { key: 'horario', label: 'Horario', type: 'textarea', desc: 'Un bloque por línea: "Lun 08:15-09:45 | Sala A-12"', placeholder: 'Lun 08:15-09:45 | Sala A-12\nMié 10:00-11:30 | Lab 3' },
        { key: 'notaAprobacion', label: 'Nota de aprobación', value: String(this.settings.notaAprobacion) },
      ],
      (v) =>
        this.run(async () => {
          const horario = String(v.horario || '')
            .split(/\n|;/)
            .map((s) => s.trim())
            .filter(Boolean);
          const content = await this.fromTemplate('Asignatura', {
            nombre: v.nombre.trim(),
            codigo: v.codigo.trim(),
            semestre: v.semestre.trim(),
            profesor: v.profesor.trim(),
            notaAprobacion: num(v.notaAprobacion) ?? this.settings.notaAprobacion,
            horarioYaml: horario.length ? horario.map((h) => `  - "${h.replace(/"/g, "'")}"`).join('\n') : '  - ',
          });
          await this.createNote(`${this.settings.folders.academic}/Asignaturas/${v.semestre.trim()}`, v.nombre, content);
        })
    ).open();
  }
  newEvent(preset = {}, onCreated) {
    new FormModal(
      this.app,
      '📅 Nuevo evento o reunión',
      [
        { key: 'titulo', label: 'Título', required: true, placeholder: 'Ej: Reunión de proyecto', value: preset.titulo || '' },
        { key: 'fecha', label: 'Fecha', type: 'date', value: isoDate(moment()) },
        { key: 'hora', label: 'Hora', type: 'time', value: '' },
        { key: 'categoria', label: 'Tipo', type: 'select', options: ['Reunión', 'Evento', 'Universidad', 'Trabajo', 'Cumpleaños', 'Salud', 'Trámite', 'Viaje', 'Otro'] },
        { key: 'lugar', label: 'Lugar / link' },
        { key: 'participantes', label: 'Con quién' },
      ],
      (v) =>
        this.run(async () => {
          const fecha = moment(v.fecha, 'YYYY-MM-DD', true).isValid() ? moment(v.fecha, 'YYYY-MM-DD') : moment();
          const content = await this.fromTemplate('Evento', {
            titulo: v.titulo.trim(),
            fecha: isoDate(fecha),
            fechaLarga: fechaLarga(fecha),
            diaNota: fecha.format('YYYY-MM-DD-dddd'),
            hora: v.hora,
            categoria: v.categoria,
            lugar: v.lugar.trim(),
            participantes: v.participantes.trim(),
          });
          await this.createNote(`${this.settings.folders.agenda}/${fecha.year()}`, `${isoDate(fecha)} ${v.titulo}`, content);
          onCreated?.();
        })
    ).open();
  }
  newRoutine() {
    new FormModal(
      this.app,
      '🏋️ Nueva rutina',
      [
        { key: 'nombre', label: 'Nombre', required: true, placeholder: 'Ej: Empuje A' },
        { key: 'tipo', label: 'Tipo', type: 'select', options: this.settings.trainingTypes.filter((t) => !/descanso/i.test(t)) },
      ],
      (v) =>
        this.run(async () => {
          const content = await this.fromTemplate('Rutina', { nombre: v.nombre.trim(), tipo: v.tipo });
          await this.createNote(`${this.settings.folders.training}/Rutinas`, v.nombre, content);
        })
    ).open();
  }
  async openToday() {
    let file = this.dailyFor(moment());
    if (!file) {
      const m = moment(); // mismo idioma que usa Journals para nombrar carpetas y notas
      const dir = `${this.settings.folders.daily}/${m.format('YYYY')}/${m.format('MM-MMMM')}`;
      await this.ensureFolder(dir);
      file = await this.app.vault.create(`${dir}/${m.format('YYYY-MM-DD-dddd')}.md`, '');
    }
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  // ───────────── Fragmentos para plantillas ─────────────
  habitsFrontmatter() {
    return 'habitos:\n' + this.settings.habits.map((h) => `  ${h.key}: false`).join('\n');
  }
  habitsBlock() {
    return this.settings.habits.map((h) => `- \`INPUT[toggle:habitos.${h.key}]\` ${h.label}`).join('\n');
  }
  trainingBlock() {
    return [
      '```dataviewjs',
      'if (window.raiz) await window.raiz.charts.workout(dv, this.container); else dv.paragraph("Cargando Raíz…");',
      '```',
      '%% Registro automático del widget (también puedes escribir líneas a mano fuera de los marcadores: "- Press banca: 4x8 @ 60kg") %%',
      '%% ejercicios %%',
      '%% /ejercicios %%',
    ].join('\n');
  }
  wheelFrontmatter() {
    return 'rueda:\n' + this.settings.wheelAreas.map((a) => `  ${a.key}: \n  ${a.key}Resumen: ""`).join('\n');
  }
  wheelDisplay() {
    return this.settings.wheelAreas
      .map(
        (a) =>
          `#### <span style="color: ${a.color}; font-weight: bold;">${a.emoji} ${a.label}</span> | \`INPUT[number(class(raiz-num-center)):rueda.${a.key}]\` | \`INPUT[slider(minValue(1), maxValue(10)):rueda.${a.key}]\`\n` +
          `\`VIEW[{rueda.${a.key}Resumen}][text(renderMarkdown)]\``
      )
      .join('\n\n');
  }

  // ───────────── Gráficos y paneles (dataviewjs) ─────────────
  buildCharts() {
    const p = this;
    const wrap = (fn) =>
      async function (dv, container, input) {
        container = container || input?.container;
        try {
          await fn.call(p, dv, container, input || {});
        } catch (e) {
          console.error('[Raíz]', e);
          container.createEl('p', { cls: 'raiz-error', text: `⚠️ ${e.message}` });
        }
      };
    const rating = wrap(this.ratingChart);
    const wheel = wrap(this.wheelChart);
    const prog = wrap(this.wheelProgression);
    const table = wrap(this.periodTable);
    return {
      ratingChart: rating,
      wheelChart: wheel,
      wheelProgression: prog,
      periodTable: table,
      periodLogs: wrap(this.periodLogs),
      gallery: wrap(this.gallery),
      throwback: wrap(this.throwback),
      bestDays: wrap(this.bestDays),
      dailyToday: wrap(this.dailyToday),
      periodTraining: wrap(this.periodTraining),
      periodHabits: wrap(async function (dv, c, i) {
        await this.periodHabits(dv, c, i);
        await this.periodGoals(dv, c, i);
      }),
      goals: wrap(this.goals),
      periodGoals: wrap(this.periodGoals),
      monthCalendar: wrap(this.monthCalendar),
      trainingDashboard: wrap(this.trainingDashboard),
      academicDashboard: wrap(this.academicDashboard),
      courseStatus: wrap(this.courseStatus),
      agenda: wrap(this.agendaView),
      home: wrap(this.home),
      hub: wrap(this.hub),
      activity: wrap(async function (dv, c) { await this.activityHeatmap(c); }),
      pageHeader: wrap(this.pageHeader),
      pageCard: wrap(this.pageCard),
      topicTable: wrap(this.topicTable),
      library: wrap(this.library),
      mediaHero: wrap(this.mediaHero),
      workout: wrap(this.workout),
      moc: wrap(this.moc),
      knowledgeHome: wrap(this.knowledgeHome),
      inbox: wrap(this.inbox),
      tags: wrap(this.tagsPanel),
      review: wrap(this.review),
    };
  }
  currentOf(dv) {
    const f = this.app.vault.getAbstractFileByPath(dv.currentFilePath);
    if (!(f instanceof TFile)) throw new Error('No encuentro la nota actual.');
    return f;
  }
  currentRange(dv) {
    const file = this.currentOf(dv);
    const r = this.rangeOf(file);
    if (!r) throw new Error('Este bloque funciona en notas diarias, semanales, mensuales, trimestrales o anuales.');
    return Object.assign({ file }, r);
  }
  renderChart(container, config, height) {
    const holder = container.createDiv({ cls: 'raiz-chart' });
    if (height) holder.style.height = `${height}px`;
    if (typeof window.renderChart !== 'function') {
      holder.setText('Activa el plugin "Obsidian Charts" para ver este gráfico.');
      return;
    }
    config.options = Object.assign({ responsive: true, maintainAspectRatio: !height }, config.options || {});
    window.renderChart(config, holder);
  }
  heading(container, text) {
    return container.createEl('h4', { cls: 'raiz-h', text: deEmoji(text) });
  }
  link(container, file, text) {
    return container.createEl('a', {
      cls: 'internal-link raiz-link',
      text: text || file.basename,
      href: file.path,
      attr: { 'data-href': file.path, target: '_blank', rel: 'noopener' },
    });
  }
  kpis(container, items) {
    const row = container.createDiv({ cls: 'raiz-kpis' });
    for (const [label, value, sub] of items) {
      const k = row.createDiv({ cls: 'raiz-kpi' });
      k.createDiv({ cls: 'raiz-kpi-value', text: String(value) });
      k.createDiv({ cls: 'raiz-kpi-label', text: label });
      if (sub) k.createDiv({ cls: 'raiz-kpi-sub', text: sub });
    }
  }
  table(container, headers, rows) {
    const t = container.createEl('table', { cls: 'raiz-table' });
    const tr = t.createEl('thead').createEl('tr');
    for (const h of headers) tr.createEl('th', { text: h });
    const body = t.createEl('tbody');
    for (const row of rows) {
      const r = body.createEl('tr');
      for (const cell of row) {
        const td = r.createEl('td');
        if (typeof cell === 'function') cell(td);
        else td.setText(cell === null || cell === undefined ? '—' : String(cell));
      }
    }
    return t;
  }

  /** Subperiodos para gráficos: semanas de un mes, meses de un trimestre/año, días de una semana. */
  subPeriods(level, start, end) {
    const out = [];
    if (level === 'weekly') {
      for (let d = start.clone(); d.isSameOrBefore(end, 'day'); d.add(1, 'day'))
        out.push({ label: `${DIAS[d.isoWeekday() - 1]} ${d.date()}`, start: d.clone().startOf('day'), end: d.clone().endOf('day') });
    } else if (level === 'monthly') {
      let w = start.clone().startOf('isoWeek');
      while (w.isSameOrBefore(end, 'day')) {
        const thu = w.clone().add(3, 'days');
        if (thu.isBetween(start, end, 'day', '[]')) out.push({ label: `S${w.isoWeek()}`, start: w.clone(), end: w.clone().endOf('isoWeek') });
        w.add(1, 'week');
      }
    } else {
      for (let m = start.clone().startOf('month'); m.isSameOrBefore(end, 'day'); m.add(1, 'month'))
        out.push({ label: cap(MESES[m.month()].slice(0, 3)), start: m.clone(), end: m.clone().endOf('month') });
    }
    return out;
  }
  wheelValues(start, end) {
    const weeks = this.filesIn('weekly', start, end);
    const res = {};
    for (const a of this.settings.wheelAreas) {
      res[a.key] = avg(weeks.map((w) => num(this.fm(w.file).rueda?.[a.key])));
    }
    return res;
  }

  async ratingChart(dv, container) {
    const { level, start, end } = this.currentRange(dv);
    const days = this.dailiesIn(start, end);
    const rate = (s, e) => avg(days.filter((d) => d.date.isBetween(s, e, 'day', '[]')).map((d) => num(d.fm.valoracion)));
    let labels;
    let data;
    let type = 'bar';
    if (level === 'monthly' || level === 'quarterly') {
      type = 'line';
      labels = [];
      data = [];
      for (let d = start.clone(); d.isSameOrBefore(end, 'day'); d.add(1, 'day')) {
        labels.push(level === 'monthly' ? String(d.date()) : `${d.date()}/${d.month() + 1}`);
        data.push(rate(d.clone().startOf('day'), d.clone().endOf('day')));
      }
    } else {
      const subs = this.subPeriods(level, start, end);
      labels = subs.map((s) => s.label);
      data = subs.map((s) => r1(rate(s.start, s.end)));
    }
    if (!data.some((v) => v !== null)) {
      container.createEl('p', { cls: 'raiz-muted', text: 'Aún no hay valoraciones en este periodo.' });
      return;
    }
    this.renderChart(container, {
      type,
      data: {
        labels,
        datasets: [
          {
            label: 'Valoración',
            data,
            spanGaps: true,
            tension: 0.3,
            borderColor: '#8bc34a',
            backgroundColor: type === 'bar' ? data.map((v) => ratingColor(v, 0.7)) : 'rgba(139,195,74,0.2)',
            fill: type === 'line',
            borderRadius: 6,
          },
        ],
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 10, ticks: { stepSize: 2 } } } },
    });
  }

  radarConfig(datasets) {
    const areas = this.settings.wheelAreas;
    return {
      type: 'radar',
      data: { labels: areas.map((a) => `${a.emoji} ${a.label}`), datasets },
      options: {
        plugins: { legend: { display: datasets.length > 1 } },
        scales: { r: { min: 0, max: 10, ticks: { stepSize: 2, backdropColor: 'transparent' }, pointLabels: { font: { size: 11 } } } },
      },
    };
  }
  async wheelChart(dv, container) {
    const { file, level, start, end } = this.currentRange(dv);
    const areas = this.settings.wheelAreas;
    if (level === 'weekly') {
      const w = this.fm(file).rueda || {};
      const data = areas.map((a) => num(w[a.key]));
      if (!data.some((v) => v !== null)) {
        container.createEl('p', { cls: 'raiz-muted', text: 'Usa el botón de abajo para que la IA evalúe tu semana, o ponle nota tú mismo.' });
        return;
      }
      this.renderChart(container, this.radarConfig([{ label: 'Esta semana', data, backgroundColor: 'rgba(126,87,194,0.25)', borderColor: '#7e57c2', pointBackgroundColor: areas.map((a) => a.color) }]));
      return;
    }
    const subs = level === 'monthly' ? this.subPeriods('monthly', start, end) : level === 'quarterly' ? this.subPeriods('quarterly', start, end) : [0, 1, 2, 3].map((q) => {
      const s = start.clone().add(q, 'quarter');
      return { label: `T${q + 1}`, start: s, end: s.clone().endOf('quarter') };
    });
    const palette = ['#42a5f5', '#ef5350', '#66bb6a', '#ffa726', '#ab47bc', '#26a69a'];
    const datasets = subs
      .map((s, i) => {
        const v = this.wheelValues(s.start, s.end);
        return { label: s.label, data: areas.map((a) => r1(v[a.key])), borderColor: hexToRgba(palette[i % palette.length], 0.6), backgroundColor: 'transparent', borderWidth: 1, pointRadius: 2 };
      })
      .filter((d) => d.data.some((v) => v !== null));
    const total = this.wheelValues(start, end);
    if (!datasets.length) {
      container.createEl('p', { cls: 'raiz-muted', text: 'Aún no hay Ruedas de la Vida semanales en este periodo.' });
      return;
    }
    datasets.push({ label: 'Promedio', data: areas.map((a) => r1(total[a.key])), borderColor: '#7e57c2', backgroundColor: 'rgba(126,87,194,0.25)', borderWidth: 3 });
    this.renderChart(container, this.radarConfig(datasets));
  }
  async wheelProgression(dv, container) {
    const { file, level, start, end } = this.currentRange(dv);
    const areas = this.settings.wheelAreas;
    const type = String(this.fm(file).tipoGrafico || 'line').toLowerCase();
    if (type === 'radar') return this.wheelChart(dv, container);
    const total = this.wheelValues(start, end);
    if (type === 'pie') {
      this.renderChart(container, {
        type: 'pie',
        data: { labels: areas.map((a) => `${a.emoji} ${a.label}`), datasets: [{ data: areas.map((a) => r1(total[a.key]) || 0), backgroundColor: areas.map((a) => hexToRgba(a.color, 0.75)) }] },
      });
      return;
    }
    const subs = this.subPeriods(level === 'monthly' ? 'monthly' : 'yearly', start, end);
    const values = subs.map((s) => this.wheelValues(s.start, s.end));
    this.renderChart(container, {
      type: type === 'bar' ? 'bar' : 'line',
      data: {
        labels: subs.map((s) => s.label),
        datasets: areas.map((a) => ({ label: `${a.emoji} ${a.label}`, data: values.map((v) => r1(v[a.key])), borderColor: a.color, backgroundColor: hexToRgba(a.color, 0.6), tension: 0.3, spanGaps: true })),
      },
      options: { scales: { y: { min: 0, max: 10 } } },
    });
  }
  async periodTable(dv, container) {
    const { level, start, end } = this.currentRange(dv);
    const child = CHILD[level];
    if (child === 'daily') {
      const days = this.dailiesIn(start, end);
      if (!days.length) return container.createEl('p', { cls: 'raiz-muted', text: 'Aún no hay días en esta semana.' });
      return this.table(container, ['Día', 'Título', '⭐', '🏋️', '😴'], days.map((d) => [(td) => this.link(td, d.file, fechaCorta(d.date)), d.fm.alias || '—', num(d.fm.valoracion) ?? '—', d.fm.entreno || '—', num(d.fm.sueno) ?? '—']));
    }
    const rows = [];
    for (const { file, range } of this.filesIn(child, start, end)) {
      const st = await this.stats(range.start, range.end);
      rows.push([(td) => this.link(td, file, this.labelOf(file, child)), this.fm(file).alias || '', st.rating !== null ? `⭐ ${fmtNum(st.rating)}` : '—', `🏋️ ${st.sesiones}`, st.estudio ? `📚 ${fmtNum(st.estudio)} h` : '—']);
    }
    if (!rows.length) {
      container.createEl('p', { cls: 'raiz-muted', text: `Aún no hay notas de ${LEVEL_NAME[child]} en este periodo.` });
      return;
    }
    this.table(container, [cap(LEVEL_NAME[child]), 'Título', 'Valoración', 'Entreno', 'Estudio'], rows);
  }

  // Académico ---------------------------------------------------------
  courses(dv, semestre) {
    const folder = this.settings.folders.academic;
    return toArr(dv.pages(`"${folder}"`).where((p) => hasTipo(p, 'asignatura') && (!semestre || String(p.semestre) === String(semestre))));
  }
  evaluations(page) {
    return toArr(page.file.tasks)
      .filter((t) => t.pond !== undefined || t.fecha !== undefined)
      .map((t) => ({
        task: t,
        nombre: String(t.text || '').replace(/\[[^\]]*::[^\]]*\]/g, '').trim(),
        tipo: t.tipo ? String(t.tipo) : '',
        pond: num(t.pond),
        fecha: toMoment(t.fecha),
        nota: num(t.nota),
        hecha: !!t.completed,
      }));
  }
  courseGrades(page) {
    const s = this.settings;
    const pass = num(page.notaAprobacion) ?? s.notaAprobacion;
    return gradeInfo(this.evaluations(page), pass, s.notaMin, s.notaMax);
  }
  upcomingEvaluations(dv, from, days) {
    const to = from.clone().add(days, 'days').endOf('day');
    const out = [];
    for (const c of this.courses(dv).filter((c) => !c.estado || /cursando/i.test(c.estado))) {
      for (const e of this.evaluations(c)) {
        if (e.fecha && e.nota === null && !e.hecha && e.fecha.isBetween(from.clone().startOf('day'), to, 'day', '[]')) out.push(Object.assign({ course: c }, e));
      }
    }
    return out.sort((a, b) => a.fecha - b.fecha);
  }
  classesOn(dv, date) {
    const dow = moment(date).isoWeekday();
    const out = [];
    for (const c of this.courses(dv).filter((c) => !c.estado || /cursando/i.test(c.estado))) {
      for (const h of toArr(c.horario)) {
        const s = parseSchedule(h);
        if (s && s.dow === dow) out.push(Object.assign({ course: c }, s));
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }
  pageFile(page) {
    return this.app.vault.getAbstractFileByPath(page.file.path);
  }
  scheduleGrid(container, courses) {
    const blocks = [];
    for (const c of courses) for (const h of toArr(c.horario)) {
      const s = parseSchedule(h);
      if (s) blocks.push(Object.assign({ course: c }, s));
    }
    if (!blocks.length) {
      container.createEl('p', { cls: 'raiz-muted', text: 'Agrega bloques en el campo "horario" de tus asignaturas (ej: "Lun 08:15-09:45 | Sala A-12").' });
      return;
    }
    const usedDays = [1, 2, 3, 4, 5].concat(blocks.some((b) => b.dow === 6) ? [6] : []);
    const slots = [...new Set(blocks.map((b) => `${b.start}-${b.end}`))].sort();
    const t = container.createEl('table', { cls: 'raiz-table raiz-schedule' });
    const hr = t.createEl('thead').createEl('tr');
    hr.createEl('th', { text: 'Bloque' });
    for (const d of usedDays) hr.createEl('th', { text: DIAS[d - 1] });
    const body = t.createEl('tbody');
    const today = moment().isoWeekday();
    for (const slot of slots) {
      const r = body.createEl('tr');
      r.createEl('td', { cls: 'raiz-slot', text: slot });
      for (const d of usedDays) {
        const td = r.createEl('td', { cls: d === today ? 'raiz-today' : '' });
        for (const b of blocks.filter((b) => b.dow === d && `${b.start}-${b.end}` === slot)) {
          const div = td.createDiv({ cls: 'raiz-class' });
          const f = this.pageFile(b.course);
          if (f) this.link(div, f, b.course.nombre || b.course.file.name);
          if (b.room) div.createDiv({ cls: 'raiz-muted', text: b.room });
        }
      }
    }
  }
  async academicDashboard(dv, container) {
    const fm = this.fm(this.currentOf(dv));
    const all = this.courses(dv);
    const semestres = [...new Set(all.map((c) => String(c.semestre)))].sort();
    const semestre = fm.semestre ? String(fm.semestre) : semestres[semestres.length - 1];
    const courses = all.filter((c) => String(c.semestre) === String(semestre));
    if (!courses.length) {
      container.createEl('p', { text: `No hay asignaturas para el semestre ${semestre || '(sin definir)'}. Crea una con el botón "Nueva asignatura".` });
      return;
    }
    const s = this.settings;
    const grades = courses.map((c) => ({ c, g: this.courseGrades(c) }));
    const conNota = grades.filter((x) => x.g.parcial !== null);
    const credits = conNota.map((x) => num(x.c.creditos) || 1);
    const ponderado = conNota.length ? sum(conNota.map((x, i) => (x.g.final ?? x.g.parcial) * credits[i])) / sum(credits) : null;
    const upcoming = this.upcomingEvaluations(dv, moment(), 21);
    this.kpis(container, [
      ['Asignaturas', courses.length, `Semestre ${semestre}`],
      ['Promedio actual', ponderado !== null ? fmtNum(ponderado, 2) : '—', conNota.length ? 'ponderado por créditos' : 'sin notas aún'],
      ['En riesgo', grades.filter((x) => ['dificil', 'imposible', 'reprobado'].includes(x.g.estado)).length, 'necesitan > 5,5'],
      ['Evaluaciones (21 días)', upcoming.length, upcoming[0] ? `próxima: ${fechaCorta(upcoming[0].fecha)}` : ''],
    ]);
    this.heading(container, '🗓️ Horario');
    this.scheduleGrid(container, courses);
    this.heading(container, '📚 Asignaturas');
    this.table(
      container,
      ['Asignatura', 'Avance', 'Promedio', 'Necesitas', 'Estado'],
      grades.map(({ c, g }) => [
        (td) => {
          const f = this.pageFile(c);
          if (f) this.link(td, f, c.nombre || c.file.name);
        },
        (td) => {
          const bar = td.createDiv({ cls: 'raiz-bar' });
          bar.createDiv({ cls: 'raiz-bar-fill' }).style.width = `${Math.round(g.avance * 100)}%`;
          td.createSpan({ cls: 'raiz-muted', text: ` ${Math.round(g.avance * 100)}%` });
        },
        g.final !== null ? fmtNum(g.final, 2) : g.parcial !== null ? fmtNum(g.parcial, 2) : '—',
        g.necesaria !== null ? fmtNum(clamp(g.necesaria, 0, 99), 2) : '—',
        ESTADO_LABEL[g.estado],
      ])
    );
    this.heading(container, '📝 Próximas evaluaciones');
    if (upcoming.length) {
      this.table(
        container,
        ['Fecha', 'Faltan', 'Asignatura', 'Evaluación', 'Pond.'],
        upcoming.map((e) => {
          const d = e.fecha.diff(moment().startOf('day'), 'days');
          return [fechaCorta(e.fecha), d === 0 ? '¡Hoy!' : d === 1 ? 'Mañana' : `${d} días`, e.course.nombre || e.course.file.name, e.nombre, e.pond !== null ? `${e.pond}%` : '—'];
        })
      );
    } else container.createEl('p', { cls: 'raiz-muted', text: 'Nada en las próximas 3 semanas 🎉' });
    if (conNota.length) {
      this.heading(container, '📈 Promedios');
      this.renderChart(container, {
        type: 'bar',
        data: {
          labels: conNota.map((x) => x.c.nombre || x.c.file.name),
          datasets: [
            { type: 'line', label: 'Aprobación', data: conNota.map((x) => num(x.c.notaAprobacion) ?? s.notaAprobacion), borderColor: '#ef5350', borderDash: [6, 4], pointRadius: 0, fill: false },
            { label: 'Promedio', data: conNota.map((x) => r1(x.g.final ?? x.g.parcial)), backgroundColor: conNota.map((x) => ratingColor(((x.g.final ?? x.g.parcial) - s.notaMin) / (s.notaMax - s.notaMin) * 9 + 1, 0.7)), borderRadius: 6 },
          ],
        },
        options: { scales: { y: { min: s.notaMin, max: s.notaMax } } },
      });
    }
  }
  async courseStatus(dv, container) {
    const page = dv.current();
    const evals = this.evaluations(page);
    const g = this.courseGrades(page);
    const pass = num(page.notaAprobacion) ?? this.settings.notaAprobacion;
    this.kpis(container, [
      [g.final !== null ? 'Nota final' : 'Promedio parcial', g.final !== null ? fmtNum(g.final, 2) : g.parcial !== null ? fmtNum(g.parcial, 2) : '—', `${Math.round(g.avance * 100)}% evaluado`],
      ['Necesitas en lo pendiente', g.necesaria !== null ? fmtNum(clamp(g.necesaria, 0, 99), 2) : '—', `para un ${fmtNum(pass)}`],
      ['Estado', ESTADO_LABEL[g.estado], g.sumW && Math.abs(g.sumW - 100) > 0.5 ? `⚠️ ponderaciones suman ${fmtNum(g.sumW)}%` : ''],
    ]);
    if (!evals.length) {
      container.createEl('p', { cls: 'raiz-muted', text: 'Agrega evaluaciones abajo con el formato: - [ ] Certamen 1 [tipo:: certamen] [pond:: 30] [fecha:: 2026-10-20] [nota:: ]' });
      return;
    }
    this.table(
      container,
      ['Evaluación', 'Tipo', 'Pond.', 'Fecha', 'Nota'],
      evals.sort((a, b) => (a.fecha || moment('2999-01-01')) - (b.fecha || moment('2999-01-01'))).map((e) => [e.nombre, e.tipo || '—', e.pond !== null ? `${e.pond}%` : '—', e.fecha ? fechaCorta(e.fecha) : '—', e.nota !== null ? fmtNum(e.nota, 1) : '⏳'])
    );
  }

  // Agenda y día --------------------------------------------------------
  eventsBetween(dv, start, end) {
    return toArr(dv.pages(`"${this.settings.folders.agenda}"`).where((p) => hasTipo(p, 'evento')))
      .map((p) => ({ page: p, fecha: toMoment(p.fecha), hora: p.hora ? String(p.hora) : '' }))
      .filter((e) => e.fecha && e.fecha.isBetween(start, end, 'day', '[]'))
      .sort((a, b) => a.fecha - b.fecha || a.hora.localeCompare(b.hora));
  }
  dueTasks(dv, upTo) {
    return dv
      .pages()
      .file.tasks.where((t) => !t.completed && t.vence && toMoment(t.vence) && toMoment(t.vence).isSameOrBefore(upTo, 'day'))
      .array();
  }
  async dailyToday(dv, container, input) {
    const date = input.date ? moment(input.date) : this.currentRange(dv).start;
    const isToday = date.isSame(moment(), 'day');
    let any = false;
    const events = this.eventsBetween(dv, date.clone().startOf('day'), date.clone().endOf('day'));
    if (events.length) {
      any = true;
      this.heading(container, '📅 Agenda');
      const ul = container.createEl('ul');
      for (const e of events) {
        const li = ul.createEl('li');
        if (e.hora) li.createSpan({ cls: 'raiz-time', text: `${e.hora} ` });
        const f = this.pageFile(e.page);
        if (f) this.link(li, f, e.page.titulo || f.basename);
        if (e.page.lugar) li.createSpan({ cls: 'raiz-muted', text: ` · ${e.page.lugar}` });
      }
    }
    const classes = this.classesOn(dv, date);
    if (classes.length) {
      any = true;
      this.heading(container, '🎓 Clases');
      const ul = container.createEl('ul');
      for (const c of classes) {
        const li = ul.createEl('li');
        li.createSpan({ cls: 'raiz-time', text: `${c.start}–${c.end} ` });
        const f = this.pageFile(c.course);
        if (f) this.link(li, f, c.course.nombre || f.basename);
        if (c.room) li.createSpan({ cls: 'raiz-muted', text: ` · ${c.room}` });
      }
    }
    const evals = this.upcomingEvaluations(dv, date, 7);
    if (evals.length) {
      any = true;
      this.heading(container, '📝 Evaluaciones próximas');
      const ul = container.createEl('ul');
      for (const e of evals) {
        const d = e.fecha.diff(date.clone().startOf('day'), 'days');
        const li = ul.createEl('li');
        li.createSpan({ cls: d <= 1 ? 'raiz-urgent' : 'raiz-time', text: `${d === 0 ? 'HOY' : d === 1 ? 'Mañana' : `en ${d} días`} ` });
        li.appendText(`${e.nombre} — ${e.course.nombre || e.course.file.name}${e.pond !== null ? ` (${e.pond}%)` : ''}`);
      }
    }
    if (isToday) {
      const due = this.dueTasks(dv, date.clone().add(2, 'days'));
      const folder = this.settings.folders.daily;
      const pending = dv
        .pages(`"${folder}"`)
        .where((p) => {
          const m = toMoment(p.file.name.slice(0, 10));
          return m && m.isBefore(date, 'day') && m.isAfter(date.clone().subtract(30, 'days'), 'day');
        })
        .file.tasks.where((t) => !t.completed && String(t.text).trim() && !t.vence)
        .array();
      if (due.length) {
        any = true;
        this.heading(container, '⏰ Por vencer');
        await dv.taskList(due, false);
      }
      if (pending.length) {
        any = true;
        this.heading(container, '⏳ Pendientes de días anteriores');
        await dv.taskList(pending, true);
      }
    }
    if (isToday) {
      const nIn = this.inboxFiles().length;
      const rs = await this.dueSummary().catch(() => null);
      const pend = rs ? rs.due + rs.newToday : 0;
      if (nIn || pend) {
        any = true;
        const row = container.createDiv({ cls: 'raiz-conn-row' });
        const go = (name, text) => {
          const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === name);
          if (f) this.link(row, f, text);
          else row.createSpan({ cls: 'raiz-chip is-static', text });
        };
        if (nIn) go('Bandeja', `📥 ${nIn} en la bandeja`);
        if (pend) go('Repaso', `🃏 ${pend} tarjeta(s) para repasar`);
      }
    }
    if (!any) container.createEl('p', { cls: 'raiz-muted', text: 'Nada agendado. Día libre ☀️' });
  }
  async agendaView(dv, container) {
    const from = moment().startOf('day');
    const events = this.eventsBetween(dv, from, from.clone().add(60, 'days'));
    const evals = this.upcomingEvaluations(dv, from, 60);
    const items = events
      .map((e) => ({ fecha: e.fecha, hora: e.hora, text: e.page.titulo || e.page.file.name, extra: [e.page.categoria, e.page.lugar].filter(Boolean).join(' · '), file: this.pageFile(e.page) }))
      .concat(evals.map((e) => ({ fecha: e.fecha, hora: '', text: `📝 ${e.nombre}`, extra: e.course.nombre || e.course.file.name, file: this.pageFile(e.course) })))
      .sort((a, b) => a.fecha - b.fecha || a.hora.localeCompare(b.hora));
    if (!items.length) {
      container.createEl('p', { cls: 'raiz-muted', text: 'Nada en los próximos 60 días.' });
      return;
    }
    this.table(
      container,
      ['Fecha', 'Hora', 'Qué', 'Detalle'],
      items.map((i) => [fechaCorta(i.fecha), i.hora || '—', (td) => (i.file ? this.link(td, i.file, i.text) : td.setText(i.text)), i.extra || ''])
    );
  }
  async monthCalendar(dv, container, input) {
    let start;
    if (input.month) start = moment(input.month, 'YYYY-MM').startOf('month');
    else {
      const file = this.currentOf(dv);
      const r = this.rangeOf(file);
      start = (r ? r.start : moment()).clone().startOf('month');
    }
    const end = start.clone().endOf('month');
    const days = new Map(this.dailiesIn(start, end).map((d) => [isoDate(d.date), d]));
    const sessions = new Set((await this.sessionsIn(start, end)).map((s) => isoDate(s.date)));
    const events = this.eventsBetween(dv, start, end);
    const evals = this.courses(dv).flatMap((c) => this.evaluations(c).filter((e) => e.fecha && e.fecha.isBetween(start, end, 'day', '[]')).map((e) => Object.assign({ course: c }, e)));
    container.createEl('div', { cls: 'raiz-cal-title', text: `${cap(MESES[start.month()])} ${start.year()}` });
    const grid = container.createDiv({ cls: 'raiz-cal' });
    for (const d of DIAS) grid.createDiv({ cls: 'raiz-cal-head', text: d });
    for (let i = 1; i < start.isoWeekday(); i++) grid.createDiv({ cls: 'raiz-cal-cell raiz-cal-empty' });
    for (let d = start.clone(); d.isSameOrBefore(end, 'day'); d.add(1, 'day')) {
      const key = isoDate(d);
      const info = days.get(key);
      const cell = grid.createDiv({ cls: 'raiz-cal-cell' + (d.isSame(moment(), 'day') ? ' raiz-today' : '') });
      const rating = info ? num(info.fm.valoracion) : null;
      if (rating !== null) cell.style.background = ratingColor(rating, 0.3);
      const top = cell.createDiv({ cls: 'raiz-cal-day' });
      if (info) this.link(top, info.file, String(d.date()));
      else top.setText(String(d.date()));
      const icons = cell.createDiv({ cls: 'raiz-cal-icons' });
      if (sessions.has(key)) icons.createSpan({ text: '🏋️', attr: { title: info?.fm.entreno || 'Entrenamiento' } });
      const ev = events.filter((e) => isoDate(e.fecha) === key);
      const ex = evals.filter((e) => isoDate(e.fecha) === key);
      if (ex.length) icons.createSpan({ text: '📝', attr: { title: ex.map((e) => `${e.nombre} — ${e.course.nombre || e.course.file.name}`).join('\n') } });
      for (const e of ev.slice(0, 3)) {
        const chip = cell.createDiv({ cls: 'raiz-cal-event', text: `${e.hora ? e.hora + ' ' : ''}${e.page.titulo || e.page.file.name}` });
        chip.addEventListener('click', () => this.app.workspace.openLinkText(e.page.file.path, '', false));
      }
      if (ev.length > 3) cell.createDiv({ cls: 'raiz-muted', text: `+${ev.length - 3}` });
    }
  }

  // Entrenamiento y hábitos ---------------------------------------------
  async periodTraining(dv, container) {
    const { level, start, end } = this.currentRange(dv);
    const sessions = await this.sessionsIn(start, end);
    const st = await this.stats(start, end);
    const { prs } = await this.personalRecords(start, end);
    this.kpis(container, [
      ['Sesiones', st.sesiones, level === 'weekly' ? `meta ${this.settings.metaSesionesSemana}` : ''],
      ['Minutos', fmtNum(st.minutos, 0), ''],
      ['RPE promedio', st.rpe !== null ? fmtNum(st.rpe) : '—', ''],
      ['Volumen', st.volumen ? `${fmtNum(st.volumen / 1000, 1)} t` : '—', 'series × reps × kg'],
      ['Marcas nuevas', prs.length, prs.length ? '🔥' : ''],
    ]);
    if (!sessions.length) {
      container.createEl('p', { cls: 'raiz-muted', text: 'Sin sesiones registradas en este periodo.' });
      return;
    }
    if (level === 'weekly') {
      this.table(
        container,
        ['Día', 'Tipo', 'Min', 'RPE', 'Ejercicios'],
        sessions.map((s) => [(td) => this.link(td, s.file, fechaCorta(s.date)), s.tipo, s.duracion ?? '—', s.rpe ?? '—', s.exercises.map((e) => e.name).join(', ') || '—'])
      );
    } else {
      const subs = this.subPeriods(level === 'monthly' ? 'monthly' : 'yearly', start, end);
      this.renderChart(container, {
        type: 'bar',
        data: {
          labels: subs.map((s) => s.label),
          datasets: [
            { label: 'Sesiones', data: subs.map((s) => sessions.filter((x) => x.date.isBetween(s.start, s.end, 'day', '[]')).length), backgroundColor: 'rgba(239,83,80,0.7)', borderRadius: 6, yAxisID: 'y' },
            { type: 'line', label: 'Volumen (t)', data: subs.map((s) => r1(sum(sessions.filter((x) => x.date.isBetween(s.start, s.end, 'day', '[]')).map((x) => x.volume)) / 1000)), borderColor: '#42a5f5', yAxisID: 'y1', tension: 0.3 },
          ],
        },
        options: { scales: { y: { beginAtZero: true, position: 'left' }, y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } } } },
      });
    }
    if (prs.length) {
      this.heading(container, '🔥 Marcas personales');
      this.table(container, ['Ejercicio', 'Nueva marca', 'Antes', 'Fecha'], prs.map((p) => [p.name, p.label, p.prev, (td) => this.link(td, p.file, fechaCorta(p.date))]));
    }
  }
  async periodHabits(dv, container) {
    const { level, start, end } = this.currentRange(dv);
    const days = this.dailiesIn(start, end);
    const habits = this.settings.habits;
    if (!days.length) {
      container.createEl('p', { cls: 'raiz-muted', text: 'Sin notas diarias en este periodo.' });
      return;
    }
    const sessions = new Set((await this.sessionsIn(start, end)).map((s) => isoDate(s.date)));
    if (level === 'weekly') {
      const headers = ['Hábito'].concat(days.map((d) => DIAS[d.date.isoWeekday() - 1]));
      const rows = habits.map((h) => [h.label].concat(days.map((d) => (d.fm.habitos?.[h.key] === true ? '✅' : '·'))));
      rows.push(['🏋️ Entrené'].concat(days.map((d) => (sessions.has(isoDate(d.date)) ? '✅' : '·'))));
      rows.push(['😴 Sueño (h)'].concat(days.map((d) => fmtNum(num(d.fm.sueno)))));
      this.table(container, headers, rows).addClass('raiz-habits');
      return;
    }
    const pct = habits.map((h) => Math.round((days.filter((d) => d.fm.habitos?.[h.key] === true).length / days.length) * 100));
    this.renderChart(container, {
      type: 'bar',
      data: { labels: habits.map((h) => h.label), datasets: [{ label: '% de días', data: pct, backgroundColor: pct.map((v) => ratingColor(v / 100 * 9 + 1, 0.7)), borderRadius: 6 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100 } } },
    });
  }
  async trainingDashboard(dv, container) {
    const fm = this.fm(this.currentOf(dv));
    const weeks = clamp(Math.round(num(fm.semanas) || 12), 4, 104);
    const meta = this.settings.metaSesionesSemana;
    const end = moment().endOf('isoWeek');
    const start = end.clone().subtract(weeks - 1, 'weeks').startOf('isoWeek');
    const sessions = await this.sessionsIn(start, end);
    const weekList = [];
    for (let w = start.clone(); w.isBefore(end); w.add(1, 'week')) {
      const s = sessions.filter((x) => x.date.isBetween(w, w.clone().endOf('isoWeek'), 'day', '[]'));
      weekList.push({ label: `S${w.isoWeek()}`, start: w.clone(), count: s.length, volume: sum(s.map((x) => x.volume)) });
    }
    let streak = 0;
    for (let i = weekList.length - 2; i >= 0 && weekList[i].count >= meta; i--) streak++;
    if (weekList[weekList.length - 1].count >= meta) streak++;
    const { best, prs } = await this.personalRecords(start, end);
    this.kpis(container, [
      ['Esta semana', `${weekList[weekList.length - 1].count}/${meta}`, 'sesiones'],
      ['Racha', `${streak} sem`, `cumpliendo ${meta}+/semana`],
      [`Últimas ${weeks} sem`, sessions.length, 'sesiones'],
      ['Marcas nuevas', prs.length, `en ${weeks} semanas`],
    ]);
    this.goalsDashboard(container);
    this.heading(container, '🗓️ Constancia (últimos 6 meses)');
    await this.trainingHeatmap(container, 26);
    this.heading(container, '📊 Sesiones y volumen por semana');
    this.renderChart(container, {
      type: 'bar',
      data: {
        labels: weekList.map((w) => w.label),
        datasets: [
          { label: 'Sesiones', data: weekList.map((w) => w.count), backgroundColor: weekList.map((w) => (w.count >= meta ? 'rgba(102,187,106,0.75)' : 'rgba(239,83,80,0.6)')), borderRadius: 6, yAxisID: 'y' },
          { type: 'line', label: 'Volumen (t)', data: weekList.map((w) => r1(w.volume / 1000)), borderColor: '#42a5f5', tension: 0.3, yAxisID: 'y1' },
        ],
      },
      options: { scales: { y: { beginAtZero: true, suggestedMax: meta + 1 }, y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } } } },
    });
    // Peso y sueño
    const days = this.dailiesIn(start, end).filter((d) => num(d.fm.peso) !== null || num(d.fm.sueno) !== null);
    if (days.length >= 2) {
      this.heading(container, '⚖️ Peso y sueño');
      this.renderChart(container, {
        type: 'line',
        data: {
          labels: days.map((d) => `${d.date.date()}/${d.date.month() + 1}`),
          datasets: [
            { label: 'Peso (kg)', data: days.map((d) => num(d.fm.peso)), borderColor: '#ab47bc', spanGaps: true, yAxisID: 'y', tension: 0.3 },
            { label: 'Sueño (h)', data: days.map((d) => num(d.fm.sueno)), borderColor: '#26a69a', spanGaps: true, yAxisID: 'y1', tension: 0.3 },
          ],
        },
        options: { scales: { y: { position: 'left' }, y1: { position: 'right', grid: { drawOnChartArea: false }, suggestedMin: 4, suggestedMax: 10 } } },
      });
    }
    // Progresión de un ejercicio
    const target = fm.ejercicio ? norm(fm.ejercicio) : null;
    if (target) {
      const allSessions = await this.sessionsIn(moment('2000-01-01'), end);
      const points = [];
      for (const s of allSessions) for (const ex of s.exercises) if (ex.key === target || ex.key.includes(target)) {
        const m = bestMetric(ex);
        if (m) points.push({ date: s.date, value: r1(m.value), kind: m.kind });
      }
      this.heading(container, `📈 Progresión: ${fm.ejercicio}`);
      if (points.length) {
        const kind = points[points.length - 1].kind;
        const unit = { e1rm: '1RM estimado (kg)', reps: 'Repeticiones máx.', sec: 'Segundos máx.', km: 'Km' }[kind];
        const pts = points.filter((p) => p.kind === kind);
        this.renderChart(container, {
          type: 'line',
          data: { labels: pts.map((p) => `${p.date.date()}/${p.date.month() + 1}/${String(p.date.year()).slice(2)}`), datasets: [{ label: unit, data: pts.map((p) => p.value), borderColor: '#ef5350', backgroundColor: 'rgba(239,83,80,0.15)', fill: true, tension: 0.3 }] },
          options: { plugins: { legend: { display: true } } },
        });
      } else container.createEl('p', { cls: 'raiz-muted', text: 'No encontré registros de ese ejercicio.' });
    }
    // Mejores marcas
    this.heading(container, '🏆 Mejores marcas');
    const bestRows = [...best.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (bestRows.length) this.table(container, ['Ejercicio', 'Mejor marca', 'Fecha', 'Veces'], bestRows.map((b) => [b.name, b.label, (td) => this.link(td, b.file, fechaCorta(b.date)), b.count]));
    else container.createEl('p', { cls: 'raiz-muted', text: 'Registra ejercicios en tus notas diarias para ver tus marcas.' });
  }

  async home(dv, container) {
    const today = moment();
    const file = this.dailyFor(today);
    const row = container.createDiv({ cls: 'raiz-home-top' });
    row.createDiv({ cls: 'raiz-home-date', text: fechaLarga(today) });
    const btn = row.createEl('button', { cls: 'mod-cta', text: file ? '📖 Abrir mi día' : '✍️ Crear mi día' });
    btn.addEventListener('click', () => this.openToday());
    const st = await this.stats(today.clone().startOf('isoWeek'), today.clone().endOf('isoWeek'));
    this.kpis(container, [
      ['Entreno semana', `${st.sesiones}/${this.settings.metaSesionesSemana}`, ''],
      ['Valoración semana', st.rating !== null ? fmtNum(st.rating) : '—', ''],
      ['Sueño promedio', st.sueno !== null ? `${fmtNum(st.sueno)} h` : '—', ''],
      ['Estudio semana', st.estudio ? `${fmtNum(st.estudio)} h` : '—', ''],
    ]);
    await this.dailyToday(dv, container, { date: isoDate(today) });
    this.heading(container, '🗓️ Este mes');
    await this.monthCalendar(dv, container, { month: today.format('YYYY-MM') });
  }
  // ═════════════════════════════ Biblioteca (juegos, libros, anime, manga…) ═════════════════════════════
  mediaCat(key) {
    return this.settings.mediaCategories.find((c) => c.key === key) || { key, label: cap(key || 'Otro'), emoji: '✨', color: '#94a3b8', provider: 'wikipedia', unidad: '' };
  }
  coverSrc(portada) {
    if (!portada) return null;
    const s = String(portada).replace(/^!?\[\[|\]\]$/g, '').trim();
    if (/^https?:\/\//i.test(s)) return s;
    const f = this.app.vault.getAbstractFileByPath(s);
    return f instanceof TFile ? this.app.vault.getResourcePath(f) : null;
  }
  ratingLabel(n) {
    n = num(n);
    if (n === null) return { text: 'Sin nota', cls: 'r-none' };
    if (n >= 10) return { text: 'Obra maestra', cls: 'r-10' };
    if (n >= 9) return { text: 'Excelente', cls: 'r-9' };
    if (n >= 8) return { text: 'Muy bueno', cls: 'r-8' };
    if (n >= 7) return { text: 'Bueno', cls: 'r-7' };
    if (n >= 6) return { text: 'Correcto', cls: 'r-6' };
    if (n >= 5) return { text: 'Regular', cls: 'r-5' };
    return { text: 'Malo', cls: 'r-4' };
  }
  mediaItems() {
    const folder = this.settings.folders.library + '/';
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(folder)) continue;
      const fm = this.fm(f);
      if (!hasTipo(fm, 'medio')) continue;
      out.push({ file: f, fm, cat: this.mediaCat(fm.categoria) });
    }
    return out;
  }
  libState() {
    if (!this._libState) {
      let saved = {};
      try {
        saved = JSON.parse(window.localStorage.getItem('raiz-lib') || '{}');
      } catch (e) {
        /* nada */
      }
      this._libState = Object.assign({ q: '', cat: 'todos', estado: 'todos', genero: 'todos', orden: 'reciente', fav: false, size: 160 }, saved);
    }
    return this._libState;
  }
  saveLibState() {
    try {
      const { q, ...rest } = this._libState;
      window.localStorage.setItem('raiz-lib', JSON.stringify(rest));
    } catch (e) {
      /* nada */
    }
  }

  async library(dv, container, input) {
    const st = this.libState();
    if (input.categoria) st.cat = input.categoria;
    const root = container.createDiv({ cls: 'raiz-lib' });
    const items = this.mediaItems();
    const cats = this.settings.mediaCategories;

    // Pestañas de categorías
    const tabs = root.createDiv({ cls: 'raiz-lib-tabs' });
    const mkTab = (key, label, count, color) => {
      const t = tabs.createEl('button', { cls: 'raiz-tab' + (st.cat === key ? ' is-active' : ''), text: `${label} · ${count}` });
      if (color) t.style.setProperty('--c', color);
      t.addEventListener('click', () => {
        st.cat = key;
        this.saveLibState();
        tabs.querySelectorAll('.raiz-tab').forEach((x) => x.removeClass('is-active'));
        t.addClass('is-active');
        draw();
      });
    };
    mkTab('todos', '✨ Todo', items.length);
    for (const c of cats) mkTab(c.key, `${c.emoji} ${c.label}`, items.filter((i) => i.cat.key === c.key).length, c.color);

    // Barra de herramientas
    const bar = root.createDiv({ cls: 'raiz-lib-bar' });
    const search = bar.createEl('input', { cls: 'raiz-input', attr: { type: 'search', placeholder: '🔎 Buscar título, autor, género…' } });
    search.value = st.q;
    search.addEventListener('input', () => {
      st.q = search.value;
      draw();
    });
    const select = (options, key, labelAll) => {
      const s = bar.createEl('select', { cls: 'raiz-select dropdown' });
      s.createEl('option', { value: 'todos', text: labelAll });
      for (const o of options) s.createEl('option', { value: o, text: o });
      s.value = options.includes(st[key]) ? st[key] : 'todos';
      s.addEventListener('change', () => {
        st[key] = s.value;
        this.saveLibState();
        draw();
      });
      return s;
    };
    select(this.settings.mediaStates, 'estado', 'Todos los estados');
    const genres = [...new Set(items.flatMap((i) => toArr(i.fm.generos).map(String)))].sort((a, b) => a.localeCompare(b, 'es'));
    select(genres, 'genero', 'Todos los géneros');
    const order = bar.createEl('select', { cls: 'raiz-select dropdown' });
    for (const [v, t] of [['reciente', '🕐 Recientes'], ['puntuacion', '⭐ Puntuación'], ['titulo', '🔤 Título'], ['anio', '📅 Año'], ['progreso', '📈 Progreso']]) order.createEl('option', { value: v, text: t });
    order.value = st.orden;
    order.addEventListener('change', () => {
      st.orden = order.value;
      this.saveLibState();
      draw();
    });
    const fav = bar.createEl('button', { cls: 'raiz-chip' + (st.fav ? ' is-active' : ''), text: '❤️ Favoritos' });
    fav.addEventListener('click', () => {
      st.fav = !st.fav;
      fav.toggleClass('is-active', st.fav);
      this.saveLibState();
      draw();
    });
    const viewBtn = bar.createEl('button', { cls: 'raiz-chip', text: st.vista === 'tablero' ? 'Ver galería' : 'Ver tablero' });
    viewBtn.addEventListener('click', () => {
      st.vista = st.vista === 'tablero' ? 'galeria' : 'tablero';
      viewBtn.setText(st.vista === 'tablero' ? 'Ver galería' : 'Ver tablero');
      this.saveLibState();
      draw();
    });
    const size = bar.createEl('input', { cls: 'raiz-range', attr: { type: 'range', min: '110', max: '260', step: '10', title: 'Tamaño de portadas' } });
    size.value = String(st.size);
    size.addEventListener('input', () => {
      st.size = Number(size.value);
      grid.style.setProperty('--card-w', `${st.size}px`);
      this.saveLibState();
    });
    const add = bar.createEl('button', { cls: 'mod-cta raiz-add', text: '＋ Agregar' });
    add.addEventListener('click', () => new MediaModal(this, st.cat !== 'todos' ? st.cat : cats[0]?.key).open());

    const summary = root.createDiv({ cls: 'raiz-lib-summary' });
    const grid = root.createDiv({ cls: 'raiz-grid' });
    grid.style.setProperty('--card-w', `${st.size}px`);

    const draw = () => {
      const q = norm(st.q || '');
      let list = items.filter((i) => {
        if (st.cat !== 'todos' && i.cat.key !== st.cat) return false;
        if (st.estado !== 'todos' && String(i.fm.estado || '') !== st.estado) return false;
        if (st.genero !== 'todos' && !toArr(i.fm.generos).map(String).includes(st.genero)) return false;
        if (st.fav && i.fm.favorito !== true) return false;
        if (q) {
          const hay = norm([i.fm.titulo, i.file.basename, i.fm.creador, i.fm.plataforma, ...toArr(i.fm.generos)].filter(Boolean).join(' '));
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      const by = {
        reciente: (a, b) => b.file.stat.ctime - a.file.stat.ctime,
        puntuacion: (a, b) => (num(b.fm.puntuacion) ?? -1) - (num(a.fm.puntuacion) ?? -1),
        titulo: (a, b) => String(a.fm.titulo || a.file.basename).localeCompare(String(b.fm.titulo || b.file.basename), 'es'),
        anio: (a, b) => (num(b.fm.anio) ?? 0) - (num(a.fm.anio) ?? 0),
        progreso: (a, b) => this.progressOf(b.fm) - this.progressOf(a.fm),
      };
      list = list.sort(by[st.orden] || by.reciente);
      const done = list.filter((i) => /terminad/i.test(i.fm.estado || '')).length;
      const avgR = avg(list.map((i) => num(i.fm.puntuacion)));
      summary.setText(`${list.length} ${list.length === 1 ? 'título' : 'títulos'} · ${done} terminados${avgR !== null ? ` · ⭐ ${fmtNum(avgR)} promedio` : ''}`);
      grid.empty();
      grid.toggleClass('raiz-grid', st.vista !== 'tablero');
      if (st.vista === 'tablero' && list.length) return this.libraryBoard(grid, list);
      if (!list.length) {
        const empty = grid.createDiv({ cls: 'raiz-empty' });
        empty.createDiv({ text: items.length ? 'Nada coincide con los filtros.' : 'Tu biblioteca está vacía.' });
        if (items.length) empty.createEl('button', { cls: 'raiz-chip', text: 'Quitar filtros' }).addEventListener('click', () => { Object.assign(st, { q: '', cat: 'todos', estado: 'todos', genero: 'todos', fav: false }); this.saveLibState(); container.empty(); this.library(dv, container, {}); });
        const b = empty.createEl('button', { cls: 'mod-cta', text: '＋ Agregar el primero' });
        b.addEventListener('click', () => new MediaModal(this, st.cat !== 'todos' ? st.cat : cats[0]?.key).open());
        return;
      }
      for (const i of list) this.mediaCardEl(grid, i);
    };
    draw();
  }
  progressOf(fm) {
    const p = num(fm.progreso);
    const t = num(fm.total);
    return p !== null && t ? clamp(p / t, 0, 1) : 0;
  }
  estadoCls(estado) {
    return 'e-' + norm(estado || 'pendiente').replace(/[^a-z]/g, '');
  }
  mediaCardEl(grid, item) {
    const { file, fm, cat } = item;
    const card = grid.createDiv({ cls: 'raiz-card' });
    card.style.setProperty('--c', cat.color);
    const cover = card.createDiv({ cls: 'raiz-card-cover' });
    const src = this.coverSrc(fm.portada);
    if (src) {
      const img = cover.createEl('img', { attr: { src, loading: 'lazy', alt: '' } });
      img.addEventListener('error', () => {
        img.remove();
        cover.addClass('is-placeholder');
        cover.createDiv({ cls: 'raiz-ph', text: cat.emoji });
      });
    } else {
      cover.addClass('is-placeholder');
      cover.createDiv({ cls: 'raiz-ph', text: cat.emoji });
    }
    cover.createSpan({ cls: 'raiz-card-cat', text: cat.emoji, attr: { title: cat.label } });
    if (fm.favorito === true) cover.createSpan({ cls: 'raiz-card-fav', text: '❤️' });
    const p = this.progressOf(fm);
    if (p > 0 && p < 1) cover.createDiv({ cls: 'raiz-card-progress' }).createDiv().style.width = `${Math.round(p * 100)}%`;
    const body = card.createDiv({ cls: 'raiz-card-body' });
    body.createDiv({ cls: 'raiz-card-title', text: fm.titulo || file.basename });
    const sub = [fm.creador, fm.anio].filter(Boolean).join(' · ');
    if (sub) body.createDiv({ cls: 'raiz-card-sub', text: sub });
    const meta = body.createDiv({ cls: 'raiz-card-meta' });
    const r = this.ratingLabel(fm.puntuacion);
    meta.createSpan({ cls: `raiz-rating ${r.cls}`, text: num(fm.puntuacion) !== null ? `${r.text} · ${fmtNum(num(fm.puntuacion))}` : r.text });
    meta.createSpan({ cls: `raiz-pill ${this.estadoCls(fm.estado)}`, text: fm.estado || 'Pendiente' });
    card.addEventListener('click', (e) => this.app.workspace.openLinkText(file.path, '', e.ctrlKey || e.metaKey));
  }

  /** Cabecera interactiva dentro de la nota de cada título. */
  async mediaHero(dv, container) {
    const file = this.currentOf(dv);
    const fm = this.fm(file);
    const cat = this.mediaCat(fm.categoria);
    const set = (patch) => this.app.fileManager.processFrontMatter(file, (x) => Object.assign(x, typeof patch === 'function' ? patch(x) : patch));
    const hero = container.createDiv({ cls: 'raiz-hero' });
    hero.style.setProperty('--c', cat.color);
    const src = this.coverSrc(fm.portada);
    if (src) hero.style.setProperty('--bg', `url("${src}")`);
    const left = hero.createDiv({ cls: 'raiz-hero-cover' });
    if (src) left.createEl('img', { attr: { src, alt: '' } });
    else left.createDiv({ cls: 'raiz-ph', text: cat.emoji });
    const coverBtn = left.createEl('button', { cls: 'raiz-chip raiz-cover-btn', text: '🖼️ Portada' });
    coverBtn.addEventListener('click', () => this.changeCover(file, fm, cat));

    const info = hero.createDiv({ cls: 'raiz-hero-info' });
    const top = info.createDiv({ cls: 'raiz-hero-top' });
    top.createSpan({ cls: 'raiz-chip is-static', text: `${cat.emoji} ${cat.label}` });
    const favBtn = top.createEl('button', { cls: 'raiz-chip' + (fm.favorito === true ? ' is-active' : ''), text: fm.favorito === true ? '❤️ Favorito' : '🤍 Favorito' });
    favBtn.addEventListener('click', () => set({ favorito: fm.favorito !== true }));
    info.createEl('h2', { cls: 'raiz-hero-title', text: fm.titulo || file.basename });
    const sub = [fm.creador, fm.anio, fm.plataforma].filter(Boolean).join(' · ');
    if (sub) info.createDiv({ cls: 'raiz-hero-sub', text: sub });
    const gen = toArr(fm.generos);
    if (gen.length) {
      const g = info.createDiv({ cls: 'raiz-hero-genres' });
      for (const x of gen) g.createSpan({ cls: 'raiz-tag', text: String(x) });
    }
    // Estado
    const est = info.createDiv({ cls: 'raiz-seg' });
    for (const s of this.settings.mediaStates) {
      const b = est.createEl('button', { cls: `raiz-seg-btn ${this.estadoCls(s)}` + (String(fm.estado) === s ? ' is-active' : ''), text: s });
      b.addEventListener('click', () =>
        set((x) => {
          const patch = { estado: s };
          if (/terminad/i.test(s)) this.celebrate(b);
          if (/curso/i.test(s) && !x.inicio) patch.inicio = isoDate(moment());
          if (/terminad/i.test(s)) {
            if (!x.fin) patch.fin = isoDate(moment());
            if (num(x.total)) patch.progreso = num(x.total);
          }
          return patch;
        })
      );
    }
    // Puntuación
    const rateRow = info.createDiv({ cls: 'raiz-rate' });
    const current = num(fm.puntuacion);
    for (let i = 1; i <= 10; i++) {
      const pip = rateRow.createEl('button', { cls: 'raiz-pip' + (current !== null && i <= current ? ' is-on' : ''), text: String(i) });
      pip.addEventListener('click', () => set({ puntuacion: current === i ? null : i }));
    }
    const rl = this.ratingLabel(current);
    rateRow.createSpan({ cls: `raiz-rating ${rl.cls}`, text: rl.text });
    // Progreso
    const prog = info.createDiv({ cls: 'raiz-prog' });
    const minus = prog.createEl('button', { cls: 'raiz-chip', text: '−' });
    const label = prog.createSpan({ cls: 'raiz-prog-label' });
    const pv = num(fm.progreso) ?? 0;
    const tv = num(fm.total);
    label.setText(`${fmtNum(pv)}${tv ? ` / ${fmtNum(tv)}` : ''} ${cat.unidad || ''}`);
    const plus = prog.createEl('button', { cls: 'raiz-chip', text: '＋' });
    minus.addEventListener('click', () => set({ progreso: Math.max(0, pv - 1) }));
    plus.addEventListener('click', () =>
      set(() => {
        const next = pv + 1;
        const patch = { progreso: tv ? Math.min(tv, next) : next };
        if (!fm.estado || /pendiente/i.test(fm.estado)) {
          patch.estado = 'En curso';
          if (!fm.inicio) patch.inicio = isoDate(moment());
        }
        if (tv && next >= tv) {
          patch.estado = 'Terminado';
          if (!fm.fin) patch.fin = isoDate(moment());
        }
        return patch;
      })
    );
    if (tv) {
      const bar = info.createDiv({ cls: 'raiz-bar raiz-bar-wide' });
      bar.createDiv({ cls: 'raiz-bar-fill' }).style.width = `${Math.round(this.progressOf(fm) * 100)}%`;
    }
    const dates = [fm.inicio && `▶ ${fechaCorta(toMoment(fm.inicio))}`, fm.fin && `🏁 ${fechaCorta(toMoment(fm.fin))}`].filter(Boolean).join('   ');
    if (dates) info.createDiv({ cls: 'raiz-muted', text: dates });
  }
  changeCover(file, fm, cat) {
    new FormModal(this.app, '🖼️ Cambiar portada', [{ key: 'url', label: 'URL de la imagen', placeholder: 'https://…', required: true }], (v) =>
      this.run(async () => {
        const path = await this.downloadCover(v.url.trim(), fm.titulo || file.basename);
        await this.app.fileManager.processFrontMatter(file, (x) => {
          x.portada = path || v.url.trim();
        });
        new Notice('🖼️ Portada actualizada');
      })
    ).open();
  }

  // Búsqueda de metadatos en servicios públicos (sin claves)
  async getJson(url) {
    const res = await requestUrl({ url, method: 'GET', throw: false, headers: { 'User-Agent': 'Raiz-Obsidian/1.0' } });
    if (res.status >= 400) throw new Error(`El servicio respondió ${res.status}`);
    return res.json;
  }
  yearOf(s) {
    const m = String(s || '').match(/\b(1[89]\d{2}|20\d{2})\b/);
    return m ? Number(m[1]) : null;
  }
  async searchAniList(q, type) {
    const query = `query ($q: String, $t: MediaType) { Page(perPage: 12) { media(search: $q, type: $t, sort: SEARCH_MATCH) {
      id siteUrl title { romaji english } coverImage { extraLarge large } episodes chapters startDate { year } genres format
      studios(isMain: true) { nodes { name } } staff(perPage: 3) { edges { role node { name { full } } } } } } }`;
    const res = await requestUrl({
      url: 'https://graphql.anilist.co',
      method: 'POST',
      contentType: 'application/json',
      headers: { Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { q, t: type === 'anime' ? 'ANIME' : 'MANGA' } }),
      throw: false,
    });
    if (res.status >= 400) throw new Error(`AniList respondió ${res.status}`);
    return (res.json?.data?.Page?.media || []).map((m) => {
      const authors = (m.staff?.edges || []).filter((e) => /story|art|original/i.test(e.role)).map((e) => e.node.name.full);
      return {
        titulo: m.title.romaji || m.title.english,
        sub: [m.title.english && m.title.english !== m.title.romaji ? m.title.english : '', m.format, m.startDate?.year].filter(Boolean).join(' · '),
        creador: type === 'anime' ? (m.studios?.nodes || []).map((s) => s.name).join(', ') : [...new Set(authors)].slice(0, 2).join(', '),
        anio: m.startDate?.year || null,
        portada: m.coverImage?.extraLarge || m.coverImage?.large || null,
        total: type === 'anime' ? m.episodes || null : m.chapters || null,
        generos: (m.genres || []).slice(0, 5),
        fuente: m.siteUrl,
      };
    });
  }
  async searchWikipedia(q, hint, lang = 'es') {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=10&gsrsearch=${encodeURIComponent(`${q} ${hint || ''}`.trim())}&prop=pageimages|description|info&inprop=url&piprop=thumbnail&pithumbsize=600&pilicense=any`;
    const j = await this.getJson(url);
    return Object.values(j.query?.pages || {})
      .sort((a, b) => a.index - b.index)
      .map((p) => ({ titulo: p.title, sub: p.description || '', anio: this.yearOf(p.description), portada: p.thumbnail?.source || null, fuente: p.fullurl, creador: '', generos: [] }));
  }
  /** Traduce y limpia géneros para que la biblioteca quede consistente en español. */
  cleanGenres(list) {
    const map = {
      action: 'Acción', adventure: 'Aventura', comedy: 'Comedia', drama: 'Drama', fantasy: 'Fantasía', horror: 'Terror', mystery: 'Misterio',
      romance: 'Romance', 'sci-fi': 'Ciencia ficción', 'science-fiction': 'Ciencia ficción', 'science fiction': 'Ciencia ficción', 'slice of life': 'Recuentos de la vida',
      sports: 'Deportes', supernatural: 'Sobrenatural', thriller: 'Thriller', psychological: 'Psicológico', mecha: 'Mecha', music: 'Música',
      fiction: 'Ficción', history: 'Historia', historical: 'Histórico', crime: 'Crimen', family: 'Familia', war: 'Bélico', ecchi: 'Ecchi',
      'mahou shoujo': 'Mahou shoujo', biography: 'Biografía', philosophy: 'Filosofía', 'self-help': 'Autoayuda', poetry: 'Poesía', strategy: 'Estrategia',
      indie: 'Indie', rpg: 'RPG', simulation: 'Simulación', casual: 'Casual', racing: 'Carreras', anime: 'Anime',
    };
    const out = [];
    for (const g of toArr(list).map(String)) {
      if (g.length > 24 || /[(),]/.test(g)) continue;
      const t = map[norm(g)] || cap(g);
      if (!out.includes(t)) out.push(t);
    }
    return out.slice(0, 5);
  }
  async mediaSearch(cat, q) {
    const list = await this.mediaSearchRaw(cat, q);
    for (const r of list) r.generos = this.cleanGenres(r.generos);
    return list;
  }
  async mediaSearchRaw(cat, q) {
    q = q.trim();
    if (!q) return [];
    const enc = encodeURIComponent(q);
    switch (cat.provider) {
      case 'steam': {
        const j = await this.getJson(`https://store.steampowered.com/api/storesearch/?term=${enc}&l=spanish&cc=CL`);
        const steam = (j.items || []).map((it) => ({
          titulo: it.name,
          sub: 'Steam',
          portada: `https://cdn.akamai.steamstatic.com/steam/apps/${it.id}/library_600x900.jpg`,
          portadaAlt: `https://cdn.akamai.steamstatic.com/steam/apps/${it.id}/header.jpg`,
          fuente: `https://store.steampowered.com/app/${it.id}`,
          plataforma: 'PC',
          steamId: it.id,
          generos: [],
        }));
        let wiki = [];
        try {
          wiki = await this.searchWikipedia(q, 'video game', 'en');
        } catch (e) {
          /* opcional */
        }
        return steam.concat(wiki.filter((w) => w.portada).map((w) => Object.assign(w, { sub: w.sub || 'Wikipedia' })));
      }
      case 'openlibrary': {
        const j = await this.getJson(`https://openlibrary.org/search.json?q=${enc}&limit=12&fields=key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject`);
        return (j.docs || []).map((d) => ({
          titulo: d.title,
          sub: (d.author_name || []).slice(0, 2).join(', '),
          creador: (d.author_name || [])[0] || '',
          anio: d.first_publish_year || null,
          portada: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
          total: d.number_of_pages_median || null,
          generos: d.subject || [],
          fuente: `https://openlibrary.org${d.key}`,
        }));
      }
      case 'anime':
      case 'manga': {
        try {
          const r = await this.searchAniList(q, cat.provider);
          if (r.length) return r;
        } catch (e) {
          /* si AniList falla, probamos MyAnimeList (Jikan) */
        }
        const j = await this.getJson(`https://api.jikan.moe/v4/${cat.provider}?q=${enc}&limit=12&sfw=true`);
        return (j.data || []).map((d) => ({
          titulo: d.title_english && d.title_english !== d.title ? `${d.title}` : d.title,
          sub: [d.title_english && d.title_english !== d.title ? d.title_english : '', d.type, d.year || d.published?.prop?.from?.year].filter(Boolean).join(' · '),
          creador: cat.provider === 'anime' ? (d.studios || []).map((s) => s.name).join(', ') : (d.authors || []).map((a) => a.name.split(', ').reverse().join(' ')).join(', '),
          anio: d.year || d.aired?.prop?.from?.year || d.published?.prop?.from?.year || null,
          portada: d.images?.jpg?.large_image_url || d.images?.jpg?.image_url || null,
          total: cat.provider === 'anime' ? d.episodes || null : d.chapters || null,
          generos: (d.genres || []).map((g) => g.name).slice(0, 5),
          fuente: d.url,
        }));
      }
      case 'youtube':
        return this.searchYouTube(q);
      case 'tvmaze': {
        const j = await this.getJson(`https://api.tvmaze.com/search/shows?q=${enc}`);
        return (j || []).map(({ show: s }) => ({
          titulo: s.name,
          sub: [s.network?.name || s.webChannel?.name, this.yearOf(s.premiered)].filter(Boolean).join(' · '),
          creador: s.network?.name || s.webChannel?.name || '',
          anio: this.yearOf(s.premiered),
          portada: s.image?.original || s.image?.medium || null,
          generos: s.genres || [],
          fuente: s.url,
        }));
      }
      case 'none':
        return [];
      default: {
        if (cat.key === 'pelicula') {
          const en = await this.searchWikipedia(q, 'film', 'en').catch(() => []);
          if (en.some((r) => r.portada)) return en;
          return this.searchWikipedia(q, 'película');
        }
        return this.searchWikipedia(q, cat.label);
      }
    }
  }
  async downloadCover(url, name, alt, folder) {
    for (const u of [url, alt].filter(Boolean)) {
      try {
        const res = await requestUrl({ url: u, method: 'GET', throw: false });
        const ct = String(res.headers?.['content-type'] || res.headers?.['Content-Type'] || '');
        if (res.status >= 400 || !ct.startsWith('image') || !res.arrayBuffer || res.arrayBuffer.byteLength < 1000) continue;
        const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : 'jpg';
        const dir = folder || `${this.settings.folders.library}/_portadas`;
        await this.ensureFolder(dir);
        let path = `${dir}/${safeName(name).slice(0, 80) || 'portada'}.${ext}`;
        let i = 2;
        while (this.app.vault.getAbstractFileByPath(path)) path = `${dir}/${safeName(name).slice(0, 80)} ${i++}.${ext}`;
        await this.app.vault.createBinary(path, res.arrayBuffer);
        return path;
      } catch (e) {
        /* probar la siguiente */
      }
    }
    return null;
  }
  async createMedia(catKey, data, { open = false } = {}) {
    const cat = this.mediaCat(catKey);
    const titulo = String(data.titulo || '').trim();
    if (!titulo) throw new Error('Falta el título.');
    if (data.steamId) {
      // Completa desarrollador, año y géneros desde la ficha de Steam
      try {
        const j = await this.getJson(`https://store.steampowered.com/api/appdetails?appids=${data.steamId}&l=spanish`);
        const d = j?.[data.steamId]?.data;
        if (d) {
          data.creador = data.creador || (d.developers || []).join(', ');
          data.anio = data.anio || this.yearOf(d.release_date?.date);
          if (!toArr(data.generos).length) data.generos = this.cleanGenres((d.genres || []).map((g) => g.description));
        }
      } catch (e) {
        /* opcional */
      }
    }
    const portada = data.portada ? (await this.downloadCover(data.portada, titulo, data.portadaAlt)) || data.portada : '';
    const q = (v) => JSON.stringify(v === undefined || v === null ? '' : String(v));
    const content = await this.fromTemplate('Medio', {
      categoria: cat.key,
      titulo: q(titulo),
      portada: q(portada),
      creador: q(data.creador || ''),
      anio: data.anio || '',
      total: data.total || '',
      plataforma: q(data.plataforma || ''),
      fuente: q(data.fuente || ''),
      unidad: cat.unidad || '',
      generosYaml: toArr(data.generos).length ? toArr(data.generos).map((g) => `  - ${q(g)}`).join('\n') : '  []',
      estado: data.estado || this.settings.mediaStates[0],
    });
    const dir = `${this.settings.folders.library}/${cat.label}`;
    await this.ensureFolder(dir);
    let path = `${dir}/${safeName(titulo).slice(0, 100)}.md`;
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(path)) path = `${dir}/${safeName(titulo).slice(0, 100)} ${i++}.md`;
    const file = await this.app.vault.create(path, content.replace(/^generos:\n  \[\]$/m, 'generos: []'));
    if (open) await this.app.workspace.getLeaf(false).openFile(file);
    new Notice(`${cat.emoji} "${titulo}" agregado a ${cat.label}`);
    return file;
  }

  // ═════════════════════════════ Entrenamiento interactivo ═════════════════════════════
  expandSets(spec) {
    const sets = [];
    for (const groupRaw of String(spec || '').split(/;|\s\+\s/)) {
      const group = groupRaw.replace(/(\d),(\d)/g, '$1.$2');
      const sm = group.match(/(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(s|seg|segs|min)?\b/i);
      if (!sm) continue;
      const wm = group.match(/([+\-]?\d+(?:\.\d+)?)\s*kg/i);
      const n = parseInt(sm[1], 10);
      const unit = (sm[3] || '').toLowerCase();
      for (let i = 0; i < n; i++)
        sets.push({ kg: wm ? wm[1] : '', reps: unit ? '' : sm[2], seg: unit ? String(unit === 'min' ? parseFloat(sm[2]) * 60 : sm[2]) : '', ok: false });
    }
    return sets;
  }
  serializeSets(sets) {
    const done = sets.filter((s) => s.ok && (String(s.reps).trim() || String(s.seg).trim()));
    const groups = [];
    for (const s of done) {
      const kg = String(s.kg ?? '').trim().replace(',', '.');
      const val = String(s.seg ?? '').trim() ? `${String(s.seg).trim()}s` : String(s.reps).trim();
      const last = groups[groups.length - 1];
      if (last && last.kg === kg && last.val === val) last.n++;
      else groups.push({ n: 1, kg, val });
    }
    return groups.map((g) => `${g.n}x${g.val}${g.kg ? ` @ ${g.kg}kg` : ''}`).join('; ');
  }
  sesionOf(fm) {
    return toArr(fm.sesion)
      .filter((e) => e && e.ejercicio)
      .map((e) => ({ ejercicio: String(e.ejercicio), series: toArr(e.series).map((s) => ({ kg: s.kg ?? '', reps: s.reps ?? '', seg: s.seg ?? '', ok: s.ok === true })) }));
  }
  async saveSesion(file, sesion) {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.sesion = sesion;
    });
    const lines = sesion
      .map((e) => ({ name: e.ejercicio, spec: this.serializeSets(e.series) }))
      .filter((x) => x.spec)
      .map((x) => `- ${x.name}: ${x.spec}`);
    await this.app.vault.process(file, (data) => {
      const a = data.indexOf('%% ejercicios %%');
      const b = data.indexOf('%% /ejercicios %%');
      if (a === -1 || b === -1 || b < a) return data;
      return data.slice(0, a + '%% ejercicios %%'.length) + '\n' + (lines.length ? lines.join('\n') + '\n' : '') + data.slice(b);
    });
  }
  async lastPerformances(date) {
    const history = await this.sessionsIn(date.clone().subtract(365, 'days'), date.clone().subtract(1, 'day'));
    const last = new Map();
    const best = new Map();
    for (const s of history)
      for (const ex of s.exercises) {
        last.set(ex.key, { raw: ex.raw, date: s.date, name: ex.name });
        const m = bestMetric(ex);
        if (m && (!best.has(ex.key) || (best.get(ex.key).kind === m.kind && m.value > best.get(ex.key).value))) best.set(ex.key, m);
      }
    return { last, best };
  }
  startRest(seconds) {
    this.stopRest();
    const el = document.body.createDiv({ cls: 'raiz-rest' });
    this.restEl = el;
    let end = Date.now() + seconds * 1000;
    const total = () => Math.max(1, seconds);
    const label = el.createDiv({ cls: 'raiz-rest-time' });
    const bar = el.createDiv({ cls: 'raiz-rest-bar' }).createDiv();
    const btns = el.createDiv({ cls: 'raiz-rest-btns' });
    const mk = (t, fn) => btns.createEl('button', { cls: 'raiz-chip', text: t }).addEventListener('click', fn);
    mk('−15', () => (end -= 15000));
    mk('+15', () => {
      end += 15000;
      seconds += 15;
    });
    mk('✕', () => this.stopRest());
    const tick = () => {
      const left = Math.round((end - Date.now()) / 1000);
      if (left <= 0) {
        this.beep();
        label.setText('💪 ¡Siguiente serie!');
        bar.style.width = '0%';
        clearInterval(this.restTimer);
        this.restTimer = null;
        setTimeout(() => this.stopRest(), 4000);
        return;
      }
      label.setText(`⏱️ Descanso ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
      bar.style.width = `${clamp((left / total()) * 100, 0, 100)}%`;
    };
    tick();
    this.restTimer = setInterval(tick, 250);
  }
  stopRest() {
    if (this.restTimer) clearInterval(this.restTimer);
    this.restTimer = null;
    this.restEl?.remove();
    this.restEl = null;
  }
  beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.25, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.22);
      });
    } catch (e) {
      /* sin audio */
    }
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch (e) {
      /* nada */
    }
  }
  async workout(dv, container) {
    const { file, start: date } = this.currentRange(dv);
    const fm = this.fm(file);
    const sesion = this.sesionOf(fm);
    const save = () => this.saveSesion(file, sesion);
    const setFm = (patch) => this.app.fileManager.processFrontMatter(file, (x) => Object.assign(x, patch));
    const { last, best } = await this.lastPerformances(date);
    const root = container.createDiv({ cls: 'raiz-wo' });

    // Tipo
    const types = root.createDiv({ cls: 'raiz-wo-types' });
    for (const t of this.settings.trainingTypes) {
      const b = types.createEl('button', { cls: 'raiz-chip' + (String(fm.entreno || '') === t ? ' is-active' : ''), text: t });
      b.addEventListener('click', () => setFm({ entreno: String(fm.entreno) === t ? null : t }));
    }
    // Barra: cronómetro, RPE, rutina
    const bar = root.createDiv({ cls: 'raiz-wo-bar' });
    const clock = bar.createDiv({ cls: 'raiz-wo-clock' });
    const startM = fm.entrenoInicio ? moment(fm.entrenoInicio) : null;
    const running = startM && startM.isValid() && !fm.entrenoFin;
    const clockText = clock.createSpan({ cls: 'raiz-wo-time' });
    const renderClock = () => {
      if (running) {
        const s = Math.max(0, moment().diff(startM, 'seconds'));
        clockText.setText(`${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
      } else clockText.setText(num(fm.duracion) ? `${num(fm.duracion)} min` : '00:00');
    };
    renderClock();
    if (running) {
      const iv = setInterval(() => (root.isConnected ? renderClock() : clearInterval(iv)), 1000);
    }
    const playBtn = clock.createEl('button', { cls: 'raiz-chip ' + (running ? 'is-stop' : 'is-go'), text: running ? '⏹ Terminar' : '▶ Empezar' });
    playBtn.addEventListener('click', () => {
      if (running) this.celebrate(playBtn);
      if (running) setFm({ entrenoFin: moment().format('YYYY-MM-DDTHH:mm'), duracion: Math.max(1, Math.round(moment().diff(startM, 'minutes', true))) });
      else setFm({ entrenoInicio: moment().format('YYYY-MM-DDTHH:mm'), entrenoFin: null });
    });
    const rpe = bar.createDiv({ cls: 'raiz-wo-rpe' });
    rpe.createSpan({ cls: 'raiz-muted', text: 'RPE' });
    for (const v of [6, 7, 7.5, 8, 8.5, 9, 10]) {
      const b = rpe.createEl('button', { cls: 'raiz-pip' + (num(fm.rpe) === v ? ' is-on' : ''), text: String(v).replace('.', ',') });
      b.addEventListener('click', () => setFm({ rpe: num(fm.rpe) === v ? null : v }));
    }
    const routineBtn = bar.createEl('button', { cls: 'raiz-chip', text: '📋 Rutina' });
    routineBtn.addEventListener('click', () => this.run(() => this.insertRoutine()));

    // Tarjetas de ejercicios
    const list = root.createDiv({ cls: 'raiz-wo-list' });
    sesion.forEach((ex, idx) => {
      const key = norm(ex.ejercicio);
      const card = list.createDiv({ cls: 'raiz-ex' });
      const head = card.createDiv({ cls: 'raiz-ex-head' });
      head.createDiv({ cls: 'raiz-ex-name', text: ex.ejercicio });
      const doneSpec = this.serializeSets(ex.series);
      const nowEx = doneSpec ? parseExercise(ex.ejercicio, doneSpec) : null;
      const nowM = nowEx ? bestMetric(nowEx) : null;
      const prevBest = best.get(key);
      if (nowM && prevBest && nowM.kind === prevBest.kind && nowM.value > prevBest.value + 1e-9) head.createSpan({ cls: 'raiz-badge-pr', text: '🔥 PR' });
      const del = head.createEl('button', { cls: 'raiz-icon-btn', text: '🗑', attr: { title: 'Quitar ejercicio' } });
      del.addEventListener('click', () => {
        sesion.splice(idx, 1);
        save();
      });
      const prev = last.get(key);
      if (prev) card.createDiv({ cls: 'raiz-ex-last', text: `Última vez (${fechaCorta(prev.date)}): ${prev.raw}` });
      const iso = ex.series.some((s) => String(s.seg).trim()) && !ex.series.some((s) => String(s.reps).trim());
      const table = card.createDiv({ cls: 'raiz-sets' });
      const hdr = table.createDiv({ cls: 'raiz-set raiz-set-head' });
      for (const h of ['#', 'kg', iso ? 'seg' : 'reps', '']) hdr.createSpan({ text: h });
      ex.series.forEach((s, si) => {
        const row = table.createDiv({ cls: 'raiz-set' + (s.ok ? ' is-done' : '') });
        row.createSpan({ cls: 'raiz-set-n', text: String(si + 1) });
        const mkInput = (field, ph) => {
          const inp = row.createEl('input', { cls: 'raiz-set-input', attr: { type: 'text', inputmode: 'decimal', placeholder: ph } });
          inp.value = s[field] === null || s[field] === undefined ? '' : String(s[field]);
          inp.addEventListener('change', () => {
            s[field] = inp.value.trim();
            save();
          });
          return inp;
        };
        mkInput('kg', 'PC');
        mkInput(iso ? 'seg' : 'reps', iso ? 's' : 'reps');
        const ok = row.createEl('button', { cls: 'raiz-check' + (s.ok ? ' is-on' : ''), text: '✓' });
        ok.addEventListener('click', () => {
          row.querySelectorAll('input').forEach((i) => i.dispatchEvent(new Event('change')));
          s.ok = !s.ok;
          if (s.ok) this.startRest(this.settings.restSeconds || 90);
          save();
        });
      });
      const foot = card.createDiv({ cls: 'raiz-ex-foot' });
      const addSet = foot.createEl('button', { cls: 'raiz-chip', text: '＋ Serie' });
      addSet.addEventListener('click', () => {
        const lastSet = ex.series[ex.series.length - 1] || { kg: '', reps: '', seg: '' };
        ex.series.push({ kg: lastSet.kg, reps: lastSet.reps, seg: lastSet.seg, ok: false });
        save();
      });
      if (ex.series.length > 1) {
        const rm = foot.createEl('button', { cls: 'raiz-chip', text: '− Serie' });
        rm.addEventListener('click', () => {
          ex.series.pop();
          save();
        });
      }
      const done = ex.series.filter((s) => s.ok).length;
      foot.createSpan({ cls: 'raiz-muted', text: `${done}/${ex.series.length} series` });
    });
    // Agregar ejercicio
    const addRow = root.createDiv({ cls: 'raiz-wo-add' });
    const dlId = `raiz-ex-${Math.random().toString(36).slice(2)}`;
    const dl = addRow.createEl('datalist', { attr: { id: dlId } });
    for (const v of [...last.values()].map((x) => x.name).sort((a, b) => a.localeCompare(b, 'es'))) dl.createEl('option', { value: v });
    const inp = addRow.createEl('input', { cls: 'raiz-input', attr: { type: 'text', placeholder: '＋ Ejercicio (escribe o elige)…', list: dlId } });
    const addEx = () => {
      const name = inp.value.trim();
      if (!name) return;
      const prev = last.get(norm(name));
      const series = prev ? this.expandSets(prev.raw) : [];
      sesion.push({ ejercicio: prev ? prev.name : cap(name), series: series.length ? series : [{ kg: '', reps: '', seg: '', ok: false }, { kg: '', reps: '', seg: '', ok: false }, { kg: '', reps: '', seg: '', ok: false }] });
      save();
    };
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addEx();
    });
    addRow.createEl('button', { cls: 'mod-cta', text: 'Agregar' }).addEventListener('click', addEx);
    if (!sesion.length) root.createDiv({ cls: 'raiz-muted', text: 'Carga una rutina o agrega ejercicios. Marca ✓ cada serie al terminarla: arranca el descanso y queda registrada.' });
  }
  async trainingHeatmap(container, weeks = 26) {
    const end = moment().endOf('isoWeek');
    const start = end.clone().subtract(weeks - 1, 'weeks').startOf('isoWeek');
    const sessions = await this.sessionsIn(start, end);
    const byDay = new Map(sessions.map((s) => [isoDate(s.date), s]));
    const maxVol = Math.max(1, ...sessions.map((s) => s.volume || 0));
    const wrap = container.createDiv({ cls: 'raiz-heat-wrap' });
    const grid = wrap.createDiv({ cls: 'raiz-heat' });
    grid.style.setProperty('--weeks', weeks);
    for (let d = 0; d < 7; d++) grid.createDiv({ cls: 'raiz-heat-label', text: d % 2 === 0 ? DIAS[d] : '' }).style.gridRow = String(d + 1);
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const day = start.clone().add(w, 'weeks').add(d, 'days');
        const s = byDay.get(isoDate(day));
        const cell = grid.createDiv({ cls: 'raiz-heat-cell' + (s ? ' is-on' : '') + (day.isAfter(moment(), 'day') ? ' is-future' : '') });
        cell.style.gridRow = String(d + 1);
        cell.style.gridColumn = String(w + 2);
        if (s) {
          cell.style.setProperty('--a', String(0.35 + 0.65 * Math.min(1, (s.volume || maxVol * 0.4) / maxVol)));
          cell.setAttr('title', `${fechaCorta(day)} · ${s.tipo}${s.duracion ? ` · ${s.duracion} min` : ''}`);
          cell.addEventListener('click', () => this.app.workspace.openLinkText(s.file.path, '', false));
        } else cell.setAttr('title', fechaCorta(day));
      }
    }
  }

  // ═════════════════════════════ Conocimiento (MOC + notas conectadas) ═════════════════════════════
  linkGraph() {
    const out = new Map();
    const inc = new Map();
    for (const [src, targets] of Object.entries(this.app.metadataCache.resolvedLinks)) {
      for (const t of Object.keys(targets)) {
        if (t === src) continue;
        out.set(src, (out.get(src) || 0) + 1);
        if (!inc.has(t)) inc.set(t, new Set());
        inc.get(t).add(src);
      }
    }
    return { out, inc };
  }
  knowledgeFiles() {
    const folder = this.settings.folders.knowledge + '/';
    return this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder));
  }
  excerpt(file) {
    const fm = this.fm(file);
    if (fm.resumen) return String(fm.resumen);
    const c = this.app.metadataCache.getFileCache(file);
    return c?.headings?.[0]?.heading || '';
  }
  async moc(dv, container) {
    const file = this.currentOf(dv);
    const { inc } = this.linkGraph();
    const linked = [...(inc.get(file.path) || [])]
      .map((p) => this.app.vault.getAbstractFileByPath(p))
      .filter((f) => f instanceof TFile && !f.path.startsWith(this.settings.folders.daily + '/'));
    const bar = container.createDiv({ cls: 'raiz-lib-bar' });
    bar.createEl('button', { cls: 'mod-cta', text: '＋ Nota en este mapa' }).addEventListener('click', () => this.newKnowledgeNote(file.basename));
    bar.createEl('button', { cls: 'raiz-chip', text: '🕸️ Grafo local' }).addEventListener('click', () => this.app.commands.executeCommandById('graph:open-local'));
    const temas = toArr(this.fm(file).temas).map((t) => String(t).replace(/^#/, '').toLowerCase()).filter(Boolean);
    if (temas.length) {
      const linkedSet = new Set(linked.map((f) => f.path));
      const pending = [...new Set(temas.flatMap((t) => this.filesWithTag(t)))].filter((f) => f !== file && !linkedSet.has(f.path));
      if (pending.length) {
        const box = container.createDiv({ cls: 'raiz-moc-group' });
        box.createDiv({ cls: 'raiz-moc-title', text: `📎 Del tema, aún sin conectar · ${pending.length}` });
        for (const f of pending) {
          const row = box.createDiv({ cls: 'raiz-conn-row' });
          this.link(row, f);
          row.createEl('button', { cls: 'raiz-chip', text: '＋ Conectar' }).addEventListener('click', () => this.run(() => this.appendLink(f, file)));
        }
      }
    }
    if (!linked.length) {
      container.createDiv({ cls: 'raiz-muted', text: 'Todavía no hay notas que enlacen a este mapa. Crea una con el botón o escribe [[' + file.basename + ']] en cualquier nota.' });
      return;
    }
    const groups = new Map();
    for (const f of linked) {
      const tags = toArr(this.fm(f).tags).map(String).filter((t) => !/^(conocimiento|nota)$/i.test(t));
      const g = tags[0] ? `#${tags[0]}` : 'Sin etiqueta';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(f);
    }
    const wrap = container.createDiv({ cls: 'raiz-moc' });
    for (const [g, files] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const box = wrap.createDiv({ cls: 'raiz-moc-group' });
      box.createDiv({ cls: 'raiz-moc-title', text: `${g} · ${files.length}` });
      for (const f of files.sort((a, b) => b.stat.mtime - a.stat.mtime)) {
        const row = box.createDiv({ cls: 'raiz-moc-item' });
        this.link(row, f);
        const ex = this.excerpt(f);
        if (ex && ex !== f.basename) row.createDiv({ cls: 'raiz-muted', text: ex.slice(0, 140) });
      }
    }
  }
  async knowledgeHome(dv, container) {
    const files = this.knowledgeFiles();
    const { out, inc } = this.linkGraph();
    const deg = (f) => (out.get(f.path) || 0) + (inc.get(f.path)?.size || 0);
    const mocs = files.filter((f) => hasTipo(this.fm(f), 'mapa'));
    const notes = files.filter((f) => hasTipo(this.fm(f), 'nota'));
    const links = sum(files.map((f) => out.get(f.path) || 0));
    this.kpis(container, [
      ['Notas', notes.length, ''],
      ['Mapas', mocs.length, ''],
      ['Conexiones', links, notes.length ? `${fmtNum(links / Math.max(1, notes.length))} por nota` : ''],
      ['Huérfanas', notes.filter((f) => deg(f) === 0).length, 'sin enlaces'],
    ]);
    const bar = container.createDiv({ cls: 'raiz-lib-bar' });
    bar.createEl('button', { cls: 'mod-cta', text: '＋ Nota' }).addEventListener('click', () => this.newKnowledgeNote());
    bar.createEl('button', { cls: 'raiz-chip', text: '🗺️ Nuevo mapa' }).addEventListener('click', () => this.newMoc());
    bar.createEl('button', { cls: 'raiz-chip', text: '🌐 Grafo' }).addEventListener('click', () => this.app.commands.executeCommandById('graph:open'));
    const section = (title, list, empty) => {
      this.heading(container, title);
      if (!list.length) return container.createDiv({ cls: 'raiz-muted', text: empty });
      const box = container.createDiv({ cls: 'raiz-moc-group' });
      for (const [f, extra] of list) {
        const row = box.createDiv({ cls: 'raiz-moc-item' });
        this.link(row, f);
        if (extra) row.createSpan({ cls: 'raiz-muted', text: `  ${extra}` });
      }
    };
    section('🗺️ Mapas', mocs.map((f) => [f, `${inc.get(f.path)?.size || 0} notas`]), 'Crea tu primer mapa (por ejemplo, uno por ramo o tema).');
    section('🧩 Huérfanas (conéctalas a un mapa)', notes.filter((f) => deg(f) === 0).map((f) => [f, '']), 'Ninguna: todo está conectado 🎉');
    section('🔥 Más conectadas', [...notes].sort((a, b) => deg(b) - deg(a)).slice(0, 8).filter((f) => deg(f) > 0).map((f) => [f, `${deg(f)} enlaces`]), '—');
    section('🕐 Recientes', [...notes].sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 8).map((f) => [f, fechaCorta(moment(f.stat.mtime))]), '—');
    const tags = new Map();
    for (const f of notes) for (const t of toArr(this.fm(f).tags).map(String)) if (!/^(conocimiento|nota)$/i.test(t)) tags.set(t, (tags.get(t) || 0) + 1);
    if (tags.size) {
      this.heading(container, '🏷️ Temas');
      const cloud = container.createDiv({ cls: 'raiz-hero-genres' });
      for (const [t, n] of [...tags.entries()].sort((a, b) => b[1] - a[1])) cloud.createSpan({ cls: 'raiz-tag', text: `#${t} ${n}` }).style.fontSize = `${clamp(0.8 + n * 0.08, 0.8, 1.4)}em`;
    }
  }
  mocTargets() {
    const mocs = this.knowledgeFiles().filter((f) => hasTipo(this.fm(f), 'mapa'));
    const courses = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(this.settings.folders.academic + '/') && hasTipo(this.fm(f), 'asignatura') && !/aprobad|reprobad/i.test(this.fm(f).estado || ''));
    return ['(ninguno)'].concat(mocs.map((f) => f.basename), courses.map((f) => f.basename));
  }
  newKnowledgeNote(preset) {
    const opts = this.mocTargets();
    new FormModal(
      this.app,
      '🧠 Nueva nota de conocimiento',
      [
        { key: 'titulo', label: 'Idea principal', required: true, placeholder: 'Ej: Normalización hasta 3FN' },
        { key: 'mapa', label: 'Mapa / asignatura', type: 'select', options: preset && !opts.includes(preset) ? [preset].concat(opts) : opts, value: preset || '(ninguno)' },
        { key: 'tags', label: 'Etiquetas', placeholder: 'bases-de-datos, sql' },
        { key: 'fuente', label: 'Fuente', placeholder: 'Clase, libro, video, link…' },
      ],
      (v) =>
        this.run(async () => {
          const tags = String(v.tags || '')
            .split(/[,\s]+/)
            .map((t) => t.replace(/^#/, '').trim())
            .filter(Boolean)
            .map((t) => (t.includes('/') ? t : `tema/${t}`));
          const content = await this.fromTemplate('Nota', {
            titulo: v.titulo.trim(),
            mapa: v.mapa && v.mapa !== '(ninguno)' ? `[[${v.mapa}]]` : '',
            mapaYaml: v.mapa && v.mapa !== '(ninguno)' ? JSON.stringify(`[[${v.mapa}]]`) : '""',
            tagsYaml: ['conocimiento'].concat(tags).map((t) => `  - ${t}`).join('\n'),
            fuente: v.fuente.trim(),
            fecha: isoDate(moment()),
          });
          await this.createNote(`${this.settings.folders.knowledge}/Notas`, v.titulo, content);
        })
    ).open();
  }
  newMoc(preset = {}) {
    new FormModal(
      this.app,
      '🗺️ Nuevo mapa de contenido',
      [
        { key: 'titulo', label: 'Tema', required: true, placeholder: 'Ej: Arquitectura de software', value: preset.titulo || '' },
        { key: 'temas', label: 'Etiquetas del tema', placeholder: 'tema/arquitectura, tema/patrones', value: toArr(preset.temas).join(', ') },
        { key: 'descripcion', label: 'De qué trata', type: 'textarea' },
      ],
      (v) =>
        this.run(async () => {
          const temas = String(v.temas || '')
            .split(/[,\s]+/)
            .map((t) => t.replace(/^#/, '').trim())
            .filter(Boolean)
            .map((t) => (t.includes('/') ? t : `tema/${t}`));
          const content = await this.fromTemplate('Mapa', { titulo: v.titulo.trim(), descripcion: v.descripcion.trim(), temasYaml: temas.length ? temas.map((t) => `  - ${t}`).join('\n') : '  []' });
          await this.createNote(`${this.settings.folders.knowledge}/Mapas`, v.titulo, content.replace(/^temas:\n  \[\]$/m, 'temas: []'));
        })
    ).open();
  }
  // ═════════════════════════════ Conexiones: menciones sin enlazar ═════════════════════════════
  escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  isContentFile(f) {
    if (!(f instanceof TFile) || f.extension !== 'md') return false;
    const F = this.settings.folders;
    if (f.path.startsWith(F.templates.split('/')[0] + '/')) return false;
    if (f.path.includes('/_portadas/')) return false;
    if (['README.md', 'TERCEROS.md', 'THIRD_PARTY.md'].includes(f.path)) return false; // documentos del repositorio
    return true;
  }
  /** Texto con frontmatter, código, enlaces, URLs y etiquetas tapados con espacios (los índices no cambian). */
  async maskedText(file) {
    this.textCache = this.textCache || new Map();
    const c = this.textCache.get(file.path);
    if (c && c.mtime === file.stat.mtime) return c;
    const raw = await this.app.vault.cachedRead(file);
    const blank = (s) => s.replace(/[^\n]/g, ' ');
    let t = raw;
    for (const re of [/^---\r?\n[\s\S]*?\r?\n---/, /```[\s\S]*?```/g, /%%[\s\S]*?%%/g, /`[^`\n]*`/g, /!?\[\[[^\]]*\]\]/g, /\[[^\]]*\]\([^)]*\)/g, /https?:\/\/\S+/g, /<[^>]+>/g, /(^|\s)#[\p{L}\p{N}_/-]+/gu, /^\s*[-*]\s*❓.*$/gm, /^#{1,6} .*$/gm]) t = t.replace(re, blank);
    const out = { mtime: file.stat.mtime, raw, masked: t };
    this.textCache.set(file.path, out);
    return out;
  }
  /** Notas a las que vale la pena enlazar (conocimiento, ramos, biblioteca, rutinas, agenda) con sus nombres. */
  linkTargets() {
    const F = this.settings.folders;
    const roots = [F.knowledge, F.academic, F.library, F.training, F.agenda].map((x) => x + '/');
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!roots.some((r) => f.path.startsWith(r)) || f.path.includes('/_portadas/')) continue;
      const fm = this.fm(f);
      if (hasTipo(fm, 'panel')) continue;
      const names = [f.basename, fm.titulo, fm.nombre, ...toArr(fm.aliases), ...toArr(fm.alias)]
        .filter((s) => typeof s === 'string' && s.trim().length >= 4 && !/^\d{4}-\d{2}/.test(s))
        .map((s) => s.trim());
      if (names.length) out.push({ file: f, names: [...new Set(names)].sort((a, b) => b.length - a.length) });
    }
    return out;
  }
  linkedPaths(file) {
    const set = new Set(Object.keys(this.app.metadataCache.resolvedLinks[file.path] || {}));
    return set;
  }
  firstMention(masked, names) {
    for (const name of names) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}_])${this.escapeRe(name)}(?![\\p{L}\\p{N}_])`, 'iu');
      const m = re.exec(masked);
      if (m) return { index: m.index, length: m[0].length, name };
    }
    return null;
  }
  async findMentionsIn(file) {
    if (!this.isContentFile(file)) return [];
    const { raw, masked } = await this.maskedText(file);
    const linked = this.linkedPaths(file);
    const out = [];
    const used = [];
    for (const t of this.linkTargets()) {
      if (t.file === file || linked.has(t.file.path)) continue;
      const m = this.firstMention(masked, t.names);
      if (!m) continue;
      if (used.some((u) => m.index < u.end && m.index + m.length > u.start)) continue; // no superponer menciones
      used.push({ start: m.index, end: m.index + m.length });
      out.push({ source: file, target: t.file, index: m.index, text: raw.substr(m.index, m.length), raw });
    }
    return out.sort((a, b) => a.index - b.index);
  }
  async mentionsOf(target) {
    const entry = this.linkTargets().find((t) => t.file === target);
    if (!entry) return []; // paneles, diarios y similares no son destinos de enlace
    const names = entry.names;
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f === target || !this.isContentFile(f)) continue;
      if (this.linkedPaths(f).has(target.path)) continue;
      const { raw, masked } = await this.maskedText(f);
      const m = this.firstMention(masked, names);
      if (m) out.push({ source: f, target, index: m.index, text: raw.substr(m.index, m.length), raw });
      if (out.length >= 30) break;
    }
    return out;
  }
  renderContext(el, m) {
    const s = Math.max(0, m.index - 50);
    const e = Math.min(m.raw.length, m.index + m.text.length + 50);
    const ctx = el.createDiv({ cls: 'raiz-conn-ctx' });
    ctx.appendText((s > 0 ? '…' : '') + m.raw.slice(s, m.index).replace(/\s+/g, ' '));
    ctx.createEl('mark', { text: m.text });
    ctx.appendText(m.raw.slice(m.index + m.text.length, e).replace(/\s+/g, ' ') + (e < m.raw.length ? '…' : ''));
  }
  linkMarkup(target, text) {
    return text === target.basename ? `[[${target.basename}]]` : `[[${target.basename}|${text}]]`;
  }
  async linkMention(file, m) {
    await this.app.vault.process(file, (data) => {
      let i = m.index;
      if (data.substr(i, m.text.length) !== m.text) i = data.indexOf(m.text);
      if (i < 0) return data;
      return data.slice(0, i) + this.linkMarkup(m.target, m.text) + data.slice(i + m.text.length);
    });
    this.textCache?.delete(file.path);
    new Notice(`🔗 Enlazado: ${m.target.basename}`);
  }
  async linkAllMentions(file) {
    const list = await this.findMentionsIn(file || this.activeFile());
    if (!list.length) return new Notice('No hay menciones sin enlazar en esta nota.');
    const f = list[0].source;
    await this.app.vault.process(f, (data) => {
      for (const m of [...list].sort((a, b) => b.index - a.index)) {
        if (data.substr(m.index, m.text.length) !== m.text) continue;
        data = data.slice(0, m.index) + this.linkMarkup(m.target, m.text) + data.slice(m.index + m.text.length);
      }
      return data;
    });
    this.textCache?.delete(f.path);
    new Notice(`🔗 ${list.length} enlace(s) creados`);
  }
  /** Agrega un enlace "se conecta con": en el campo mapa si la nota de conocimiento no tiene, o en su sección de conexiones. */
  async appendLink(file, target) {
    const fm = this.fm(file);
    if (hasTipo(fm, 'nota') && !String(fm.mapa || '').trim() && (hasTipo(this.fm(target), 'mapa') || hasTipo(this.fm(target), 'asignatura'))) {
      await this.app.fileManager.processFrontMatter(file, (x) => {
        x.mapa = `[[${target.basename}]]`;
      });
    } else {
      await this.app.vault.process(file, (data) => {
        const line = `- [[${target.basename}]]`;
        const h = data.search(/^#{1,6} .*(Se conecta con|Relacionad|Conexiones).*$/m);
        if (h !== -1) {
          let pos = data.indexOf('\n', h) + 1;
          const after = data.slice(pos);
          const com = after.match(/^%%[\s\S]*?%%\n/);
          if (com) pos += com[0].length;
          const rest = data.slice(pos);
          if (/^-\s*\n/.test(rest)) return data.slice(0, pos) + line + '\n' + rest.replace(/^-\s*\n/, '');
          return data.slice(0, pos) + line + '\n' + rest;
        }
        return data.replace(/\s*$/, '') + `\n\n## 🔗 Se conecta con\n${line}\n`;
      });
    }
    new Notice(`🔗 ${file.basename} → ${target.basename}`);
  }
  async openConnections() {
    let leaf = this.app.workspace.getLeavesOfType(CONN_VIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: CONN_VIEW, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  // ═════════════════════════════ IA local: notas relacionadas (embeddings) ═════════════════════════════
  vecPath() {
    return `${this.manifest.dir}/vectores.json`;
  }
  async loadVec() {
    if (this.vec && this.vec.model === this.embedModelId()) return this.vec;
    try {
      this.vec = JSON.parse(await this.app.vault.adapter.read(this.vecPath()));
    } catch (e) {
      this.vec = null;
    }
    if (!this.vec || this.vec.model !== this.embedModelId()) this.vec = { model: this.embedModelId(), items: {} };
    return this.vec;
  }
  saveVecSoon() {
    clearTimeout(this.vecTimer);
    this.vecTimer = setTimeout(() => this.app.vault.adapter.write(this.vecPath(), JSON.stringify(this.vec)), 1500);
  }
  encVec(arr) {
    let n = 0;
    for (const x of arr) n += x * x;
    n = Math.sqrt(n) || 1;
    const f = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) f[i] = arr[i] / n;
    const b = new Uint8Array(f.buffer);
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  decVec(s) {
    if (!this.vecDecoded) this.vecDecoded = new Map();
    const hit = this.vecDecoded.get(s);
    if (hit) return hit;
    const bin = atob(s);
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    const f = new Float32Array(b.buffer);
    if (this.vecDecoded.size > 5000) this.vecDecoded.clear();
    this.vecDecoded.set(s, f);
    return f;
  }
  async embedTexts(texts, kind = 'document') {
    if (this.embedUsesProvider()) {
      const c = this.aiConf();
      const res = await this.aiRequest(`${c.baseUrl}/embeddings`, { headers: this.aiHeaders(c, this.aiId()), body: { model: c.embed, input: texts } });
      if (res.status >= 400) throw new Error(`${c.label}: ${this.aiError(res)}`);
      return (res.json?.data || []).sort((a, b) => a.index - b.index).map((d) => d.embedding);
    }
    const model = this.settings.embedModel;
    const prefix = /nomic/i.test(model) ? (kind === 'query' ? 'search_query: ' : 'search_document: ') : '';
    let res;
    try {
      res = await requestUrl({
        url: `${this.ollamaUrl()}/api/embed`,
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ model, input: texts.map((t) => prefix + t), truncate: true, keep_alive: this.lowRam() ? '30s' : '5m' }),
        throw: false,
      });
    } catch (e) {
      throw new Error(`No pude conectar con Ollama en ${this.ollamaUrl()}.`);
    }
    if (res.status >= 400) {
      const msg = String(res.json?.error || res.text || res.status);
      if (/not found|pull/i.test(msg)) throw new Error(`Falta el modelo "${model}". Usa "Raíz: Descargar modelos de IA recomendados".`);
      throw new Error(`Ollama: ${msg}`);
    }
    return res.json.embeddings;
  }
  indexableFiles() {
    return this.app.vault.getMarkdownFiles().filter((f) => this.isContentFile(f) && !f.path.startsWith(this.settings.folders.inbox + '/') && !this.isPanel(f) && !['weekly', 'monthly', 'quarterly', 'yearly'].includes(this.levelOf(f)));
  }
  isPanel(f) {
    const fm = this.fm(f);
    if (hasTipo(fm, 'panel')) return true;
    return toArr(fm.cssclasses).includes('raiz-panel') && !['medio', 'nota', 'mapa'].some((t) => hasTipo(fm, t));
  }
  async embedSource(file) {
    const fm = this.fm(file);
    const meta = ['titulo', 'nombre', 'resumen', 'creador', 'categoria', 'entreno', 'alias']
      .map((k) => (fm[k] ? `${k}: ${fm[k]}` : ''))
      .concat(toArr(fm.generos).length ? [`géneros: ${toArr(fm.generos).join(', ')}`] : [])
      .concat(toArr(fm.tags).filter((t) => !/^(conocimiento|nota|mapa|biblioteca|rutina|asignatura|evento)$/i.test(String(t))).length ? [`etiquetas: ${toArr(fm.tags).filter((t) => !/^(conocimiento|nota|mapa|biblioteca|rutina|asignatura|evento)$/i.test(String(t))).join(', ')}`] : [])
      .filter(Boolean)
      .join('\n');
    let body = this.levelOf(file) === 'daily' ? await this.dailyContext(file) : await this.noteText(file);
    // Fuera el texto fijo de las plantillas (títulos de sección, "Mapa:", "Fuente:"…): si no, todo se parece a todo.
    body = body
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return t && !/^[^\n]{0,45}:$/.test(t) && !/^\*\*(Mapa|Fuente|En una frase|Estado|Total|Etiquetas|Tipo|Ver últimas|Semestre)/i.test(t) && !/^(-|\d+\.)$/.test(t);
      })
      .join('\n');
    return `${fm.titulo || file.basename}\n${meta}\n${body}`.slice(0, 3500);
  }
  async indexStatus() {
    const store = await this.loadVec();
    const files = this.indexableFiles();
    const stale = files.filter((f) => store.items[f.path]?.m !== f.stat.mtime);
    return { total: files.length, indexed: files.length - stale.length, stale: stale.length, staleFiles: stale };
  }
  async indexFiles(files, onProgress) {
    const store = await this.loadVec();
    const batch = 8;
    for (let i = 0; i < files.length; i += batch) {
      const part = files.slice(i, i + batch);
      const texts = await Promise.all(part.map((f) => this.embedSource(f)));
      const vecs = await this.embedTexts(texts);
      part.forEach((f, j) => {
        if (vecs[j]) store.items[f.path] = { m: f.stat.mtime, v: this.encVec(vecs[j]) };
      });
      onProgress?.(Math.min(files.length, i + batch), files.length);
    }
    const alive = new Set(this.indexableFiles().map((f) => f.path));
    for (const k of Object.keys(store.items)) if (!alive.has(k)) delete store.items[k];
    this.saveVecSoon();
  }
  async indexVault(silent = false) {
    if (this.indexing) return;
    this.indexing = true;
    const st = await this.indexStatus();
    if (!st.stale) {
      this.indexing = false;
      if (!silent) new Notice(`✨ Índice al día (${st.total} notas).`);
      return;
    }
    const n = silent ? null : new Notice(`✨ Indexando 0/${st.stale}…`, 0);
    try {
      await this.indexFiles(st.staleFiles, (a, b) => {
        n?.setMessage(`✨ Indexando ${a}/${b}…`);
        this.statusEl?.setText(`✦ Indexando ${a}/${b}`);
      });
      if (!silent) new Notice(`✅ ${st.stale} nota(s) indexadas. Las conexiones ya están listas.`);
    } finally {
      n?.hide();
      this.indexing = false;
      this.checkAI(false);
    }
  }
  async relatedTo(file, k = 8) {
    const store = await this.loadVec();
    const ok = new Set(this.indexableFiles().map((f) => f.path));
    if (store.items[file.path]?.m !== file.stat.mtime) await this.indexFiles([file]);
    const q = store.items[file.path] ? this.decVec(store.items[file.path].v) : null;
    if (!q) return [];
    const out = [];
    for (const [path, it] of Object.entries(store.items)) {
      if (path === file.path || !ok.has(path)) continue;
      const f = this.app.vault.getAbstractFileByPath(path);
      if (!(f instanceof TFile)) continue;
      const v = this.decVec(it.v);
      let s = 0;
      for (let i = 0; i < q.length; i++) s += q[i] * v[i];
      out.push({ file: f, score: s });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }
  async askVault(question) {
    const st = await this.indexStatus();
    if (st.stale) await this.indexVault(true);
    const store = await this.loadVec();
    const [qv] = await this.embedTexts([question], 'query');
    const q = this.decVec(this.encVec(qv));
    const scored = [];
    const ok = new Set(this.indexableFiles().map((f) => f.path));
    for (const [path, it] of Object.entries(store.items)) {
      if (!ok.has(path)) continue;
      const f = this.app.vault.getAbstractFileByPath(path);
      if (!(f instanceof TFile)) continue;
      const v = this.decVec(it.v);
      let s = 0;
      for (let i = 0; i < q.length; i++) s += q[i] * v[i];
      scored.push({ file: f, score: s });
    }
    scored.sort((a, b) => b.score - a.score);
    // Solo las notas realmente cercanas a la pregunta (máximo 5)
    const top = scored[0]?.score ?? 0;
    const sources = scored.filter((s, i) => i < 2 || s.score >= top - 0.12).slice(0, 5);
    if (!sources.length) throw new Error('No hay notas indexadas todavía.');
    const ctx = [];
    for (const [i, s] of sources.entries()) ctx.push(`[${i + 1}] ${s.file.basename}\n${(await this.embedSource(s.file)).slice(0, 1200)}`);
    const raw = await this.chat({
      tier: 'deep',
      temperature: 0.2,
      label: 'Buscando en todo tu vault',
      system:
        `${this.systemPrompt()}\nTienes estas notas del usuario como contexto:\n\n${ctx.join('\n\n')}\n\n` +
        'Responde la pregunta directamente en 2 a 6 frases, usando SOLO esas notas y citando la fuente con [n]. No copies las notas ni repitas la pregunta. Si la respuesta no está en las notas, dilo.',
      prompt: question,
    });
    // Un modelo chico a veces repite el contexto antes de responder: se quitan los párrafos copiados.
    const ctxText = ctx.join('\n\n');
    const paras = raw.split(/\n\s*\n/);
    while (paras.length > 1 && (/^(PREGUNTA|NOTAS)\b/i.test(paras[0].trim()) || /^\[\d+\]/.test(paras[0].trim()) || ctxText.includes(paras[0].trim()))) paras.shift();
    const answer = paras.join('\n\n').replace(/^(Entendido|Claro|Respuesta)[,:.]\s*/i, '').trim();
    return { answer, sources };
  }

  // ═════════════════════════════ Bandeja de entrada ═════════════════════════════
  inboxFiles() {
    const folder = this.settings.folders.inbox + '/';
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(folder) && hasTipo(this.fm(f), 'captura'))
      .sort((a, b) => b.stat.ctime - a.stat.ctime);
  }
  capture() {
    new FormModal(
      this.app,
      '📥 Captura rápida',
      [
        { key: 'texto', label: '¿Qué tienes en mente?', type: 'textarea', required: true, placeholder: 'Una idea, algo que aprendiste, una tarea, un anime para ver…' },
        { key: 'clase', label: 'Tipo', type: 'select', options: ['💡 Idea', '🧠 Apunte', '✅ Tarea', '📚 Para ver / leer / jugar', '📅 Evento', '🔗 Link'] },
      ],
      (v) =>
        this.run(async () => {
          const texto = v.texto.trim();
          const words = texto.replace(/\s+/g, ' ').split(' ').slice(0, 7).join(' ');
          const dir = this.settings.folders.inbox;
          await this.ensureFolder(dir);
          let path = `${dir}/${moment().format('YYYY-MM-DD HHmm')} ${safeName(words).slice(0, 60)}.md`;
          let i = 2;
          while (this.app.vault.getAbstractFileByPath(path)) path = path.replace(/( \d+)?\.md$/, ` ${i++}.md`);
          await this.app.vault.create(path, `---\ntipo: captura\nclase: "${v.clase}"\ncreada: ${moment().format('YYYY-MM-DDTHH:mm')}\n---\n${texto}\n`);
          new Notice('📥 Guardado en la bandeja. Lo procesas después con calma.');
        })
    ).open();
  }
  async captureBody(file) {
    return (await this.app.vault.read(file)).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  }
  firstLine(text) {
    return cap(String(text).split('\n')[0].replace(/^[-*#>\s]+/, '').replace(/\s+/g, ' ').slice(0, 90)) || 'Nota';
  }
  async inboxToNote(file, preset = {}) {
    const text = await this.captureBody(file);
    const go = async (mapa) => {
      const titulo = preset.titulo || this.firstLine(text);
      const tags = toArr(preset.etiquetas).map((t) => (String(t).includes('/') ? String(t) : `tema/${norm(t).replace(/\s+/g, '-')}`));
      let content = await this.fromTemplate('Nota', {
        titulo,
        mapa: mapa && mapa !== '(ninguno)' ? `[[${mapa}]]` : '',
        mapaYaml: mapa && mapa !== '(ninguno)' ? JSON.stringify(`[[${mapa}]]`) : '""',
        tagsYaml: ['conocimiento'].concat(tags).map((t) => `  - ${t}`).join('\n'),
        fuente: 'Bandeja de entrada',
        fecha: isoDate(moment()),
      });
      content = content.replace(/(## 💡 La idea\n(?:%%[\s\S]*?%%\n)?)- \n/, `$1${text}\n`);
      await this.createNote(`${this.settings.folders.knowledge}/Notas`, titulo, content);
      await this.app.vault.trash(file, true);
    };
    if (preset.mapa !== undefined) return go(preset.mapa);
    new StringPicker(this.app, this.mocTargets(), '¿A qué mapa o asignatura pertenece?', (m) => this.run(() => go(m))).open();
  }
  async inboxToTask(file) {
    const text = (await this.captureBody(file)).replace(/\s+/g, ' ');
    const today = this.dailyFor(moment());
    if (!today) {
      await this.openToday();
      throw new Error('Creé tu nota de hoy: vuelve a apretar "A hoy" en unos segundos.');
    }
    await this.app.vault.process(today, (data) => {
      const h = data.search(/^#{1,6} .*Tareas.*$/m);
      const line = `- [ ] ${text}`;
      if (h === -1) return data + `\n${line}\n`;
      const pos = data.indexOf('\n', h) + 1;
      const rest = data.slice(pos);
      if (/^- \[ \] \s*\n/.test(rest)) return data.slice(0, pos) + line + '\n' + rest.replace(/^- \[ \] \s*\n/, '');
      return data.slice(0, pos) + line + '\n' + rest;
    });
    await this.app.vault.trash(file, true);
    new Notice('✅ Tarea agregada a tu día');
  }
  async inboxSuggest(file) {
    const text = await this.captureBody(file);
    const maps = this.mocTargets().filter((m) => m !== '(ninguno)');
    const out = await this.chat({
      tier: 'fast',
      temperature: 0.2,
      label: 'Pensando dónde va',
      schema: {
        type: 'object',
        properties: {
          destino: { type: 'string', enum: ['nota', 'tarea', 'biblioteca', 'evento', 'descartar'] },
          mapa: { type: 'string' },
          titulo: { type: 'string' },
          obra: { type: 'string' },
          etiquetas: { type: 'array', items: { type: 'string' }, maxItems: 3 },
          motivo: { type: 'string' },
        },
        required: ['destino', 'titulo', 'obra', 'motivo'],
      },
      prompt:
        `Clasifica esta captura de mi bandeja de entrada. Destinos: "nota" (idea o aprendizaje que vale guardar), "tarea" (algo por hacer), "biblioteca" (juego, libro, anime, manga, película o serie por consumir), "evento" (algo con fecha), "descartar" (sin valor). ` +
        'Ejemplos: "Ver Frieren cuando termine el semestre" → biblioteca; "Pagar la matrícula el viernes" → tarea; "Reunión con el profe el 20 a las 15:00" → evento; "Las claves foráneas con CASCADE pueden borrar datos en cadena" → nota. ' +
        `Al capturar marqué el tipo: ${this.fm(file).clase || 'sin tipo'} (úsalo como pista fuerte). ` +
        `Si es "nota", elige el mapa más adecuado EXACTAMENTE de esta lista o deja vacío: ${maps.join(' | ') || '(sin mapas)'}; propone un título claro y hasta 3 etiquetas cortas en minúscula. "obra": si la captura nombra un juego, libro, anime, manga, película o serie, escribe SOLO su nombre (ej: "Frieren"); si no, vacío. "motivo": una frase.\n\nCAPTURA:\n${text}`,
    });
    if (out.mapa && !maps.includes(out.mapa)) out.mapa = '';
    // El tipo que elegiste al capturar manda sobre la suposición del modelo
    const clase = String(this.fm(file).clase || '');
    const forced = clase.includes('📚') ? 'biblioteca' : clase.includes('✅') ? 'tarea' : clase.includes('📅') ? 'evento' : null;
    if (forced) out.destino = forced;
    if (out.destino === 'biblioteca') out.titulo = String(out.obra || '').trim() || this.guessWork(text) || out.titulo;
    return out;
  }
  /** "Ver Frieren cuando termine el semestre" → "Frieren" (sin depender del modelo). */
  guessWork(text) {
    const line = this.firstLine(text);
    const m = line.match(
      /^(?:quiero\s+|tengo que\s+|hay que\s+)?(?:ver|leer|jugar|mirar|escuchar|terminar(?:\s+de\s+(?:ver|leer|jugar))?|empezar(?:\s+a\s+(?:ver|leer|jugar))?|seguir(?:\s+(?:viendo|leyendo|jugando))?)\s+(?:el\s+|la\s+|los\s+|las\s+)?(?:anime\s+|manga\s+|libro\s+|juego\s+|serie\s+|pel[ií]cula\s+)?(.+?)(?:\s+(?:cuando|después|apenas|en\s+(?:las|el|la|vacaciones)|este|esta|el\s+próximo|la\s+próxima|algún|antes|durante|porque|que|para)\b.*)?$/i
    );
    return m ? cap(m[1].replace(/[.,;:!?]+$/, '').trim()) : '';
  }
  async inbox(dv, container) {
    const files = this.inboxFiles();
    const bar = container.createDiv({ cls: 'raiz-lib-bar' });
    bar.createEl('button', { cls: 'mod-cta', text: '📥 Capturar' }).addEventListener('click', () => this.capture());
    bar.createSpan({ cls: 'raiz-muted', text: files.length ? `${files.length} por procesar · decide qué es cada cosa: conectar, hacer o soltar.` : '' });
    if (!files.length) {
      container.createDiv({ cls: 'raiz-empty', text: '✨ Bandeja vacía. Mente despejada.' });
      return;
    }
    const list = container.createDiv({ cls: 'raiz-inbox' });
    for (const f of files) {
      const fm = this.fm(f);
      const text = await this.captureBody(f);
      const card = list.createDiv({ cls: 'raiz-inbox-card' });
      const head = card.createDiv({ cls: 'raiz-conn-row' });
      head.createSpan({ cls: 'raiz-chip is-static', text: String(fm.clase || '💡 Idea') });
      const when = fm.creada && moment(String(fm.creada)).isValid() ? moment(String(fm.creada)) : moment(f.stat.ctime);
      head.createSpan({ cls: 'raiz-muted', text: when.fromNow ? when.fromNow() : fechaCorta(when) });
      card.createDiv({ cls: 'raiz-inbox-text', text: text.slice(0, 500) });
      const sug = card.createDiv({ cls: 'raiz-inbox-sug' });
      const btns = card.createDiv({ cls: 'raiz-inbox-btns' });
      const b = (label, fn, cls = 'raiz-chip') => btns.createEl('button', { cls, text: label }).addEventListener('click', () => this.run(fn));
      b('🧠 Nota', () => this.inboxToNote(f));
      b('✅ A hoy', () => this.inboxToTask(f));
      b('📚 Biblioteca', async () => {
        const m = new MediaModal(this);
        m.prefill = this.firstLine(text);
        m.onAdded = () => this.app.vault.trash(f, true);
        m.open();
      });
      b('📅 Evento', async () => this.newEvent({ titulo: this.firstLine(text) }, () => this.app.vault.trash(f, true)));
      b('✨ IA', async () => {
        sug.setText('Pensando…');
        const s = await this.inboxSuggest(f);
        sug.empty();
        sug.createSpan({ text: `✨ ${s.destino.toUpperCase()}${s.mapa ? ` → ${s.mapa}` : ''}: ${s.motivo}` });
        const apply = sug.createEl('button', { cls: 'raiz-chip is-active', text: 'Aplicar' });
        apply.addEventListener('click', () =>
          this.run(async () => {
            if (s.destino === 'nota') return this.inboxToNote(f, { mapa: s.mapa || '(ninguno)', titulo: s.titulo, etiquetas: s.etiquetas });
            if (s.destino === 'tarea') return this.inboxToTask(f);
            if (s.destino === 'descartar') return this.app.vault.trash(f, true);
            if (s.destino === 'evento') return this.newEvent({ titulo: s.titulo }, () => this.app.vault.trash(f, true));
            const m = new MediaModal(this);
            m.prefill = s.titulo;
            m.onAdded = () => this.app.vault.trash(f, true);
            m.open();
          })
        );
      });
      b('🗑', async () => {
        await this.app.vault.trash(f, true);
        new Notice('🗑 Descartado (queda en la papelera del sistema)');
      }, 'raiz-icon-btn');
      b('↗', async () => this.app.workspace.openLinkText(f.path, '', false), 'raiz-icon-btn');
    }
  }

  // ═════════════════════════════ Etiquetas organizadas ═════════════════════════════
  tagKey(t) {
    let k = norm(String(t).replace(/^#/, '')).replace(/[-_\s]+/g, '-');
    if (k.length > 5) k = k.replace(/(es|s)$/, '');
    return k;
  }
  reservedTag(t) {
    const base = String(t).replace(/^#/, '').toLowerCase();
    const fixed = ['biblioteca', 'conocimiento', 'mapa', 'asignatura', 'evento', 'rutina', 'nota', 'progress', 'highlight', 'idea', 'captura'];
    return base.includes('/') || fixed.includes(base) || this.settings.mediaCategories.some((c) => c.key === base);
  }
  /** Etiquetas exactas por nota (sin contar los "padres" de las anidadas como etiquetas aparte). */
  allTags() {
    const counts = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.isContentFile(f)) continue;
      const tags = new Set((getAllTags(this.app.metadataCache.getFileCache(f)) || []).map((t) => t.replace(/^#/, '')));
      for (const t of tags) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n);
  }
  filesWithTag(tag) {
    const want = tag.toLowerCase();
    return this.app.vault.getMarkdownFiles().filter((f) => {
      const c = this.app.metadataCache.getFileCache(f);
      return (getAllTags(c) || []).some((t) => {
        const x = t.replace(/^#/, '').toLowerCase();
        return x === want || x.startsWith(want + '/');
      });
    });
  }
  async renameTag(from, to) {
    from = from.replace(/^#/, '');
    to = to.replace(/^#/, '').replace(/\s+/g, '-');
    const files = this.filesWithTag(from);
    const re = new RegExp(`(^|[\\s(\\[,])#${this.escapeRe(from)}(?=[\\s/.,;:!?)\\]]|$)`, 'gimu');
    const fmRe = new RegExp(`^#?${this.escapeRe(from)}(?=/|$)`, 'i');
    for (const f of files) {
      await this.app.fileManager.processFrontMatter(f, (fm) => {
        for (const k of ['tags', 'tag']) {
          if (fm[k] === undefined || fm[k] === null) continue;
          const arr = toArr(fm[k]).flatMap((x) => String(x).split(/[,\s]+/)).filter(Boolean);
          fm[k] = [...new Set(arr.map((x) => (fmRe.test(x) ? x.replace(fmRe, to) : x)))];
        }
      });
      await this.app.vault.process(f, (data) => {
        const m = data.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
        const head = m ? m[0] : '';
        return head + data.slice(head.length).replace(re, `$1#${to}`);
      });
    }
    new Notice(`🏷️ #${from} → #${to} en ${files.length} nota(s)`);
  }
  mocTopics() {
    const set = new Set();
    for (const f of this.knowledgeFiles()) {
      const fm = this.fm(f);
      if (hasTipo(fm, 'mapa')) for (const t of toArr(fm.temas)) set.add(String(t).replace(/^#/, '').toLowerCase());
    }
    return set;
  }
  async tagsPanel(dv, container) {
    const tags = this.allTags();
    const groups = new Map();
    for (const t of tags) {
      const k = this.tagKey(t.tag);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    const dups = [...groups.values()].filter((g) => g.length > 1);
    const loose = tags.filter((t) => !this.reservedTag(t.tag));
    const topics = this.mocTopics();
    this.kpis(container, [
      ['Etiquetas', tags.length, ''],
      ['Temas', tags.filter((t) => /^tema\//.test(t.tag)).length, '#tema/…'],
      ['Duplicadas', dups.length, dups.length ? 'para unificar' : 'ninguna'],
      ['Sin ordenar', loose.length, 'sin prefijo'],
    ]);
    container.createDiv({ cls: 'raiz-muted', text: 'Convención: #tema/… para el contenido (tema/sql, tema/nutrición), #estado/… para el avance (estado/borrador), #tipo/… para la forma (tipo/receta). Las etiquetas agrupan; los mapas conectan.' });
    if (dups.length) {
      this.heading(container, '⚠️ Posibles duplicadas');
      for (const g of dups) {
        const row = container.createDiv({ cls: 'raiz-conn-row raiz-tag-row' });
        const best = [...g].sort((a, b) => b.n - a.n || a.tag.length - b.tag.length)[0];
        for (const t of g) row.createSpan({ cls: 'raiz-tag', text: `#${t.tag} · ${t.n}` });
        row.createEl('button', { cls: 'raiz-chip', text: `Unificar en #${best.tag}` }).addEventListener('click', () =>
          this.run(async () => {
            for (const t of g) if (t.tag !== best.tag) await this.renameTag(t.tag, best.tag);
          })
        );
      }
    }
    if (loose.length) {
      this.heading(container, '🧺 Sin ordenar');
      for (const t of loose.slice(0, 40)) {
        const row = container.createDiv({ cls: 'raiz-conn-row raiz-tag-row' });
        row.createSpan({ cls: 'raiz-tag', text: `#${t.tag} · ${t.n}` });
        row.createEl('button', { cls: 'raiz-chip', text: `→ #tema/${t.tag}` }).addEventListener('click', () => this.run(() => this.renameTag(t.tag, `tema/${t.tag}`)));
        row.createEl('button', { cls: 'raiz-chip', text: '✏️ Renombrar' }).addEventListener('click', () =>
          new FormModal(this.app, `Renombrar #${t.tag}`, [{ key: 'to', label: 'Nuevo nombre', value: t.tag, required: true }], (v) => this.run(() => this.renameTag(t.tag, v.to.trim()))).open()
        );
      }
    }
    const suggest = tags.filter((t) => /^tema\//.test(t.tag) && t.n >= 5 && !topics.has(t.tag.toLowerCase()));
    if (suggest.length) {
      this.heading(container, '🗺️ Temas que ya merecen un mapa');
      for (const t of suggest) {
        const row = container.createDiv({ cls: 'raiz-conn-row raiz-tag-row' });
        row.createSpan({ cls: 'raiz-tag', text: `#${t.tag} · ${t.n} notas` });
        row.createEl('button', { cls: 'raiz-chip is-active', text: 'Crear mapa' }).addEventListener('click', () => this.newMoc({ titulo: cap(t.tag.split('/').pop().replace(/-/g, ' ')), temas: [t.tag] }));
      }
    }
    this.heading(container, '🌳 Todas');
    const tree = container.createDiv({ cls: 'raiz-hero-genres' });
    for (const t of [...tags].sort((a, b) => a.tag.localeCompare(b.tag, 'es'))) {
      const chip = tree.createEl('a', { cls: 'raiz-tag', text: `#${t.tag} ${t.n}` });
      chip.addEventListener('click', () => {
        const s = this.app.internalPlugins?.getPluginById?.('global-search')?.instance;
        if (s) s.openGlobalSearch(`tag:#${t.tag}`);
      });
    }
  }

  // ═════════════════════════════ Repaso espaciado de apuntes ═════════════════════════════
  hashStr(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  parseCards(text) {
    const out = [];
    const re = /^\s*[-*]\s*❓\s*(.+?)\s*➜\s*(.+?)\s*$/gm;
    let m;
    while ((m = re.exec(text))) out.push({ q: m[1].trim(), a: m[2].trim(), id: this.hashStr(norm(m[1])) });
    return out;
  }
  async allCards() {
    this.cardCache = this.cardCache || new Map();
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.isContentFile(f)) continue;
      let c = this.cardCache.get(f.path);
      if (!c || c.mtime !== f.stat.mtime) {
        const txt = await this.app.vault.cachedRead(f);
        c = { mtime: f.stat.mtime, cards: txt.includes('❓') ? this.parseCards(txt) : [] };
        this.cardCache.set(f.path, c);
      }
      for (const card of c.cards) out.push(Object.assign({ file: f, key: `${f.path}::${card.id}`, group: this.cardGroup(f) }, card));
    }
    return out;
  }
  cardGroup(file) {
    const fm = this.fm(file);
    if (hasTipo(fm, 'asignatura')) return file.basename;
    const mapa = String(fm.mapa || '').replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();
    if (mapa) return mapa;
    return file.parent?.name || 'General';
  }
  reviewPath() {
    return `${this.manifest.dir}/repaso.json`;
  }
  async loadReview() {
    if (this.rev) return this.rev;
    try {
      this.rev = JSON.parse(await this.app.vault.adapter.read(this.reviewPath()));
    } catch (e) {
      this.rev = { cards: {}, log: {} };
    }
    return this.rev;
  }
  async saveReview() {
    await this.app.vault.adapter.write(this.reviewPath(), JSON.stringify(this.rev));
  }
  /** SM-2 simplificado. grade: 0 otra vez · 1 difícil · 2 bien · 3 fácil */
  schedule(state, grade, today = moment()) {
    const s = Object.assign({ ef: 2.5, int: 0, reps: 0 }, state || {});
    if (grade === 0) {
      s.reps = 0;
      s.int = 0;
      s.ef = Math.max(1.3, s.ef - 0.2);
    } else {
      if (grade === 1) {
        s.int = Math.max(1, Math.round((s.int || 1) * 1.2));
        s.ef = Math.max(1.3, s.ef - 0.15);
      } else if (s.reps === 0) s.int = grade === 3 ? 4 : 1;
      else if (s.reps === 1) s.int = grade === 3 ? 6 : 3;
      else s.int = Math.round(s.int * s.ef * (grade === 3 ? 1.3 : 1));
      if (grade === 3) s.ef += 0.15;
      s.reps += 1;
    }
    s.due = isoDate(today.clone().add(s.int, 'days'));
    s.last = isoDate(today);
    return s;
  }
  intervalLabel(state, grade) {
    const n = this.schedule(state, grade).int;
    return n === 0 ? 'hoy' : n === 1 ? '1 d' : n < 30 ? `${n} d` : `${Math.round(n / 30)} m`;
  }
  async dueSummary() {
    const cards = await this.allCards();
    const rev = await this.loadReview();
    const today = isoDate(moment());
    const due = cards.filter((c) => rev.cards[c.key] && rev.cards[c.key].due <= today).length;
    const fresh = cards.filter((c) => !rev.cards[c.key]).length;
    const newDone = rev.log[today]?.nuevas || 0;
    return { total: cards.length, due, fresh, newToday: Math.max(0, Math.min(fresh, (this.settings.newCardsPerDay || 15) - newDone)) };
  }
  async generateCards() {
    const file = this.activeFile();
    const text = await this.noteText(file);
    if (text.replace(/\s+/g, ' ').length < 120) throw new Error('La nota es muy corta para sacar preguntas. Escribe un poco más primero.');
    const existing = this.parseCards(await this.app.vault.read(file)).map((c) => c.q);
    const out = await this.chat({
      tier: 'deep',
      temperature: 0.3,
      label: 'Creando preguntas de repaso',
      schema: {
        type: 'object',
        properties: { preguntas: { type: 'array', minItems: 3, maxItems: 8, items: { type: 'object', properties: { pregunta: { type: 'string' }, respuesta: { type: 'string' } }, required: ['pregunta', 'respuesta'] } } },
        required: ['preguntas'],
      },
      prompt:
        'Crea preguntas de repaso tipo certamen universitario a partir de este apunte. Reglas: cubre los conceptos clave, una idea por pregunta, nada trivial, cada respuesta en una sola frase corta, en español. ' +
        (existing.length ? `No repitas estas: ${existing.join(' | ')}. ` : '') +
        `Responde en JSON con "preguntas".\n\nAPUNTE (${file.basename}):\n${text.slice(0, 6000)}`,
    });
    const lines = (out.preguntas || [])
      .map((x) => {
        const clean = (v) =>
          String(v || '')
            .replace(/[➜\n]/g, ' ')
            .replace(/\s*\((?:[^)]*palabras[^)]*)\)/gi, '')
            .replace(/[\p{Extended_Pictographic}️‍]+/gu, '')
            .replace(/\s+/g, ' ')
            .trim();
        return { q: clean(x.pregunta), a: clean(x.respuesta) };
      })
      .filter((x) => x.q && x.a)
      .map((x) => `- ❓ ${x.q} ➜ ${x.a}`);
    if (!lines.length) throw new Error('El modelo no devolvió preguntas. Intenta de nuevo.');
    await this.app.vault.process(file, (data) => {
      const h = data.search(/^#{1,6} .*Preguntas de repaso.*$/m);
      if (h === -1) return data.replace(/\s*$/, '') + `\n\n## 🃏 Preguntas de repaso\n${lines.join('\n')}\n`;
      const next = data.slice(h + 1).search(/^#{1,6} /m);
      const end = next === -1 ? data.length : h + 1 + next;
      return data.slice(0, end).replace(/\s*$/, '\n') + lines.join('\n') + '\n' + (next === -1 ? '' : '\n' + data.slice(end));
    });
    new Notice(`🃏 ${lines.length} preguntas nuevas. Repásalas en "Repaso".`);
  }
  async review(dv, container) {
    const rev = await this.loadReview();
    const cards = await this.allCards();
    const today = moment();
    const t = isoDate(today);
    this.revUi = this.revUi || { group: 'todos', mode: 'normal' };
    const ui = this.revUi;
    const exams = this.upcomingEvaluations(dv, today, 21);
    const groups = [...new Set(cards.map((c) => c.group))].sort((a, b) => a.localeCompare(b, 'es'));
    const root = container.createDiv({ cls: 'raiz-rev' });
    const sum = await this.dueSummary();
    this.kpis(root, [
      ['Para hoy', sum.due + sum.newToday, `${sum.due} repasos · ${sum.newToday} nuevas`],
      ['Repasadas hoy', rev.log[t]?.total || 0, ''],
      ['Tarjetas', sum.total, `${groups.length} temas`],
      ['Racha', `${this.reviewStreak(rev)} d`, 'días seguidos repasando'],
    ]);
    if (!cards.length) {
      root.createDiv({ cls: 'raiz-empty', text: 'Aún no hay preguntas. Abre un apunte y usa "Raíz: Generar preguntas de repaso", o escribe líneas como:  - ❓ ¿Qué es 3FN? ➜ Una tabla en 2FN sin dependencias transitivas.' });
      return;
    }
    const chips = root.createDiv({ cls: 'raiz-lib-tabs' });
    const mk = (key, label) => {
      const b = chips.createEl('button', { cls: 'raiz-tab' + (ui.group === key ? ' is-active' : ''), text: label });
      b.addEventListener('click', () => {
        ui.group = key;
        ui.mode = 'normal';
        container.empty();
        this.review(dv, container);
      });
    };
    mk('todos', `✨ Todo · ${cards.length}`);
    for (const g of groups) {
      const exam = exams.find((e) => (e.course.nombre || e.course.file.name) === g || e.course.file.name === g);
      mk(g, `${exam ? '📝 ' : ''}${g} · ${cards.filter((c) => c.group === g).length}`);
    }
    for (const e of exams.slice(0, 3)) {
      const g = e.course.file.name;
      if (!groups.includes(g)) continue;
      const d = e.fecha.diff(today.clone().startOf('day'), 'days');
      const row = root.createDiv({ cls: 'raiz-exam' });
      row.createSpan({ text: `📝 ${e.nombre} de ${g} en ${d} día(s)` });
      row.createEl('button', { cls: 'raiz-chip is-active', text: 'Modo certamen' }).addEventListener('click', () => {
        ui.group = g;
        ui.mode = 'certamen';
        container.empty();
        this.review(dv, container);
      });
    }
    let pool = cards.filter((c) => ui.group === 'todos' || c.group === ui.group);
    let queue;
    if (ui.mode === 'certamen') queue = pool.sort(() => Math.random() - 0.5);
    else {
      const due = pool.filter((c) => rev.cards[c.key] && rev.cards[c.key].due <= t).sort((a, b) => rev.cards[a.key].due.localeCompare(rev.cards[b.key].due));
      const fresh = pool.filter((c) => !rev.cards[c.key]).slice(0, sum.newToday);
      queue = due.concat(fresh);
    }
    const stage = root.createDiv({ cls: 'raiz-flash-stage' });
    let i = 0;
    const total = queue.length;
    const show = () => {
      stage.empty();
      if (i >= queue.length) {
        if (total) this.celebrate(stage);
        stage.createDiv({ cls: 'raiz-empty', text: total ? `🎉 ¡Listo! Repasaste ${total} tarjeta(s).` : '🎉 Nada pendiente por hoy en este tema.' });
        if (ui.mode !== 'certamen' && pool.length) {
          stage.createEl('button', { cls: 'raiz-chip', text: '🔁 Practicar todo el tema igual' }).addEventListener('click', () => {
            ui.mode = 'certamen';
            container.empty();
            this.review(dv, container);
          });
        }
        return;
      }
      const c = queue[i];
      const st = rev.cards[c.key];
      const prog = stage.createDiv({ cls: 'raiz-rest-bar' });
      prog.createDiv().style.width = `${Math.round((i / total) * 100)}%`;
      const card = stage.createDiv({ cls: 'raiz-flash' });
      card.createDiv({ cls: 'raiz-flash-meta', text: `${i + 1}/${total} · ${c.group}${st ? '' : ' · nueva'}` });
      card.createDiv({ cls: 'raiz-flash-q', text: c.q });
      const ans = card.createDiv({ cls: 'raiz-flash-a is-hidden', text: c.a });
      const src = card.createDiv({ cls: 'raiz-flash-src' });
      this.link(src, c.file, `📄 ${c.file.basename}`);
      const actions = stage.createDiv({ cls: 'raiz-flash-actions' });
      const reveal = actions.createEl('button', { cls: 'mod-cta', text: 'Mostrar respuesta (espacio)' });
      const rate = async (g) => {
        if (ui.mode !== 'certamen' || g === 0 || st) {
          rev.cards[c.key] = this.schedule(st, g, moment());
          const log = (rev.log[t] = rev.log[t] || { total: 0, nuevas: 0 });
          log.total += 1;
          if (!st) log.nuevas += 1;
          await this.saveReview();
        }
        if (g === 0) queue.push(c);
        i += 1;
        show();
      };
      const showRating = () => {
        ans.removeClass('is-hidden');
        actions.empty();
        const labels = [['Otra vez', 0, 'r-again'], ['Difícil', 1, 'r-hard'], ['Bien', 2, 'r-good'], ['Fácil', 3, 'r-easy']];
        for (const [l, g, cls] of labels) {
          const b = actions.createEl('button', { cls: `raiz-rate-btn ${cls}` });
          b.createDiv({ text: `${g + 1} · ${l}` });
          b.createDiv({ cls: 'raiz-muted', text: this.intervalLabel(st, g) });
          b.addEventListener('click', () => rate(g));
        }
      };
      reveal.addEventListener('click', showRating);
      this.flashKeys = (e) => {
        if (!root.isConnected) return (this.flashKeys = null);
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
        if (e.key === ' ' && ans.hasClass('is-hidden')) {
          e.preventDefault();
          showRating();
        } else if (!ans.hasClass('is-hidden') && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) - 1);
      };
    };
    show();
  }
  reviewStreak(rev) {
    let n = 0;
    for (let d = moment(); rev.log[isoDate(d)]?.total; d.subtract(1, 'day')) n++;
    if (!n && rev.log[isoDate(moment().subtract(1, 'day'))]?.total) {
      for (let d = moment().subtract(1, 'day'); rev.log[isoDate(d)]?.total; d.subtract(1, 'day')) n++;
    }
    return n;
  }
  // ═════════════════════════════ Constructor de notas periódicas (diaria → anual) ═════════════════════════════
  periodPaths(m) {
    const F = this.settings.folders;
    const d = moment(m);
    return {
      daily: (x) => `${F.daily}/${x.format('YYYY')}/${x.format('MM-MMMM')}/${x.format('YYYY-MM-DD-dddd')}`,
      weekly: (x) => `${F.weekly}/${x.format('GGGG')}/${x.format('GGGG-[W]WW')}`,
      monthly: (x) => `${F.monthly}/${x.format('YYYY')}/${x.format('YYYY-MM-MMMM')}`,
      quarterly: (x) => `${F.quarterly}/${x.format('YYYY')}/${x.format('YYYY-[Q]Q')}`,
      yearly: (x) => `${F.yearly}/${x.format('YYYY')}`,
      base: d,
    };
  }
  mbButton(id, label, actionYaml, style = 'primary') {
    const icons = { '⚡': 'zap', '⭐': 'star', '🏷️': 'tag', '✨': 'sparkles', '🔎': 'search', '🎯': 'target', '💡': 'lightbulb', '🌟': 'sun', '🔭': 'telescope', '📥': 'inbox', '📅': 'calendar-plus', '🎓': 'graduation-cap', '🏋️': 'dumbbell', '➕': 'plus', '🧠': 'brain', '🔗': 'link', '🃏': 'layers' };
    const m = String(label).match(/^([\p{Extended_Pictographic}\uFE0F\u200D]+)\s*/u);
    const icon = m ? icons[m[1]] || icons[m[1].replace(/\uFE0F/g, '')] : null;
    if (m) label = label.slice(m[0].length);
    return ['```meta-bind-button', `id: ${id}`, `label: ${JSON.stringify(label)}`, ...(icon ? [`icon: ${icon}`] : []), `style: ${style}`, 'class: raiz-btn', 'hidden: true', 'actions:', actionYaml, '```'].join('\n');
  }
  mbCmd(id, label, cmd, style) {
    return this.mbButton(id, label, `  - type: command\n    command: ${cmd}`, style);
  }
  mbOpen(id, label, path) {
    return this.mbButton(id, label, `  - type: open\n    link: ${JSON.stringify(`[[${path}]]`)}\n    newTab: false`);
  }
  buttonRow(defs) {
    return '`BUTTON[' + defs.map((d) => d.id).join(', ') + ']`\n' + defs.map((d) => d.block).join('\n');
  }
  dvBlock(fn, args = '') {
    return '```dataviewjs\nif (window.raiz) await window.raiz.charts.' + fn + '(dv, this.container' + (args ? ', ' + args : '') + '); else dv.paragraph("Cargando Raíz…");\n```';
  }
  bannerYaml(level, m) {
    const dir = this.settings.folders.banners;
    let name;
    if (level === 'daily') name = `banner-dia-${m.isoWeekday()}`;
    else if (level === 'weekly') name = `banner-semana-${(m.isoWeek() % 4) + 1}`;
    else if (level === 'monthly') name = `banner-mes-${(m.month() % 4) + 1}`;
    else if (level === 'quarterly') name = `banner-trimestre-${m.quarter()}`;
    else name = 'banner-anio';
    const file = this.app.vault.getAbstractFileByPath(`${dir}/${name}.svg`);
    const def = `"[[${file ? file.path : name + '.svg'}]]"`;
    const own = this.sectionBanner(level);
    if (own !== null) return [...(own ? [`banner: ${JSON.stringify(own)}`] : []), `banner-original: ${def}`, 'banner-y: 50', 'banner-height: 320', 'content-start: 210', 'banner-fade: -75', 'banner-radius: 22'].join('\n');
    return [`banner: ${def}`, 'banner-y: 50', 'banner-height: 320', 'content-start: 210', 'banner-fade: -75', 'banner-radius: 22'].join('\n');
  }
  qaBlock(levelName) {
    return [
      `### 🔎 Pregúntale a tu ${levelName}`,
      "`INPUT[text(placeholder('Escribe una pregunta…'), class('raiz-input-big')):pregunta]`",
      this.buttonRow([{ id: 'raiz-preguntar', block: this.mbCmd('raiz-preguntar', '🔎 Preguntar', 'raiz:ask-note') }]),
      '```meta-bind\nINPUT[editor(class(raiz-editor)):respuesta]\n```',
    ].join('\n');
  }
  /** Contenido completo de una nota diaria, semanal, mensual, trimestral o anual. */
  buildNote(level, title, { cursor = true } = {}) {
    const P = this.periodPaths();
    const dateOf = {
      daily: () => moment(title.slice(0, 10), 'YYYY-MM-DD', true),
      weekly: () => moment(title.slice(0, 8), 'GGGG-[W]WW', true).startOf('isoWeek'),
      monthly: () => moment(title.slice(0, 7), 'YYYY-MM', true).startOf('month'),
      quarterly: () => moment(title.slice(0, 7), 'YYYY-[Q]Q', true).startOf('quarter'),
      yearly: () => moment(title.slice(0, 4), 'YYYY', true).startOf('year'),
    };
    const m = dateOf[level]();
    if (!m.isValid()) throw new Error(`No entiendo la fecha de "${title}".`);
    const fm = [];
    const body = [];
    const tipo = { daily: 'diaria', weekly: 'semanal', monthly: 'mensual', quarterly: 'trimestral', yearly: 'anual' }[level];
    const cls = { daily: 'raiz-dia', weekly: 'raiz-semana', monthly: 'raiz-mes', quarterly: 'raiz-trimestre', yearly: 'raiz-anio' }[level];
    const accent = { daily: m.clone().locale('en').format('dddd').toLowerCase(), weekly: 'weekly', monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly' }[level];
    fm.push(this.bannerYaml(level, m));
    fm.push(`cssclasses:\n  - ${cls}\n  - ${accent}`);
    fm.push(`tipo: ${tipo}`, `date: ${isoDate(m)}`, 'alias: ', 'pregunta: ', 'respuesta: ""');
    const aliasInput = (ph) => "```meta-bind\nINPUT[text(placeholder('" + ph + "'), class('raiz-input-big')):alias]\n```";
    const nav = (prev, up, next) =>
      this.buttonRow([
        { id: 'raiz-ant', block: this.mbOpen('raiz-ant', prev[0], prev[1]) },
        ...(up ? [{ id: 'raiz-sup', block: this.mbOpen('raiz-sup', up[0], up[1]) }] : []),
        { id: 'raiz-sig', block: this.mbOpen('raiz-sig', next[0], next[1]) },
      ]);
    const aiRow = (defs) => this.buttonRow(defs.map(([id, label, cmd]) => ({ id, block: this.mbCmd(id, label, cmd) })));
    const sumEditor = '```meta-bind\nINPUT[editor(class(raiz-editor)):resumen]\n```';

    if (level === 'daily') {
      fm.push('valoracion: ', 'motivoValoracion: ""', 'animo: ', 'energia: ', 'sueno: ', 'peso: ', 'horasEstudio: ', 'entreno: ', 'duracion: ', 'rpe: ', this.habitsFrontmatter());
      fm.push(`journal: daily\njournal-date: ${isoDate(m)}\njournal-start-date: ${isoDate(m)}\njournal-end-date: ${isoDate(m)}`);
      const week = m.clone();
      body.push(`# ${fechaLarga(m)}`, `[[${week.format('GGGG-[W]WW')}|]]`);
      body.push(nav(['← Ayer', P.daily(m.clone().subtract(1, 'day'))], [`Semana ${m.isoWeek()}`, P.weekly(m)], ['Mañana →', P.daily(m.clone().add(1, 'day'))]));
      body.push('', aliasInput('Ponle nombre a tu día'), '---', cursor ? '- <% tp.file.cursor(0) %>' : '- ', '', '');
      body.push(aiRow([['raiz-ia-dia', '⚡ IA: nota + título', 'raiz:ai-day'], ['raiz-ia-nota', '⭐ IA: nota', 'raiz:ai-rate'], ['raiz-ia-titulo', '🏷️ IA: título', 'raiz:ai-title']]));
      body.push('---', '### 🌅 Hoy', this.dvBlock('dailyToday'), '', '### ✅ Tareas', '- [ ] ', '', '### 🏋️ Entrenamiento', this.trainingBlock(), '');
      body.push(
        '### 🎯 Mis metas',
        this.dvBlock('goals'),
        '',
        '### 🌡️ Check-in',
        '- 🙂 **Ánimo** `INPUT[slider(minValue(1), maxValue(5), addLabels):animo]`',
        '- ⚡ **Energía** `INPUT[slider(minValue(1), maxValue(5), addLabels):energia]`',
        this.habitsBlock(),
        '',
        '---',
        '### 📷 Fotos',
        '%% Pega aquí las fotos del día: aparecen solas en la galería de la semana y del mes. %%',
        '',
        '---',
        '```meta-bind\nINPUT[progressBar(title(⭐ Valoración del día), minValue(1), maxValue(10), class(raiz-progress), addLabels(true)):valoracion]\n```',
        '`VIEW[{motivoValoracion}][text]`',
        '',
        '### ⚡ Notas rápidas',
        aiRow([['raiz-avance', '🎯 Avance', 'raiz:quick-avance'], ['raiz-destacado', '✨ Destacado', 'raiz:quick-destacado'], ['raiz-idea', '💡 Idea', 'raiz:quick-idea']]),
        '%% notas %%',
        '',
        '>[!recuerdo]- Este día en otros años',
        '>' + this.dvBlock('throwback').split('\n').join('\n>'),
        '',
        this.qaBlock('día')
      );
    } else {
      const sumBtns = (extra = []) => aiRow([['raiz-ia-resumen', '✨ Resumir', 'raiz:summarize-current'], ['raiz-ia-titulo', '🏷️ Título', 'raiz:ai-title'], ...extra]);
      fm.push('resumen: ""');
      if (level === 'weekly') {
        fm.push(this.wheelFrontmatter());
        const thu = m.clone().isoWeekday(4);
        body.push(`# Semana ${m.isoWeek()} · ${fechaCorta(m)} – ${fechaCorta(m.clone().endOf('isoWeek'))}`, `[[${thu.format('YYYY-MM-MMMM')}|]]`);
        body.push(nav(['← Semana anterior', P.weekly(m.clone().subtract(1, 'week'))], [cap(MESES[thu.month()]), P.monthly(thu)], ['Semana siguiente →', P.weekly(m.clone().add(1, 'week'))]));
        body.push('', aliasInput('Ponle nombre a tu semana'), '', '## 📝 Resumen', sumEditor, sumBtns());
        body.push('', '## 📊 Valoraciones', this.dvBlock('ratingChart'), '', '## 🗒️ Registro', this.dvBlock('periodLogs'), '', '## 📷 Fotos', this.dvBlock('gallery'));
        body.push('', '## 📅 Días', this.dvBlock('periodTable'), '', '## 🏋️ Entrenamiento', this.dvBlock('periodTraining'), '', '## ✅ Hábitos', this.dvBlock('periodHabits'));
        body.push(
          '',
          '## 🧹 Revisión de la semana',
          '%% 10 minutos a la semana mantienen el sistema vivo. %%',
          '- Vacía la [[Bandeja]] (conectar, hacer, agendar o soltar).',
          '- Repasa tus tarjetas en [[Repaso]].',
          '- Abre **🔗 Conexiones** en las notas de la semana y enlaza lo pendiente.',
          '- Revisa [[Etiquetas]] si aparecieron duplicadas.'
        );
        body.push('', '## 🌟 Rueda de la Vida', this.dvBlock('wheelChart'), aiRow([['raiz-ia-rueda', '🌟 Analizar mi Rueda de la Vida', 'raiz:ai-wheel']]), '', this.wheelDisplay());
        body.push('', this.qaBlock('semana'));
      } else {
        fm.push('tipoGrafico: line');
        const wheelPicker = "**Ver como:** `INPUT[inlineSelect(option(line, líneas), option(bar, barras), option(radar, radar), option(pie, torta)):tipoGrafico]`";
        if (level === 'monthly') {
          body.push(`# ${cap(MESES[m.month()])} ${m.year()}`, `[[${m.format('YYYY-[Q]Q')}|]]`);
          body.push(nav(['← Mes anterior', P.monthly(m.clone().subtract(1, 'month'))], [`T${m.quarter()} ${m.year()}`, P.quarterly(m)], ['Mes siguiente →', P.monthly(m.clone().add(1, 'month'))]));
          body.push('', aliasInput('Ponle nombre a tu mes'), '', '## 📝 Resumen', sumEditor, sumBtns(), '', '## 📅 Calendario', this.dvBlock('monthCalendar'));
          body.push('', '## 📊 Valoraciones', this.dvBlock('ratingChart'), '', '## 🗒️ Registro', this.dvBlock('periodLogs'), '', '## 📷 Fotos', this.dvBlock('gallery'), '', '## 🗓️ Semanas', this.dvBlock('periodTable'));
        } else if (level === 'quarterly') {
          body.push(`# T${m.quarter()} ${m.year()}`, `[[${m.format('YYYY')}|]]`);
          body.push(nav(['← Trimestre anterior', P.quarterly(m.clone().subtract(1, 'quarter'))], [String(m.year()), P.yearly(m)], ['Trimestre siguiente →', P.quarterly(m.clone().add(1, 'quarter'))]));
          body.push('', aliasInput('Ponle nombre a tu trimestre'), '', '## 📝 Resumen', sumEditor, sumBtns());
          body.push('', '## 📊 Valoraciones', this.dvBlock('ratingChart'), '', '## 🗒️ Registro', this.dvBlock('periodLogs'), '', '## 🗓️ Meses', this.dvBlock('periodTable'));
        } else {
          fm.push('revision: ""');
          body.push(`# ${m.year()}`);
          body.push(nav(['← Año anterior', P.yearly(m.clone().subtract(1, 'year'))], null, ['Año siguiente →', P.yearly(m.clone().add(1, 'year'))]));
          body.push('', aliasInput('Ponle nombre a tu año'), '', '## 📝 Resumen', sumEditor, sumBtns());
          body.push('', '## 🔭 Revisión del año', aiRow([['raiz-ia-revision', '🔭 Escribir revisión del año', 'raiz:ai-year-review']]), '```meta-bind\nINPUT[editor(class(raiz-editor)):revision]\n```');
          body.push('', '## 📊 Valoraciones', this.dvBlock('ratingChart'), '', '## 🏆 Mejores días', this.dvBlock('bestDays'), '', '## 🗓️ Trimestres', this.dvBlock('periodTable'));
        }
        body.push('', '## 🏋️ Entrenamiento', this.dvBlock('periodTraining'), '', '## ✅ Hábitos', this.dvBlock('periodHabits'));
        body.push('', '## 🌟 Rueda de la Vida', this.dvBlock('wheelChart'), wheelPicker, this.dvBlock('wheelProgression'));
        body.push('', this.qaBlock({ monthly: 'mes', quarterly: 'trimestre', yearly: 'año' }[level]));
      }
    }
    const clean = body.join('\n').replace(/^(#{1,6}\s+)(.*)$/gm, (m0, h, t) => h + deEmoji(t)).replace(/^(>\[!\w+\][-+]?\s+)(.*)$/gm, (m0, h, t) => h + deEmoji(t));
    return `---\n${fm.join('\n')}\n---\n${clean}\n`;
  }
  /** Para Templater: arma la nota según su carpeta. */
  async buildFromTp(tp) {
    const file = tp.config?.target_file || this.app.workspace.getActiveFile();
    const level = this.levelOf(file);
    if (!level) return '';
    return this.buildNote(level, file.basename);
  }
  /** Notas rápidas: inserta "- #avance " (o destacado/idea) sobre el marcador y deja el cursor ahí. */
  async quickNote(tag) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = this.activeFile();
    if (!view || view.getMode() !== 'source') {
      await this.app.vault.process(file, (d) => (d.includes('%% notas %%') ? d.replace('%% notas %%', `- #${tag} \n%% notas %%`) : d + `\n- #${tag} \n`));
      return new Notice(`Agregado #${tag} en Notas rápidas`);
    }
    const ed = view.editor;
    let line = -1;
    for (let i = 0; i < ed.lineCount(); i++) if (ed.getLine(i).includes('%% notas %%')) line = i;
    const text = `- #${tag} `;
    if (line === -1) {
      ed.replaceRange(`\n${text}`, { line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length });
      line = ed.lastLine() + 1;
      ed.setCursor({ line: ed.lastLine(), ch: text.length });
    } else {
      ed.replaceRange(`${text}\n`, { line, ch: 0 });
      ed.setCursor({ line, ch: text.length });
    }
    ed.focus();
  }
  /** Avances, destacados e ideas anotados en los días del periodo. */
  async periodLogs(dv, container) {
    const { start, end } = this.currentRange(dv);
    const kinds = [
      ['avance', '🎯 Avances', /#(avance|progress)\b/i],
      ['destacado', '✨ Destacados', /#(destacado|highlight)\b/i],
      ['idea', '💡 Ideas', /#idea\b/i],
    ];
    const found = { avance: [], destacado: [], idea: [] };
    for (const d of this.dailiesIn(start, end)) {
      const items = this.app.metadataCache.getFileCache(d.file)?.listItems || [];
      if (!items.length) continue;
      const txt = await this.app.vault.cachedRead(d.file);
      for (const li of items) {
        const line = txt.split('\n')[li.position.start.line] || '';
        for (const [k, , re] of kinds)
          if (re.test(line)) {
            const clean = line.replace(/^\s*[-*]\s*/, '').replace(re, '').trim();
            if (clean) found[k].push({ file: d.file, date: d.date, text: clean });
          }
      }
    }
    const grid = container.createDiv({ cls: 'raiz-logs' });
    let any = false;
    for (const [k, label] of kinds) {
      const col = grid.createDiv({ cls: 'raiz-moc-group' });
      col.createDiv({ cls: 'raiz-moc-title', text: `${label} · ${found[k].length}` });
      if (!found[k].length) col.createDiv({ cls: 'raiz-muted', text: '—' });
      for (const it of found[k]) {
        any = true;
        const row = col.createDiv({ cls: 'raiz-moc-item' });
        this.link(row, it.file, fechaCorta(it.date));
        row.appendText(` ${it.text}`);
      }
    }
    if (!any) container.createDiv({ cls: 'raiz-muted', text: 'Usa los botones de "Notas rápidas" en tu día para anotar avances, destacados e ideas.' });
  }
  /** Galería con las fotos pegadas en los días del periodo. */
  async gallery(dv, container) {
    const { start, end } = this.currentRange(dv);
    const shots = [];
    for (const d of this.dailiesIn(start, end)) {
      for (const e of this.app.metadataCache.getFileCache(d.file)?.embeds || []) {
        const f = this.app.metadataCache.getFirstLinkpathDest(e.link.split('#')[0], d.file.path);
        if (f && /^(png|jpe?g|gif|webp|avif|svg|heic)$/i.test(f.extension) && !f.path.startsWith(this.settings.folders.banners + '/')) shots.push({ img: f, day: d });
      }
    }
    if (!shots.length) return container.createDiv({ cls: 'raiz-muted', text: 'Sin fotos en este periodo. Pégalas en la sección 📷 Fotos de cada día.' });
    const grid = container.createDiv({ cls: 'raiz-gallery' });
    for (const s of shots) {
      const cell = grid.createDiv({ cls: 'raiz-gallery-cell' });
      cell.createEl('img', { attr: { src: this.app.vault.getResourcePath(s.img), loading: 'lazy', alt: '' } });
      cell.createDiv({ cls: 'raiz-gallery-label', text: fechaCorta(s.day.date) });
      cell.addEventListener('click', () => this.app.workspace.openLinkText(s.day.file.path, '', false));
    }
  }
  /** Este mismo día en años anteriores. */
  async throwback(dv, container) {
    const { start } = this.currentRange(dv);
    const key = start.format('MM-DD');
    const rows = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(this.settings.folders.daily + '/') && f.basename.slice(5, 10) === key && f.basename.slice(0, 4) !== start.format('YYYY'))
      .sort((a, b) => b.basename.localeCompare(a.basename));
    if (!rows.length) return container.createDiv({ cls: 'raiz-muted', text: 'Todavía no hay notas de este día en otros años.' });
    this.table(container, ['Año', 'Título', '⭐'], rows.map((f) => [(td) => this.link(td, f, f.basename.slice(0, 4)), this.fm(f).alias || '—', this.fm(f).valoracion ?? '—']));
  }
  /** Los días mejor valorados del año. */
  async bestDays(dv, container) {
    const { start, end } = this.currentRange(dv);
    const days = this.dailiesIn(start, end)
      .filter((d) => num(d.fm.valoracion) >= 9)
      .sort((a, b) => num(b.fm.valoracion) - num(a.fm.valoracion) || b.date - a.date);
    if (!days.length) return container.createDiv({ cls: 'raiz-muted', text: 'Aún no hay días con 9 o 10.' });
    this.table(container, ['Día', 'Título', '⭐'], days.map((d) => [(td) => this.link(td, d.file, fechaCorta(d.date)), d.fm.alias || '—', num(d.fm.valoracion)]));
  }
  // ═════════════════════════════ Mis metas (agua, comida, pasos, lectura… con tus propios números) ═════════════════════════════
  activeGoals() {
    return (this.settings.goals || []).filter((g) => g.on !== false && g.key);
  }
  editGoals(after) {
    new GoalsModal(this, after).open();
  }
  goalDecimals(g) {
    const s = String(g.step ?? 1);
    return s.includes('.') ? Math.min(3, s.split('.')[1].length) : 0;
  }
  fmtGoal(g, v) {
    if (v === null || v === undefined) return '—';
    return Number(v).toLocaleString('es-CL', { maximumFractionDigits: Math.max(1, this.goalDecimals(g)) });
  }
  /** Anillo de progreso con el ícono al centro. */
  goalRing(parent, pct, color, icon, size = 52) {
    const wrap = parent.createDiv({ cls: 'raiz-ring' });
    wrap.style.width = wrap.style.height = `${size}px`;
    const svg = wrap.createSvg('svg', { attr: { viewBox: '0 0 48 48' } });
    const C = 2 * Math.PI * 21;
    svg.createSvg('circle', { attr: { cx: 24, cy: 24, r: 21, class: 'raiz-ring-bg' } });
    const fg = svg.createSvg('circle', { attr: { cx: 24, cy: 24, r: 21, class: 'raiz-ring-fg', 'stroke-dasharray': `${(clamp(pct, 0, 1) * C).toFixed(1)} ${C.toFixed(1)}` } });
    fg.style.stroke = color;
    const ic = wrap.createDiv({ cls: 'raiz-ring-icon' });
    setIcon(ic, icon || 'target');
    if (pct >= 1) wrap.addClass('is-done');
    return wrap;
  }
  /** Último valor registrado antes de una fecha (para las medidas como el peso). */
  lastMeasure(key, before) {
    const days = this.dailiesIn(moment(before).subtract(120, 'days'), moment(before).subtract(1, 'day'));
    for (let i = days.length - 1; i >= 0; i--) if (num(days[i].fm[key]) !== null) return { v: num(days[i].fm[key]), date: days[i].date };
    return null;
  }
  /** Widget de la nota diaria: tus metas con anillos, barras y botones + / −. */
  async goals(dv, container, input) {
    let file = this.currentOf(dv);
    if (this.levelOf(file) !== 'daily') file = this.dailyFor(input.date ? moment(input.date) : moment());
    const box = container.createDiv({ cls: 'raiz-goals' });
    if (!file) {
      box.createDiv({ cls: 'raiz-muted', text: 'Todavía no creas la nota de hoy.' });
      box.createEl('button', { cls: 'mod-cta', text: 'Crear mi día' }).addEventListener('click', () => this.openToday());
      return;
    }
    const day = this.rangeOf(file)?.start || moment();
    const vals = {};
    const goals = this.activeGoals();
    for (const g of goals) vals[g.key] = num(this.fm(file)[g.key]);
    const save = async (g, v) => {
      const before = vals[g.key];
      if (v !== null) v = Math.max(0, Number(v.toFixed(this.goalDecimals(g))));
      vals[g.key] = v;
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        if (v === null) delete fm[g.key];
        else fm[g.key] = v;
      });
      draw();
      if (g.tipo !== 'medida' && g.goal && (before || 0) < g.goal && v >= g.goal) this.celebrate(box.querySelector(`[data-goal="${g.key}"]`) || box);
    };
    const editable = (el, g) => {
      el.addClass('raiz-goal-edit');
      el.setAttr('aria-label', 'Escribir el valor exacto');
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const inp = createEl('input', { cls: 'raiz-input raiz-goal-input', attr: { type: 'number', step: String(g.step || 1), min: '0' } });
        inp.value = vals[g.key] ?? '';
        el.replaceWith(inp);
        inp.focus();
        inp.select();
        let done = false;
        const commit = () => {
          if (done) return;
          done = true;
          this.run(() => save(g, inp.value === '' ? null : Number(inp.value)));
        };
        inp.addEventListener('keydown', (k) => {
          if (k.key === 'Enter') commit();
          if (k.key === 'Escape') ((done = true), draw());
        });
        inp.addEventListener('blur', commit);
      });
    };
    const stepBtn = (parent, g, dir) => {
      const b = parent.createEl('button', { cls: 'raiz-goal-btn', attr: { 'aria-label': dir > 0 ? `Sumar ${g.step} ${g.unit || ''}` : `Restar ${g.step}` } });
      setIcon(b, dir > 0 ? 'plus' : 'minus');
      b.addEventListener('click', () => {
        let base = vals[g.key];
        if (base === null && g.tipo === 'medida') base = this.lastMeasure(g.key, day)?.v ?? null;
        // Primera vez que se registra una medida: mejor escribir el número que sumar desde cero
        if (base === null && g.tipo === 'medida') return box.querySelector(`[data-goal="${g.key}"] .raiz-goal-edit`)?.click();
        this.run(() => save(g, Math.max(0, (base || 0) + dir * (num(g.step) || 1))));
      });
    };
    const draw = () => {
      box.empty();
      const top = box.createDiv({ cls: 'raiz-goals-top' });
      top.createSpan({ cls: 'raiz-goals-title', text: day.isSame(moment(), 'day') ? 'Metas de hoy' : `Metas del ${fechaCorta(day)}` });
      const done = goals.filter((g) => g.tipo !== 'medida' && g.goal && vals[g.key] >= g.goal).length;
      const total = goals.filter((g) => g.tipo !== 'medida' && g.goal).length;
      if (total) top.createSpan({ cls: 'raiz-pill', text: `${done}/${total} cumplidas` });
      const gear = top.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Editar mis metas' } });
      setIcon(gear, 'settings-2');
      gear.addEventListener('click', () => this.editGoals(() => this.goals(dv, (box.remove(), container), input)));
      if (!this.settings.goalsReviewed) {
        const hint = box.createDiv({ cls: 'raiz-goals-hint' });
        hint.createSpan({ text: 'Estos números son solo un ejemplo. Pon los tuyos: qué quieres medir, cuánto y en qué unidad.' });
        hint.createEl('button', { cls: 'mod-cta', text: 'Ajustar mis metas' }).addEventListener('click', () => gear.click());
      }
      if (!goals.length) return box.createDiv({ cls: 'raiz-muted', text: 'No tienes metas activas. Toca el engranaje para crear las tuyas.' });
      const groups = [];
      for (const g of goals) {
        const name = g.group || 'Mis metas';
        let grp = groups.find((x) => x.name === name);
        if (!grp) groups.push((grp = { name, items: [] }));
        grp.items.push(g);
      }
      const grid = box.createDiv({ cls: 'raiz-goal-grid' });
      for (const grp of groups) {
        const card = grid.createDiv({ cls: 'raiz-goal-card' });
        card.createDiv({ cls: 'raiz-goal-group', text: grp.name });
        let bars = null;
        for (const g of grp.items) {
          const v = vals[g.key];
          const color = g.color || 'var(--interactive-accent)';
          if (g.estilo === 'barra') {
            if (!bars) bars = card.createDiv({ cls: 'raiz-goal-bars' });
            const it = bars.createDiv({ cls: 'raiz-goal-bar', attr: { 'data-goal': g.key } });
            it.createDiv({ cls: 'raiz-goal-bar-label', text: g.label });
            const track = it.createDiv({ cls: 'raiz-goal-track' });
            const fill = track.createDiv({ cls: 'raiz-goal-fill' });
            fill.style.width = `${g.goal ? clamp((v || 0) / g.goal, 0, 1) * 100 : 0}%`;
            fill.style.background = color;
            const txt = it.createDiv({ cls: 'raiz-goal-bar-val', text: `${this.fmtGoal(g, v ?? 0)}${g.goal ? '/' + this.fmtGoal(g, g.goal) : ''}${g.unit || ''}` });
            editable(txt, g);
            const mini = it.createDiv({ cls: 'raiz-goal-mini' });
            stepBtn(mini, g, -1);
            stepBtn(mini, g, 1);
            continue;
          }
          bars = null;
          const row = card.createDiv({ cls: 'raiz-goal-row', attr: { 'data-goal': g.key } });
          const medida = g.tipo === 'medida';
          const pct = medida ? (v !== null ? 1 : 0) : g.goal ? (v || 0) / g.goal : 0;
          this.goalRing(row, medida ? (v !== null ? 1 : 0) : pct, color, g.icon).toggleClass('is-measure', medida);
          const info = row.createDiv({ cls: 'raiz-goal-info' });
          info.createDiv({ cls: 'raiz-goal-label', text: g.label });
          const sub = info.createDiv({ cls: 'raiz-goal-sub' });
          if (medida) {
            const val = sub.createSpan({ text: v !== null ? `${this.fmtGoal(g, v)} ${g.unit || ''}` : 'Sin registrar' });
            editable(val, g);
            const last = v === null ? this.lastMeasure(g.key, day) : null;
            if (last) sub.createSpan({ cls: 'raiz-goal-note', text: ` · último ${this.fmtGoal(g, last.v)} (${fechaCorta(last.date)})` });
            const ref = v ?? last?.v;
            if (g.goal && ref !== null && ref !== undefined) sub.createSpan({ cls: 'raiz-goal-note', text: ` · objetivo ${this.fmtGoal(g, g.goal)}` });
          } else {
            const val = sub.createSpan({ text: `${this.fmtGoal(g, v ?? 0)}${g.goal ? ' de ' + this.fmtGoal(g, g.goal) : ''} ${g.unit || ''}` });
            editable(val, g);
            if (g.goal && v >= g.goal) sub.createSpan({ cls: 'raiz-goal-ok', text: ' · lista' });
          }
          const act = row.createDiv({ cls: 'raiz-goal-actions' });
          stepBtn(act, g, -1);
          stepBtn(act, g, 1);
        }
      }
    };
    draw();
  }
  /** Resumen de metas de un periodo (o de los últimos días): promedio, días cumplidos y racha. */
  goalSummary(days) {
    return this.activeGoals().map((g) => {
      const vals = days.map((d) => num(d.fm[g.key]));
      const logged = vals.filter((v) => v !== null);
      const met = g.goal && g.tipo !== 'medida' ? vals.filter((v) => v !== null && v >= g.goal).length : 0;
      let streak = 0;
      for (let i = vals.length - 1; i >= 0; i--) {
        const ok = vals[i] !== null && vals[i] >= (g.goal || Infinity);
        if (ok) streak++;
        else if (i === vals.length - 1 && days[i].date.isSame(moment(), 'day')) continue; // hoy todavía no termina
        else break;
      }
      return { g, logged, avg: avg(logged), met, total: days.length, streak, first: logged[0] ?? null, last: logged[logged.length - 1] ?? null };
    });
  }
  goalSummaryCards(container, days) {
    const rows = this.goalSummary(days).filter((r) => r.logged.length);
    if (!rows.length) return container.createDiv({ cls: 'raiz-muted', text: 'Aún no registras tus metas en este periodo. Usa los botones + en tu nota diaria.' });
    const grid = container.createDiv({ cls: 'raiz-goal-sum' });
    for (const r of rows) {
      const { g } = r;
      const c = grid.createDiv({ cls: 'raiz-goal-sum-card' });
      const medida = g.tipo === 'medida' || !g.goal;
      this.goalRing(c, medida ? 1 : r.met / r.total, g.color || 'var(--interactive-accent)', g.icon, 46).toggleClass('is-measure', medida);
      const info = c.createDiv({ cls: 'raiz-goal-info' });
      info.createDiv({ cls: 'raiz-goal-label', text: g.label });
      if (medida) {
        const diff = r.last !== null && r.first !== null ? r.last - r.first : null;
        info.createDiv({ cls: 'raiz-goal-sub', text: `${this.fmtGoal(g, r.last)} ${g.unit || ''}${diff ? ` (${diff > 0 ? '+' : ''}${this.fmtGoal(g, diff)})` : ''}` });
        if (g.goal) info.createDiv({ cls: 'raiz-goal-note', text: `objetivo ${this.fmtGoal(g, g.goal)} ${g.unit || ''}` });
      } else {
        info.createDiv({ cls: 'raiz-goal-sub', text: `${r.met}/${r.total} días · promedio ${this.fmtGoal(g, r.avg)} ${g.unit || ''}` });
        if (r.streak > 1) info.createDiv({ cls: 'raiz-goal-ok', text: `racha de ${r.streak} días` });
      }
    }
  }
  async periodGoals(dv, container) {
    const { start, end } = this.currentRange(dv);
    const days = this.dailiesIn(start, end).filter((d) => !d.date.isAfter(moment(), 'day'));
    if (!days.length || !this.activeGoals().length) return;
    this.heading(container, 'Metas');
    this.goalSummaryCards(container, days);
  }
  /** Bloque de metas del panel de entrenamiento: última semana y evolución de la meta que elijas. */
  goalsDashboard(container) {
    const goals = this.activeGoals();
    if (!goals.length) return;
    const head = this.heading(container, 'Tus metas · últimos 7 días');
    const gear = head.createEl('button', { cls: 'clickable-icon raiz-h-btn', attr: { 'aria-label': 'Editar mis metas' } });
    setIcon(gear, 'settings-2');
    gear.addEventListener('click', () => this.editGoals());
    const today = moment();
    this.goalSummaryCards(container, this.dailiesIn(today.clone().subtract(6, 'days'), today));
    const days = this.dailiesIn(today.clone().subtract(29, 'days'), today);
    const withData = goals.filter((g) => days.some((d) => num(d.fm[g.key]) !== null));
    if (!withData.length) return;
    this.heading(container, 'Evolución (30 días)');
    const sel = container.createEl('select', { cls: 'dropdown raiz-goal-select' });
    for (const g of withData) sel.createEl('option', { value: g.key, text: g.label });
    const holder = container.createDiv();
    const draw = () => {
      holder.empty();
      const g = withData.find((x) => x.key === sel.value) || withData[0];
      const datasets = [{ label: `${g.label}${g.unit ? ` (${g.unit})` : ''}`, data: days.map((d) => num(d.fm[g.key])), borderColor: g.color || '#22c55e', backgroundColor: (g.color || '#22c55e') + '33', fill: true, spanGaps: true, tension: 0.3 }];
      if (g.goal) datasets.push({ label: 'Objetivo', data: days.map(() => g.goal), borderColor: 'rgba(148,163,184,0.7)', borderDash: [6, 6], pointRadius: 0, fill: false });
      this.renderChart(holder, { type: 'line', data: { labels: days.map((d) => `${d.date.date()}/${d.date.month() + 1}`), datasets }, options: { scales: { y: { beginAtZero: g.tipo !== 'medida' } } } });
    };
    sel.addEventListener('change', draw);
    draw();
  }

  // ═════════════════════════════ Fondos por apartado ═════════════════════════════
  sections() {
    const F = this.settings.folders;
    return [
      { key: 'daily', label: 'Notas diarias', level: 'daily' },
      { key: 'weekly', label: 'Semanas', level: 'weekly' },
      { key: 'monthly', label: 'Meses', level: 'monthly' },
      { key: 'quarterly', label: 'Trimestres', level: 'quarterly' },
      { key: 'yearly', label: 'Años', level: 'yearly' },
      { key: 'academic', label: 'Académico', folder: F.academic },
      { key: 'training', label: 'Entrenamiento', folder: F.training },
      { key: 'agenda', label: 'Agenda', folder: F.agenda },
      { key: 'library', label: 'Biblioteca', folder: F.library },
      { key: 'knowledge', label: 'Conocimiento', folder: F.knowledge },
      { key: 'dashboard', label: 'Inicio y paneles', folder: F.dashboard },
      { key: 'inbox', label: 'Bandeja', folder: F.inbox },
    ];
  }
  sectionOf(file) {
    if (!file) return null;
    const level = this.levelOf(file);
    return this.sections().find((s) => (level ? s.level === level : s.folder && file.path.startsWith(s.folder + '/'))) || null;
  }
  sectionBanner(key) {
    const v = this.settings.sectionBanners?.[key];
    return typeof v === 'string' ? v : null;
  }
  /** Cambia el fondo de una nota guardando el original para poder restaurarlo. value: imagen, '' = sin imagen, null = original. */
  async setBanner(file, value) {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (value === null) {
        if (!('banner-original' in fm)) return;
        if (fm['banner-original']) fm.banner = fm['banner-original'];
        else delete fm.banner;
        delete fm['banner-original'];
        return;
      }
      if (!('banner-original' in fm)) fm['banner-original'] = fm.banner || '';
      if (value) {
        fm.banner = value;
        fm['banner-height'] = fm['banner-height'] || 260;
        fm['content-start'] = fm['content-start'] || 190;
        fm['banner-fade'] = fm['banner-fade'] ?? -70;
        fm['banner-radius'] = fm['banner-radius'] ?? 16;
      } else delete fm.banner;
    });
  }
  async applySectionBanner(section, value) {
    this.settings.sectionBanners = this.settings.sectionBanners || {};
    if (value === null) delete this.settings.sectionBanners[section.key];
    else this.settings.sectionBanners[section.key] = value;
    await this.saveSettings();
    const banners = this.settings.folders.banners + '/';
    const files = this.app.vault.getMarkdownFiles().filter((f) => this.sectionOf(f)?.key === section.key && this.isContentFile(f));
    let n = 0;
    for (const f of files) {
      const fm = this.fm(f);
      const cur = String(fm.banner || '');
      // En las carpetas solo se tocan las notas con fondo de Raíz o puesto por el apartado; tus portadas propias se respetan
      const target = this.app.metadataCache.getFirstLinkpathDest(cur.replace(/^!?\[\[|\]\]$/g, '').split('|')[0], f.path);
      const ours = section.level || 'banner-original' in fm || cur.includes(banners) || !!target?.path.startsWith(banners);
      if (!ours || (value === null && !('banner-original' in fm))) continue;
      await this.setBanner(f, value);
      n++;
    }
    new Notice(value === null ? `${section.label}: fondo original restaurado (${n} notas).` : `${section.label}: fondo cambiado en ${n} notas y en las que vengan.`);
  }

  // ═════════════════════════════ Estudio estilo Notion: páginas, subpáginas y apuntes ═════════════════════════════
  studyKinds() {
    return {
      area: { label: 'Área', icon: 'graduation-cap' },
      coleccion: { label: 'Colección', icon: 'table' },
      asignatura: { label: 'Asignatura', icon: 'book-open' },
      habilidad: { label: 'Habilidad', icon: 'puzzle' },
      tema: { label: 'Tema', icon: 'layers' },
      apunte: { label: 'Apunte', icon: 'notebook-pen' },
      concepto: { label: 'Concepto', icon: 'lightbulb' },
    };
  }
  isStudyPage(f) {
    const fm = this.fm(f);
    return hasTipo(fm, 'estudio') || hasTipo(fm, 'asignatura');
  }
  studyPages() {
    return this.app.vault.getMarkdownFiles().filter((f) => this.isStudyPage(f));
  }
  linkTarget(v) {
    const s = String(toArr(v)[0] || '').replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();
    if (!s) return null;
    return this.app.metadataCache.getFirstLinkpathDest(s, '') || null;
  }
  breadcrumb(file) {
    const chain = [];
    let cur = this.linkTarget(this.fm(file).padre);
    const seen = new Set([file.path]);
    while (cur && !seen.has(cur.path) && chain.length < 6) {
      chain.unshift(cur);
      seen.add(cur.path);
      cur = this.linkTarget(this.fm(cur).padre);
    }
    return chain;
  }
  childrenOf(file) {
    return this.studyPages().filter((f) => this.linkTarget(this.fm(f).padre)?.path === file.path);
  }
  /** Crea una página de estudio (área, asignatura, habilidad, tema, apunte o concepto). */
  newStudyPage(preset = {}) {
    const kinds = this.studyKinds();
    const parents = ['(ninguna)'].concat(this.studyPages().map((f) => f.basename).sort((a, b) => a.localeCompare(b, 'es')));
    new FormModal(
      this.app,
      'Nueva página de estudio',
      [
        { key: 'titulo', label: 'Título', required: true, value: preset.titulo || '', placeholder: 'Ej: Heap y Stack en C++' },
        { key: 'clase', label: 'Tipo', type: 'select', options: Object.values(kinds).map((k) => k.label), value: kinds[preset.clase]?.label || 'Apunte' },
        { key: 'padre', label: 'Dentro de', type: 'select', options: preset.padre && !parents.includes(preset.padre) ? [preset.padre].concat(parents) : parents, value: preset.padre || '(ninguna)' },
        { key: 'categoria', label: 'Categoría', value: preset.categoria || '', placeholder: 'Ej: Lenguaje, Matemáticas, Redes…' },
      ],
      (v) => this.run(() => this.createStudyPage(v))
    ).open();
  }
  /** Qué tipo de página se crea por defecto dentro de cada tipo. */
  childKindOf(fm) {
    return { area: 'coleccion', coleccion: 'asignatura', asignatura: 'apunte', habilidad: 'apunte', tema: 'apunte', apunte: 'apunte', concepto: 'concepto' }[fm.clase] || 'apunte';
  }
  async studyPageContent(v) {
    const kinds = this.studyKinds();
    const key = Object.keys(kinds).find((k) => kinds[k].label === v.clase || k === v.clase) || 'apunte';
    const padre = v.padre && v.padre !== '(ninguna)' ? this.app.vault.getMarkdownFiles().find((f) => f.basename === v.padre) : null;
    let numero = '';
    if (padre && (key === 'apunte' || this.fm(padre).clase === 'coleccion')) numero = Math.max(0, ...this.childrenOf(padre).map((f) => num(this.fm(f).numero) || 0)) + 1;
    let content = await this.fromTemplate('Pagina', {
      clase: key,
      padre: padre ? JSON.stringify(`[[${padre.basename}]]`) : '""',
      categoria: JSON.stringify(String(v.categoria || '').trim()),
      icono: kinds[key].icon,
      numero,
      fecha: isoDate(moment()),
      titulo: String(v.titulo).trim(),
      vistas: key === 'apunte' || key === 'concepto' ? '' : this.childrenBase(key),
    });
    // Las propiedades propias de las hermanas (ej. "revisado") se heredan vacías, como el esquema de una base
    const schema = Object.entries(this.siblingSchema(padre));
    if (schema.length) {
      const lines = schema.map(([k, val]) => `${/^[\w-]+$/.test(k) ? k : JSON.stringify(k)}:${val === false ? ' false' : Array.isArray(val) ? ' []' : ''}`).join('\n');
      content = content.replace(/\ntags:\n/, () => `\n${lines}\ntags:\n`);
    }
    const bg = this.sectionBanner('academic');
    if (bg) content = content.replace(/^---\n/, () => `---\nbanner: ${JSON.stringify(bg)}\nbanner-original: ""\nbanner-height: 260\ncontent-start: 190\nbanner-fade: -70\nbanner-radius: 16\n`);
    return { content: content.replace(/\n{3,}/g, '\n\n'), padre };
  }
  async createStudyPage(v, opts = {}) {
    const { content, padre } = await this.studyPageContent(v);
    const dir = padre ? padre.parent.path : `${this.settings.folders.academic}/Estudio`;
    return this.createNote(dir, v.titulo, content, opts.open !== false);
  }
  /** "Nueva entrada" de una base: crea la subpágina de la nota abierta y la abre. */
  newChild() {
    const host = this.activeFile();
    const kinds = this.studyKinds();
    new FormModal(
      this.app,
      `Nueva entrada en ${host.basename}`,
      [
        { key: 'titulo', label: 'Título', required: true, placeholder: 'Ej: Spring orientado al desarrollo web' },
        { key: 'clase', label: 'Tipo', type: 'select', options: Object.values(kinds).map((k) => k.label), value: kinds[this.childKindOf(this.fm(host))].label },
      ],
      (v) => this.run(() => this.createStudyPage({ titulo: v.titulo, clase: v.clase, padre: host.basename, categoria: '' }))
    ).open();
  }
  /** Tabla incrustada (Bases) con las subpáginas, con vistas como en Notion. */
  childrenBase(kind, title) {
    const isCourse = kind === 'asignatura' || kind === 'habilidad' || kind === 'coleccion';
    const order = kind === 'coleccion' ? ['file.name', 'numero', 'revisado', 'estado', 'importancia', 'resumen'] : isCourse ? ['file.name', 'numero', 'fecha', 'estado', 'importancia', 'resumen'] : ['file.name', 'clase', 'categoria', 'estado', 'importancia', 'resumen'];
    const y = (arr) => arr.map((x) => `      - ${x}`).join('\n');
    return [
      `## ${title || (kind === 'coleccion' ? 'Entradas' : isCourse ? 'Notas de clase' : 'Contenido')}`,
      '```meta-bind-button',
      'label: "Nueva entrada"',
      'icon: plus',
      'style: default',
      'class: raiz-btn raiz-new-entry',
      'actions:',
      '  - type: command',
      '    command: raiz:new-child',
      '```',
      '```base',
      'properties:',
      '  file.name:',
      '    displayName: Página',
      '  note.clase:',
      '    displayName: Tipo',
      '  note.categoria:',
      '    displayName: Categoría',
      '  note.estado:',
      '    displayName: Estado',
      '  note.importancia:',
      '    displayName: Importancia',
      '  note.numero:',
      '    displayName: N°',
      '  note.fecha:',
      '    displayName: Fecha',
      '  note.resumen:',
      '    displayName: Resumen',
      '  note.revisado:',
      '    displayName: Revisado',
      'filters:',
      '  and:',
      '    - tipo == "estudio"',
      '    - if(padre.isType("link"), padre.linksTo(this.file), false)',
      'views:',
      '  - type: table',
      `    name: ${isCourse ? 'Todas las notas' : 'Todo'}`,
      '    order:',
      y(order),
      '    sort:',
      `      - property: ${isCourse ? 'numero' : 'file.name'}`,
      '        direction: ASC',
      '  - type: table',
      `    name: ${kind === 'coleccion' ? 'Por número de curso' : isCourse ? 'Por número de clase' : 'Por categoría'}`,
      '    order:',
      y(isCourse ? ['numero', 'file.name', 'fecha', 'estado'] : ['file.name', 'clase', 'estado']),
      '    groupBy:',
      `      property: ${isCourse ? 'estado' : 'categoria'}`,
      '      direction: ASC',
      '    sort:',
      `      - property: ${isCourse ? 'numero' : 'file.name'}`,
      '        direction: ASC',
      '  - type: cards',
      '    name: Tarjetas',
      '    order:',
      y(['file.name', 'categoria', 'estado']),
      '    image: note.banner',
      '    imageFit: cover',
      '    cardSize: 200',
      '  - type: list',
      '    name: Lista simple',
      '    order:',
      y(['file.name']),
      '```',
    ].join('\n');
  }

  // ═════════════════════════════ Todo dentro de cualquier nota (estilo Notion) ═════════════════════════════
  /** Propiedades que comparten las entradas hermanas (como el "esquema" de una base de Notion). */
  siblingSchema(padre) {
    const skip = new Set(['tipo', 'clase', 'padre', 'categoria', 'estado', 'importancia', 'numero', 'fecha', 'icono', 'resumen', 'tags', 'cssclasses', 'banner', 'banner-y', 'banner-height', 'content-start', 'banner-fade', 'banner-radius', 'position']);
    const schema = {};
    for (const f of padre ? this.childrenOf(padre) : []) {
      for (const [k, v] of Object.entries(this.fm(f))) {
        if (skip.has(k) || k in schema) continue;
        schema[k] = typeof v === 'boolean' ? false : Array.isArray(v) ? [] : null;
      }
    }
    return schema;
  }
  /** Crea una subpágina de la nota actual y deja su enlace donde está el cursor. */
  async insertSubpage(preset = {}) {
    const host = this.activeFile();
    const fm = this.fm(host);
    const childKind = preset.clase || this.childKindOf(fm);
    const kinds = this.studyKinds();
    new FormModal(
      this.app,
      'Nueva página dentro de esta',
      [
        { key: 'titulo', label: 'Título', required: true, placeholder: 'Ej: Microservicios 27/03' },
        { key: 'clase', label: 'Tipo', type: 'select', options: Object.values(kinds).map((k) => k.label), value: kinds[childKind].label },
      ],
      (v) =>
        this.run(async () => {
          const f = await this.createStudyPage({ titulo: v.titulo, clase: v.clase, padre: host.basename, categoria: '' }, { open: false });
          await this.insertAtCursorOrEnd(host, `[[${f.basename}]]`);
          new Notice(`Página creada: ${f.basename}`);
        })
    ).open();
  }
  /** Inserta una base (tabla con vistas) con las subpáginas de esta nota y un botón para agregar entradas. */
  async insertChildrenBase() {
    const host = this.activeFile();
    new FormModal(this.app, 'Nueva base en esta página', [{ key: 'nombre', label: 'Nombre de la base', required: true, value: 'Notas de clase' }], (v) =>
      this.run(async () => {
        const block = this.childrenBase('coleccion', v.nombre.trim());
        await this.insertAtCursorOrEnd(host, block);
        // Si la nota no era de estudio, se le dan las propiedades mínimas para que todo funcione
        await this.app.fileManager.processFrontMatter(host, (fm) => {
          if (!fm.tipo) fm.tipo = 'estudio';
          if (!fm.clase) fm.clase = 'coleccion';
          if (!fm.icono) fm.icono = 'table';
        });
      })
    ).open();
  }
  /** Tarjeta visual que enlaza a otra página (portada, ícono, título y resumen). */
  async insertPageCard() {
    const host = this.activeFile();
    const files = this.app.vault.getMarkdownFiles().filter((f) => f !== host && this.isContentFile(f)).sort((a, b) => b.stat.mtime - a.stat.mtime);
    new FilePicker(this.app, files, 'Elige la página a mostrar como tarjeta…', (f) =>
      this.run(() => this.insertAtCursorOrEnd(host, `\`\`\`dataviewjs\nif (window.raiz) await window.raiz.charts.pageCard(dv, this.container, { ruta: ${JSON.stringify(f.path)} });\n\`\`\``))
    ).open();
  }
  async pageCard(dv, container, input) {
    const f = this.app.vault.getAbstractFileByPath(input.ruta) || this.app.metadataCache.getFirstLinkpathDest(String(input.ruta || ''), dv.currentFilePath);
    if (!(f instanceof TFile)) return container.createDiv({ cls: 'raiz-muted', text: `No encuentro "${input.ruta}".` });
    const fm = this.fm(f);
    const card = container.createDiv({ cls: 'raiz-page-card' });
    const cover = card.createDiv({ cls: 'raiz-page-card-cover' });
    const src = this.imageSrc(String(fm.banner || '').replace(/^"|"$/g, ''));
    if (src) cover.style.backgroundImage = `url("${src}")`;
    const ic = card.createDiv({ cls: 'raiz-page-card-icon' });
    const icon = String(fm.icono || '').trim();
    if (/\p{Extended_Pictographic}/u.test(icon)) ic.setText(icon);
    else setIcon(ic, icon || 'file-text');
    const crumbs = this.breadcrumb(f).map((x) => x.basename);
    if (crumbs.length) card.createDiv({ cls: 'raiz-page-card-crumbs', text: crumbs.slice(-2).join(' / ') });
    card.createDiv({ cls: 'raiz-page-card-title', text: f.basename });
    if (fm.resumen) card.createDiv({ cls: 'raiz-page-card-sub', text: String(fm.resumen) });
    const kids = this.childrenOf(f).length;
    if (kids) card.createDiv({ cls: 'raiz-page-card-sub', text: `${kids} página(s) dentro` });
    card.addEventListener('click', () => this.app.workspace.openLinkText(f.path, dv.currentFilePath, false));
  }
  /** Lista de módulos que se pueden insertar en cualquier nota. */
  moduleDefs() {
    const m = (fn, args) => `\`\`\`dataviewjs\nif (window.raiz) await window.raiz.charts.${fn}(dv, this.container${args ? ', ' + args : ''}); else dv.paragraph("Cargando…");\n\`\`\``;
    return [
      ['Cabecera de página (ícono, portada, importancia)', m('pageHeader')],
      ['Mis metas de hoy (agua, comida, pasos…)', m('goals')],
      ['Hoy: agenda, clases, evaluaciones y pendientes', m('dailyToday', '{ date: moment().format("YYYY-MM-DD") }')],
      ['Calendario del mes', m('monthCalendar', '{ month: moment().format("YYYY-MM") }')],
      ['Próximos 60 días (agenda)', m('agenda')],
      ['Tareas pendientes de todos los días', '```dataview\nTASK\nFROM "01 Diario"\nWHERE !completed AND text != ""\nGROUP BY file.link\n```'],
      ['Biblioteca (galería o tablero)', m('library')],
      ['Biblioteca: solo una categoría (cambia "anime")', m('library', '{ categoria: "anime" }')],
      ['Panel académico (horario y promedios)', m('academicDashboard')],
      ['Panel de entrenamiento', m('trainingDashboard')],
      ['Repaso de tarjetas', m('review')],
      ['Bandeja de entrada', m('inbox')],
      ['Conocimiento: mapas, huérfanas y temas', m('knowledgeHome')],
      ['Notas que enlazan a esta, ordenables por importancia', m('topicTable')],
      ['Mapa de contenido de esta nota', m('moc')],
      ['Etiquetas', m('tags')],
      ['Mapa de actividad del año', m('activity')],
      ['Inicio completo (reloj, tarjetas, frase…)', m('hub')],
    ];
  }
  insertModule() {
    const host = this.activeFile();
    const defs = this.moduleDefs();
    new StringPicker(this.app, defs.map((d) => d[0]), 'Insertar módulo…', (label) => this.run(() => this.insertAtCursorOrEnd(host, defs.find((d) => d[0] === label)[1]))).open();
  }
  /** Da a cualquier nota las propiedades de página (ícono, portada, importancia, subpáginas) sin tocar su contenido. */
  async makePage(file) {
    file = file || this.activeFile();
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (!fm.tipo) fm.tipo = 'estudio';
      if (!fm.clase) fm.clase = 'tema';
      if (!fm.icono) fm.icono = 'file-text';
      if (fm.importancia === undefined) fm.importancia = null;
      if (!fm.cssclasses) fm.cssclasses = ['raiz-estudio'];
    });
    const txt = await this.app.vault.read(file);
    if (!txt.includes('charts.pageHeader')) {
      await this.app.vault.process(file, (d) => {
        const m = d.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
        const head = m ? m[0] : '';
        return head + '```dataviewjs\nif (window.raiz) await window.raiz.charts.pageHeader(dv, this.container); else dv.paragraph("Cargando…");\n```\n\n' + d.slice(head.length);
      });
    }
    new Notice('Ahora es una página: ícono, portada, importancia y subpáginas disponibles.');
  }
  insertMenu(evt) {
    const m = new Menu();
    const add = (title, icon, fn) => m.addItem((i) => i.setTitle(title).setIcon(icon).onClick(() => this.run(fn)));
    add('Nueva página dentro de esta', 'file-plus', () => this.insertSubpage());
    add('Base con vistas (subpáginas)', 'table', () => this.insertChildrenBase());
    add('Tarjeta de otra página', 'square-stack', () => this.insertPageCard());
    add('Módulo (agenda, biblioteca, repaso…)', 'layout-grid', () => this.insertModule());
    m.addSeparator();
    add('Convertir esta nota en página', 'file-cog', () => this.makePage());
    if (evt && evt.clientX !== undefined) m.showAtMouseEvent(evt);
    else m.showAtPosition({ x: window.innerWidth / 2, y: window.innerHeight / 3 });
  }
  /** Un enlace nuevo [[...]] escrito en una página crea su nota como subpágina, junto a ella. */
  async onLinkedNoteCreated(file) {
    if (!this.settings.autoSubpages || !(file instanceof TFile) || file.extension !== 'md') return;
    if (!this.layoutReadyAt || Date.now() - this.layoutReadyAt < 4000) return;
    const host = this.app.workspace.getActiveFile(); // la página donde se hizo clic (antes de que se abra la nueva)
    await new Promise((r) => setTimeout(r, 400));
    if ((await this.app.vault.read(file)).trim()) return; // ya tiene contenido (plantilla u otra cosa)
    if (this.levelOf(file) || file.path.startsWith(this.settings.folders.inbox + '/')) return;
    if (!host || host === file || !this.isStudyPage(host)) return;
    const unresolved = this.app.metadataCache.unresolvedLinks[host.path] || {};
    const resolved = this.app.metadataCache.resolvedLinks[host.path] || {};
    if (!(file.basename in unresolved) && !(file.path in resolved)) return;
    const { content } = await this.studyPageContent({ titulo: file.basename, clase: this.childKindOf(this.fm(host)), padre: host.basename, categoria: '' });
    await this.app.vault.modify(file, content);
    // Se guarda junto a su página madre (los enlaces se actualizan solos)
    const dest = `${host.parent.path}/${file.name}`;
    if (file.parent.path !== host.parent.path && !this.app.vault.getAbstractFileByPath(dest)) await this.app.fileManager.renameFile(file, dest);
  }

  /** Cabecera de una página de estudio: migas de pan, ícono, importancia y acciones. */
  async pageHeader(dv, container) {
    const file = this.currentOf(dv);
    const fm = this.fm(file);
    const set = (patch) => this.app.fileManager.processFrontMatter(file, (x) => Object.assign(x, patch));
    const head = container.createDiv({ cls: 'raiz-page-head' });
    const crumbs = this.breadcrumb(file);
    if (crumbs.length) {
      const bc = head.createDiv({ cls: 'raiz-crumbs' });
      crumbs.forEach((c, i) => {
        if (i) bc.createSpan({ cls: 'raiz-crumb-sep', text: '/' });
        this.link(bc, c, c.basename);
      });
    }
    const top = head.createDiv({ cls: 'raiz-page-top' });
    const icon = top.createEl('button', { cls: 'raiz-page-icon', attr: { 'aria-label': 'Cambiar ícono' } });
    const ic = String(fm.icono || '').trim();
    if (/\p{Extended_Pictographic}/u.test(ic)) icon.setText(ic);
    else setIcon(icon, ic || this.studyKinds()[fm.clase]?.icon || 'file-text');
    icon.addEventListener('click', () => new IconModal(this, (v) => set({ icono: v })).open());
    const meta = top.createDiv({ cls: 'raiz-page-meta' });
    const kind = this.studyKinds()[fm.clase];
    if (kind) meta.createSpan({ cls: 'raiz-pill', text: kind.label });
    if (fm.categoria) meta.createSpan({ cls: 'raiz-pill', text: String(fm.categoria) });
    if (fm.numero) meta.createSpan({ cls: 'raiz-pill', text: fm.clase === 'apunte' ? `Clase ${fm.numero}` : `N° ${fm.numero}` });
    const stars = meta.createSpan({ cls: 'raiz-stars', attr: { 'aria-label': 'Importancia' } });
    const imp = num(fm.importancia) || 0;
    for (let i = 1; i <= 5; i++) {
      const s = stars.createEl('button', { cls: 'raiz-star' + (i <= imp ? ' is-on' : ''), attr: { 'aria-label': `Importancia ${i}` } });
      setIcon(s, 'star');
      s.addEventListener('click', () => set({ importancia: imp === i ? null : i }));
    }
    const actions = head.createDiv({ cls: 'raiz-page-actions' });
    const act = (iconId, label, fn) => {
      const b = actions.createEl('button', { cls: 'raiz-chip raiz-act' });
      setIcon(b.createSpan(), iconId);
      b.createSpan({ text: label });
      b.addEventListener('click', (e) => this.run(() => fn(e)));
      return b;
    };
    act('image', 'Fondo', () => new BackgroundModal(this, file).open());
    if (fm.clase !== 'apunte' && fm.clase !== 'concepto') act('file-plus', ['asignatura', 'habilidad'].includes(fm.clase) ? 'Nueva nota de clase' : fm.clase === 'coleccion' ? 'Nueva entrada' : 'Nueva subpágina', () => this.newChild());
    act('plus', 'Insertar', (e) => this.insertMenu(e));
    act('sparkles', 'IA', (e) => this.aiMenu(e, file));
    act('git-fork', 'Grafo local', () => this.openLocalGraph());
    act('link', 'Conexiones', () => this.openConnections());
  }
  aiMenu(evt, file) {
    const m = new Menu();
    const add = (title, icon, fn) => m.addItem((i) => i.setTitle(title).setIcon(icon).onClick(() => this.run(fn)));
    add('Redactar apunte a partir del título', 'pen-line', () => this.aiDraft(file));
    add('Explicar la selección', 'message-square-text', () => this.aiOnSelection('explicar'));
    add('Mejorar la redacción de la selección', 'wand-2', () => this.aiOnSelection('mejorar'));
    add('Ejemplo de código del tema', 'code-2', () => this.aiOnSelection('codigo'));
    add('Resumir en una frase (propiedad "resumen")', 'align-left', () => this.aiSummaryProp(file));
    add('Sugerir etiquetas de tema', 'tags', () => this.aiTags(file));
    add('Generar preguntas de repaso', 'layers', () => this.generateCards());
    m.showAtMouseEvent(evt);
  }
  editorOf(file) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || (file && view.file !== file)) return null;
    return view.getMode() === 'source' ? view.editor : null;
  }
  async insertAtCursorOrEnd(file, text) {
    const ed = this.editorOf(file);
    if (ed) {
      ed.replaceSelection(text);
      ed.focus();
    } else await this.app.vault.process(file, (d) => d.replace(/\s*$/, '') + '\n\n' + text + '\n');
  }
  async studyContext(file) {
    const fm = this.fm(file);
    const crumbs = this.breadcrumb(file).map((f) => f.basename);
    return `Tema: ${file.basename}${crumbs.length ? `\nUbicación: ${crumbs.join(' > ')}` : ''}${fm.categoria ? `\nCategoría: ${fm.categoria}` : ''}`;
  }
  async aiDraft(file) {
    file = file || this.activeFile();
    const ctx = await this.studyContext(file);
    const existing = (await this.noteText(file)).slice(0, 2500);
    const out = await this.chat({
      tier: 'deep',
      temperature: 0.4,
      maxTokens: 1800,
      label: 'Redactando el apunte',
      system: `${this.systemPrompt()}\nEres un tutor universitario de informática y ciencias. Escribes apuntes claros, en español, con tus propias palabras (nada copiado textual).`,
      prompt:
        `Escribe un apunte de estudio en markdown sobre el tema indicado. Estructura: una introducción breve; secciones con títulos "###"; listas con las ideas clave en **negrita**; si el tema es de programación, un ejemplo de código comentado; si es de matemáticas o física, la fórmula en LaTeX con $$; termina con "### En resumen" (3 viñetas). No escribas el título principal ni comentarios sobre lo que vas a hacer.` +
        (existing ? `\nYa escribí esto en la nota; compleméntalo sin repetirlo:\n${existing}` : '') +
        `\n\n${ctx}`,
    });
    const warn = `> [!warning]- Borrador de IA (${this.modelFor('deep')})
> Revisa el código, las fórmulas y los datos antes de estudiarlo: un modelo local puede equivocarse. Reescríbelo con tus palabras para que se te quede.`;
    await this.insertAtCursorOrEnd(file, `${warn}

${out.trim()}`);
    new Notice('Apunte redactado. Revísalo y ajústalo con tus palabras.');
  }
  async aiOnSelection(mode) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) throw new Error('Abre una nota en modo edición.');
    const ed = view.editor;
    const sel = ed.getSelection().trim();
    const ctx = await this.studyContext(view.file);
    if (mode !== 'codigo' && !sel) throw new Error('Selecciona primero el texto.');
    const prompts = {
      explicar: `Explica de forma simple y con un ejemplo concreto este fragmento de mis apuntes. Máximo 120 palabras, en markdown, sin título.\n\n${ctx}\n\nFRAGMENTO:\n${sel}`,
      mejorar: `Reescribe este fragmento de mis apuntes para que sea claro, preciso y bien redactado, manteniendo el significado y el formato markdown. Devuelve SOLO el texto reescrito.\n\n${ctx}\n\nFRAGMENTO:\n${sel}`,
      codigo: `Escribe un ejemplo de código corto y comentado (en español) que ilustre ${sel ? `esto: ${sel}` : 'el tema de la nota'}. Devuelve SOLO un bloque de código markdown con el lenguaje indicado y, debajo, una línea que explique qué muestra.\n\n${ctx}`,
    };
    const out = (await this.chat({ tier: 'deep', temperature: 0.2, maxTokens: 900, label: mode === 'codigo' ? 'Escribiendo el ejemplo' : mode === 'mejorar' ? 'Mejorando la redacción' : 'Explicando', prompt: prompts[mode] })).trim();
    if (mode === 'mejorar') ed.replaceSelection(out);
    else if (mode === 'explicar') {
      const end = ed.getCursor('to');
      ed.replaceRange(`\n\n> [!info] Explicación\n> ${out.replace(/\n/g, '\n> ')}\n`, { line: end.line, ch: ed.getLine(end.line).length });
    } else {
      const end = ed.getCursor('to');
      ed.replaceRange(`\n\n${out}\n`, { line: end.line, ch: ed.getLine(end.line).length });
    }
  }
  async aiSummaryProp(file) {
    file = file || this.activeFile();
    const text = await this.noteText(file);
    if (text.length < 80) throw new Error('Escribe un poco más antes de resumir.');
    const out = await this.chat({ tier: 'fast', temperature: 0.2, maxTokens: 120, label: 'Resumiendo', schema: { type: 'object', properties: { resumen: { type: 'string' } }, required: ['resumen'] }, prompt: `Resume este apunte en UNA frase de máximo 20 palabras, en español.\n\n${text.slice(0, 5000)}` });
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.resumen = String(out.resumen || '').trim();
    });
  }
  async aiTags(file) {
    file = file || this.activeFile();
    const text = await this.noteText(file);
    const known = this.allTags().filter((t) => /^tema\//.test(t.tag)).map((t) => t.tag.replace(/^tema\//, ''));
    const out = await this.chat({
      tier: 'fast',
      temperature: 0.2,
      maxTokens: 120,
      label: 'Buscando etiquetas',
      schema: { type: 'object', properties: { etiquetas: { type: 'array', items: { type: 'string' }, maxItems: 3 } }, required: ['etiquetas'] },
      prompt: `Propón de 1 a 3 etiquetas de tema (minúsculas, con guiones, sin #) para este apunte. Si alguna de estas ya existe y calza, úsala: ${known.join(', ') || '(ninguna)'}.\n\nTÍTULO: ${file.basename}\n${text.slice(0, 3000)}`,
    });
    const tags = toArr(out.etiquetas).map((t) => `tema/${norm(t).replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')}`).filter((t) => t !== 'tema/');
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.tags = [...new Set(toArr(fm.tags).map(String).concat(tags))];
    });
    new Notice(`Etiquetas: ${tags.map((t) => '#' + t).join(' ')}`);
  }
  async openLocalGraph() {
    const file = this.app.workspace.getActiveFile();
    let leaf = this.app.workspace.getLeavesOfType('localgraph')[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: 'localgraph', state: file ? { file: file.path } : {}, active: false });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  // Bloques listos para insertar (aparecen en el menú "/")
  blockDefs() {
    return [
      ['nota', 'Nota destacada', '> [!note] Nota\n> '],
      ['importante', 'Importante', '> [!important] Importante\n> '],
      ['definicion', 'Definición', '> [!abstract] Definición: \n> '],
      ['ejemplo', 'Ejemplo', '> [!example] Ejemplo\n> '],
      ['advertencia', 'Ojo / error común', '> [!warning] Ojo\n> '],
      ['pregunta', 'Pregunta de repaso', '- ❓  ➜ '],
      ['desplegable', 'Sección desplegable', '> [!tip]- Ver más\n> '],
      ['codigo', 'Bloque de código', '```cpp\n\n```'],
      ['ecuacion', 'Ecuación (LaTeX)', '$$\n\n$$'],
      ['tabla', 'Tabla', '| Concepto | Descripción |\n| --- | --- |\n|  |  |'],
      ['comparacion', 'Comparación (A vs B)', '| | A | B |\n| --- | --- | --- |\n| Qué es |  |  |\n| Cuándo usar |  |  |\n| Ventajas |  |  |'],
      ['diagrama', 'Diagrama (Mermaid)', '```mermaid\nflowchart LR\n  A[Inicio] --> B[Paso]\n```'],
    ];
  }
  insertBlock(text) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) throw new Error('Abre una nota en modo edición.');
    const ed = view.editor;
    const cur = ed.getCursor();
    const prefix = ed.getLine(cur.line).trim() ? '\n' : '';
    ed.replaceSelection(prefix + text);
    ed.focus();
  }

  /** Nota padre de un tema: todas las notas con sus etiquetas, ordenables (fecha, importancia…). */
  async topicTable(dv, container, input) {
    const file = this.currentOf(dv);
    const temas = toArr(this.fm(file).temas).map((t) => String(t).replace(/^#/, '').toLowerCase()).filter(Boolean);
    const { inc } = this.linkGraph();
    const set = new Map();
    for (const f of [...(inc.get(file.path) || [])].map((p) => this.app.vault.getAbstractFileByPath(p))) if (f instanceof TFile && !this.levelOf(f)) set.set(f.path, f);
    for (const t of temas) for (const f of this.filesWithTag(t)) if (f !== file) set.set(f.path, f);
    const rows = [...set.values()];
    if (!rows.length) return container.createDiv({ cls: 'raiz-muted', text: 'Aún no hay notas en este tema.' });
    this.topicSort = this.topicSort || 'importancia';
    const bar = container.createDiv({ cls: 'raiz-lib-bar' });
    const sel = bar.createEl('select', { cls: 'raiz-select dropdown' });
    for (const [v, t] of [['importancia', 'Por importancia'], ['creada', 'Más recientes'], ['antiguas', 'Más antiguas'], ['modificada', 'Editadas hace poco'], ['titulo', 'Por título']]) sel.createEl('option', { value: v, text: t });
    sel.value = this.topicSort;
    const box = container.createDiv();
    const draw = () => {
      box.empty();
      const by = {
        importancia: (a, b) => (num(this.fm(b).importancia) || 0) - (num(this.fm(a).importancia) || 0) || b.stat.ctime - a.stat.ctime,
        creada: (a, b) => b.stat.ctime - a.stat.ctime,
        antiguas: (a, b) => a.stat.ctime - b.stat.ctime,
        modificada: (a, b) => b.stat.mtime - a.stat.mtime,
        titulo: (a, b) => a.basename.localeCompare(b.basename, 'es'),
      }[this.topicSort];
      this.table(
        box,
        ['Nota', 'Importancia', 'Creada', 'Resumen'],
        rows.sort(by).map((f) => [(td) => this.link(td, f), '★'.repeat(num(this.fm(f).importancia) || 0) || '—', fechaCorta(moment(f.stat.ctime)), String(this.fm(f).resumen || '—').slice(0, 90)])
      );
    };
    sel.addEventListener('change', () => {
      this.topicSort = sel.value;
      draw();
    });
    bar.createSpan({ cls: 'raiz-muted', text: `${rows.length} notas` });
    draw();
  }
  // ═════════════════════════════ Inicio tipo "hub" ═════════════════════════════
  spaceFile() {
    return this.app.vault.getAbstractFileByPath(`${this.settings.folders.dashboard}/Mi espacio.md`);
  }
  hubCards() {
    const def = [
      { titulo: 'Estructura', imagen: 'banner-semana-2', links: ['Bandeja', 'Agenda', 'Etiquetas'] },
      { titulo: 'Personal', imagen: 'banner-biblioteca', links: ['Biblioteca', 'Panel de entrenamiento'] },
      { titulo: 'Estudio', imagen: 'banner-academico', links: ['Panel académico', 'Conocimiento', 'Repaso'] },
    ];
    const raw = String(this.settings.hubCards || '').trim();
    if (!raw) return def;
    return raw
      .split('\n')
      .map((l) => l.split('|').map((x) => x.trim()))
      .filter((x) => x[0])
      .map(([titulo, imagen, links]) => ({ titulo, imagen: imagen || '', links: String(links || '').split(',').map((s) => s.replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean) }));
  }
  imageSrc(name) {
    if (!name) return null;
    if (/^https?:\/\//.test(name)) return name;
    const clean = name.replace(/^\[\[|\]\]$/g, '');
    const f =
      this.app.vault.getAbstractFileByPath(clean) ||
      this.app.metadataCache.getFirstLinkpathDest(clean, '') ||
      this.app.vault.getAbstractFileByPath(`${this.settings.folders.banners}/${clean}.svg`) ||
      this.app.vault.getAbstractFileByPath(`${this.settings.folders.covers}/${clean}`);
    return f instanceof TFile ? this.app.vault.getResourcePath(f) : null;
  }
  async quoteOfDay() {
    const f = this.app.vault.getAbstractFileByPath(`${this.settings.folders.dashboard}/Frases.md`);
    if (!(f instanceof TFile)) return null;
    const lines = (await this.app.vault.cachedRead(f))
      .split('\n')
      .map((l) => l.match(/^\s*[-*]\s+(.+)$/))
      .filter(Boolean)
      .map((m) => m[1].trim());
    if (!lines.length) return null;
    const day = Math.floor(moment().startOf('day').valueOf() / 86400000);
    const [text, author] = lines[day % lines.length].split(/\s+—\s+/);
    return { text: text.replace(/^["“]|["”]$/g, ''), author: author || '' };
  }
  async spaceSections() {
    const f = this.spaceFile();
    if (!(f instanceof TFile)) return [];
    const txt = (await this.app.vault.cachedRead(f)).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    return txt
      .split(/^## /m)
      .slice(1)
      .map((block) => {
        const [title, ...rest] = block.split('\n');
        return { title: title.trim(), body: rest.join('\n').trim() };
      });
  }
  async hub(dv, container) {
    const root = container.createDiv({ cls: 'raiz-hub' });
    // Reloj y fecha
    const clock = root.createDiv({ cls: 'raiz-hub-clock' });
    const time = clock.createDiv({ cls: 'raiz-hub-time' });
    clock.createDiv({ cls: 'raiz-hub-date', text: fechaLarga(moment()) });
    const tick = () => time.setText(moment().format('HH:mm:ss'));
    tick();
    const iv = setInterval(() => (root.isConnected ? tick() : clearInterval(iv)), 1000);
    // Tarjetas por área
    const cards = root.createDiv({ cls: 'raiz-hub-cards' });
    for (const c of this.hubCards()) {
      const card = cards.createDiv({ cls: 'raiz-hub-card' });
      card.createDiv({ cls: 'raiz-hub-card-title', text: c.titulo });
      const img = card.createDiv({ cls: 'raiz-hub-card-img' });
      const src = this.imageSrc(c.imagen);
      if (src) img.style.backgroundImage = `url("${src}")`;
      const links = card.createDiv({ cls: 'raiz-hub-card-links' });
      c.links.forEach((name, i) => {
        if (i) links.createSpan({ cls: 'raiz-crumb-sep', text: '·' });
        const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === name);
        if (f) this.link(links, f, name);
        else links.createSpan({ cls: 'raiz-muted', text: name });
      });
    }
    // Frase del día
    const q = await this.quoteOfDay();
    if (q) {
      const quote = root.createDiv({ cls: 'raiz-hub-quote' });
      quote.createDiv({ text: `“${q.text}”` });
      if (q.author) quote.createDiv({ cls: 'raiz-hub-quote-author', text: q.author });
    }
    // Metas, rituales y reflexión (se editan en "Mi espacio")
    const secs = await this.spaceSections();
    if (secs.length) {
      const boxes = root.createDiv({ cls: 'raiz-hub-boxes' });
      for (const s of secs.slice(0, 3)) {
        const box = boxes.createDiv({ cls: 'raiz-hub-box' });
        const head = box.createDiv({ cls: 'raiz-hub-box-title' });
        head.createSpan({ text: s.title });
        const edit = head.createEl('button', { cls: 'raiz-icon-btn', attr: { 'aria-label': 'Editar' } });
        setIcon(edit, 'pencil');
        edit.addEventListener('click', () => this.app.workspace.openLinkText(this.spaceFile().path, '', false));
        const body = box.createDiv({ cls: 'raiz-hub-box-body' });
        await MarkdownRenderer.render(this.app, s.body || '—', body, this.spaceFile().path, this);
      }
    }
    // Actividad del año
    this.heading(root, 'Actividad');
    await this.activityHeatmap(root);
  }
  /** Mapa de calor con las notas creadas o editadas cada día (último año). Clic en un día = sus notas. */
  async activityHeatmap(container, weeks = 52) {
    const end = moment().endOf('isoWeek');
    const start = end.clone().subtract(weeks - 1, 'weeks').startOf('isoWeek');
    const byDay = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.isContentFile(f)) continue;
      for (const t of new Set([moment(f.stat.ctime).format('YYYY-MM-DD'), moment(f.stat.mtime).format('YYYY-MM-DD')])) {
        if (!byDay.has(t)) byDay.set(t, new Set());
        byDay.get(t).add(f);
      }
    }
    const max = Math.max(1, ...[...byDay.values()].map((s) => s.size));
    const wrap = container.createDiv({ cls: 'raiz-heat-wrap' });
    const months = wrap.createDiv({ cls: 'raiz-heat-months' });
    months.style.setProperty('--weeks', weeks);
    const grid = wrap.createDiv({ cls: 'raiz-heat raiz-heat-activity' });
    grid.style.setProperty('--weeks', weeks);
    const detail = container.createDiv({ cls: 'raiz-heat-detail' });
    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const wk = start.clone().add(w, 'weeks');
      if (wk.month() !== lastMonth) {
        const m = months.createSpan({ text: cap(MESES[wk.month()].slice(0, 3)) });
        m.style.gridColumn = String(w + 2);
        lastMonth = wk.month();
      }
      for (let d = 0; d < 7; d++) {
        const day = wk.clone().add(d, 'days');
        const set = byDay.get(day.format('YYYY-MM-DD'));
        const cell = grid.createDiv({ cls: 'raiz-heat-cell' + (set ? ' is-on' : '') + (day.isAfter(moment(), 'day') ? ' is-future' : '') });
        cell.style.gridRow = String(d + 1);
        cell.style.gridColumn = String(w + 2);
        if (set) {
          cell.style.setProperty('--a', String(0.3 + 0.7 * Math.min(1, set.size / max)));
          cell.setAttr('title', `${fechaCorta(day)} · ${set.size} nota(s)`);
          cell.addEventListener('click', () => {
            detail.empty();
            detail.createDiv({ cls: 'raiz-moc-title', text: `${fechaLarga(day)} · ${set.size} nota(s)` });
            for (const f of [...set].sort((a, b) => b.stat.mtime - a.stat.mtime)) this.link(detail.createDiv({ cls: 'raiz-moc-item' }), f);
          });
        } else cell.setAttr('title', fechaCorta(day));
      }
    }
    for (let d = 0; d < 7; d += 2) grid.createDiv({ cls: 'raiz-heat-label', text: DIAS[d] }).style.gridRow = String(d + 1);
    const total = [...byDay.entries()].filter(([k]) => moment(k).isBetween(start, end, 'day', '[]')).length;
    detail.createDiv({ cls: 'raiz-muted', text: `${total} días activos en el último año · toca un día para ver sus notas` });
  }
  async prepareWorkspace() {
    const ws = this.app.workspace;
    const ensure = async (type, state = {}) => {
      let leaf = ws.getLeavesOfType(type)[0];
      if (!leaf) {
        leaf = ws.getRightLeaf(true);
        await leaf.setViewState({ type, state, active: false });
      }
      return leaf;
    };
    try {
      await this.app.commands.executeCommandById('journals:open-calendar');
    } catch (e) {
      /* calendario opcional */
    }
    await ensure('localgraph', this.app.workspace.getActiveFile() ? { file: this.app.workspace.getActiveFile().path } : {});
    await ensure(CONN_VIEW);
    ws.rightSplit?.expand?.();
    new Notice('Espacio listo: calendario, grafo local y conexiones a la derecha.');
  }
  /** Pequeña celebración al terminar algo. */
  celebrate(anchor) {
    const host = document.body.createDiv({ cls: 'raiz-confetti' });
    const r = anchor?.getBoundingClientRect?.() || { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
    const colors = ['#a3e635', '#34d399', '#38bdf8', '#a78bfa', '#fbbf24', '#fb7185'];
    for (let i = 0; i < 28; i++) {
      const p = host.createDiv({ cls: 'raiz-confetti-bit' });
      p.style.left = `${r.left + r.width / 2}px`;
      p.style.top = `${r.top + r.height / 2}px`;
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--dx', `${(Math.random() - 0.5) * 320}px`);
      p.style.setProperty('--dy', `${-80 - Math.random() * 220}px`);
      p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    }
    setTimeout(() => host.remove(), 1400);
  }

  // ═════════════════════════════ Tablero por estado (biblioteca y fuentes de aprendizaje) ═════════════════════════════
  libraryBoard(container, items) {
    const board = container.createDiv({ cls: 'raiz-board' });
    for (const estado of this.settings.mediaStates) {
      const list = items.filter((i) => String(i.fm.estado || this.settings.mediaStates[0]) === estado);
      const col = board.createDiv({ cls: `raiz-board-col ${this.estadoCls(estado)}` });
      col.createDiv({ cls: 'raiz-board-head', text: `${estado} · ${list.length}` });
      for (const i of list) {
        const card = col.createDiv({ cls: 'raiz-board-card' });
        card.style.setProperty('--c', i.cat.color);
        const src = this.coverSrc(i.fm.portada);
        if (src) card.createDiv({ cls: 'raiz-board-thumb' }).style.backgroundImage = `url("${src}")`;
        const body = card.createDiv({ cls: 'raiz-board-body' });
        body.createDiv({ cls: 'raiz-card-title', text: i.fm.titulo || i.file.basename });
        const dates = [i.fm.inicio && fechaCorta(toMoment(i.fm.inicio)), i.fm.fin && fechaCorta(toMoment(i.fm.fin))].filter(Boolean).join(' → ');
        if (dates) body.createDiv({ cls: 'raiz-card-sub', text: dates });
        const r = this.ratingLabel(i.fm.puntuacion);
        if (num(i.fm.puntuacion) !== null) body.createDiv({ cls: `raiz-rating ${r.cls}`, text: `${fmtNum(num(i.fm.puntuacion))} · ${r.text}` });
        card.addEventListener('click', () => this.app.workspace.openLinkText(i.file.path, '', false));
      }
    }
  }
  /** YouTube: pega el link y trae título, canal y miniatura (sin claves). */
  async searchYouTube(q) {
    const url = /^https?:\/\//.test(q) ? q : null;
    if (!url) throw new Error('Pega el enlace del video o curso de YouTube.');
    const j = await this.getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    const id = (url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/) || [])[1];
    return [
      {
        titulo: j.title,
        sub: j.author_name,
        creador: j.author_name,
        portada: id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : j.thumbnail_url,
        portadaAlt: j.thumbnail_url,
        fuente: url,
        plataforma: 'YouTube',
        generos: [],
      },
    ];
  }
};

// ───────────────────────────── Ajustes ─────────────────────────────

class RaizSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    const p = this.plugin;
    const s = p.settings;
    const save = () => p.saveSettings();
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Raíz' });

    containerEl.createEl('h3', { text: 'Inteligencia artificial' });
    s.ai = s.ai || { provider: 'ollama', providers: {}, embedVia: 'ollama' };
    s.ai.providers = s.ai.providers || {};
    // Resumen simple: qué IA usas ahora y un botón para que Raíz busque las que tienes
    const cur = p.aiConf();
    const now = new Setting(containerEl)
      .setName(`Ahora: ${cur.label}`)
      .setDesc(`Rápido: ${p.modelFor('fast') || 'el de tu cuenta'} · Profundo: ${p.modelFor('deep') || 'el de tu cuenta'}${cur.local ? ' · tus notas no salen de tu equipo' : ''}`);
    now.settingEl.addClass('raiz-ai-now');
    now
      .addButton((b) => b.setButtonText('Buscar mis IAs').setCta().onClick(() => new AiScanModal(p, () => this.display()).open()))
      .addButton((b) => b.setButtonText('Probar').onClick(() => p.run(() => p.testAI())));
    containerEl.createDiv({ cls: 'setting-item-description', text: 'Raíz revisa qué tienes: IA local (Ollama, LM Studio, OpenClaw…), tus suscripciones (Claude, ChatGPT, Gemini, Kimi, OpenCode) y tus API keys (OpenRouter, OpenAI, Anthropic, Grok, DeepSeek, Mistral y 20 más), y elige los modelos y parámetros por ti.' });
    new Setting(containerEl)
      .setName('Configuración manual')
      .setDesc('Elegir proveedor, URL, modelos y comandos a mano.')
      .addToggle((t) => t.setValue(!!s.ai.showAdvanced).onChange(async (v) => ((s.ai.showAdvanced = v), await save(), this.display())));
    if (s.ai.showAdvanced) {
    new Setting(containerEl)
      .setName('Proveedor')
      .setDesc('Elige quién responde: un modelo local (tus notas no salen de tu equipo) o uno en la nube (se envía el texto necesario a ese servicio).')
      .addDropdown((d) => {
        for (const [id, pv] of Object.entries(AI_PROVIDERS)) d.addOption(id, pv.label);
        d.setValue(p.aiId()).onChange(async (v) => {
          s.ai.provider = v;
          await save();
          p.checkAI(false);
          this.display();
        });
      });
    if (p.aiId() !== 'ollama') {
      const id = p.aiId();
      const c = p.aiConf(id);
      const preset = AI_PROVIDERS[id];
      const own = (s.ai.providers[id] = s.ai.providers[id] || {});
      if (c.hint) containerEl.createDiv({ cls: 'setting-item-description raiz-ai-hint', text: c.hint });
      if (!c.local) containerEl.createDiv({ cls: 'raiz-ai-warn', text: `Privacidad: cuando usas la IA, el texto de las notas que analiza se envía a ${c.label}. Con Ollama, LM Studio u OpenClaw en tu PC se queda en tu equipo.` });
      if (c.kind === 'cli') {
        const bin = p.findBin(c.bin);
        new Setting(containerEl)
          .setName('Programa')
          .setDesc(bin ? `Encontrado: ${bin}` : `No lo encuentro${c.install ? `. Instálalo desde ${c.install}` : ''}. También puedes escribir la ruta completa.`)
          .addText((t) => t.setPlaceholder(preset.bin || 'ej: mi-agente').setValue(own.bin || '').onChange(async (v) => ((own.bin = v.trim()), await save())));
        new Setting(containerEl)
          .setName('Argumentos')
          .setDesc('{model} = el modelo · {archivo} = archivo con la petición. Si no usas {archivo}, la petición llega por la entrada estándar.')
          .addText((t) => {
            t.setPlaceholder((preset.args || []).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')).setValue(own.args || '').onChange(async (v) => ((own.args = v.trim()), await save()));
            t.inputEl.style.width = '100%';
          });
        if (c.login)
          new Setting(containerEl)
            .setName('Iniciar sesión')
            .setDesc(`Una sola vez, en una terminal: ${c.login}`)
            .addButton((b) =>
              b.setButtonText('Copiar comando').onClick(() => {
                navigator.clipboard.writeText(c.login.split(' (')[0]);
                new Notice('Comando copiado. Pégalo en una terminal.');
              })
            );
      } else {
      new Setting(containerEl)
        .setName('URL base')
        .setDesc(preset.baseUrl ? `Por defecto: ${preset.baseUrl}` : 'La dirección de la API, normalmente termina en /v1.')
        .addText((t) => t.setPlaceholder(preset.baseUrl || 'https://…/v1').setValue(own.baseUrl || '').onChange(async (v) => ((own.baseUrl = v.trim()), await save())));
      const key = new Setting(containerEl).setName('API key').setDesc('Se guarda cifrada en el Llavero de Obsidian, solo en este equipo: no queda en el vault ni se sube a GitHub.');
      key.addText((t) => {
        t.inputEl.type = 'password';
        t.setPlaceholder(c.needsKey ? 'Pega tu key' : 'Opcional').setValue(p.apiKey(id)).onChange((v) => p.setApiKey(id, v));
      });
      if (c.keyUrl) key.addButton((b) => b.setButtonText('Conseguir una key').onClick(() => window.open(c.keyUrl)));
      }
      const listId = `raiz-models-${id}`;
      const dl = containerEl.createEl('datalist', { attr: { id: listId } });
      const field = (k, name, desc) =>
        new Setting(containerEl)
          .setName(name)
          .setDesc(desc)
          .addText((t) => {
            t.inputEl.setAttr('list', listId);
            t.setPlaceholder(preset[k] || 'nombre del modelo').setValue(own[k] || '').onChange(async (v) => ((own[k] = v.trim()), await save()));
          });
      field('fast', 'Modelo rápido', 'Nota y título del día, etiquetas, textos cortos. Vacío = el sugerido.');
      field('deep', 'Modelo profundo', 'Resúmenes, Rueda de la Vida, coach, apuntes. Vacío = el mismo que el rápido.');
      new Setting(containerEl)
        .setName('Modelos de tu cuenta')
        .setDesc('Trae la lista real del proveedor para elegir al escribir en los campos de arriba.')
        .addButton((b) =>
          b.setButtonText('Cargar modelos').onClick(() =>
            p.run(async () => {
              const ms = await p.listModels(id);
              dl.empty();
              ms.forEach((m) => dl.createEl('option', { value: m }));
              new Notice(`${ms.length} modelos disponibles. Escribe en "Modelo rápido" o "Modelo profundo" y elige de la lista.`, 6000);
            })
          )
        )
        .addButton((b) => b.setButtonText('Probar').setCta().onClick(() => p.run(() => p.testAI())));
      if (c.kind === 'openai') {
        new Setting(containerEl)
          .setName('Notas relacionadas y preguntas al vault')
          .setDesc('Usan un modelo de "embeddings". Puedes dejarlos en Ollama (local y gratis) aunque el chat sea en la nube. Si lo cambias, reindexa tus notas.')
          .addDropdown((d) =>
            d
              .addOption('ollama', 'Ollama (local)')
              .addOption('provider', c.label)
              .setValue(s.ai.embedVia || 'ollama')
              .onChange(async (v) => ((s.ai.embedVia = v), await save(), this.display()))
          );
        if (s.ai.embedVia === 'provider')
          new Setting(containerEl).setName('Modelo de embeddings del proveedor').addText((t) => t.setPlaceholder(preset.embed || 'ej: text-embedding-3-small').setValue(own.embed || '').onChange(async (v) => ((own.embed = v.trim()), await save())));
      }
    }


    if (p.aiId() === 'ollama') {
    containerEl.createEl('h4', { text: 'Ollama' });
    const ram = p.totalRamGB();
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: `Todo se procesa en tu equipo: sin API key, sin límites, sin enviar tus notas a nadie. ${ram ? `Este equipo tiene ${fmtNum(ram, 0)} GB de RAM → modelo profundo: ${p.modelFor('deep')}.` : 'En el celular, apunta la URL a tu PC (por ejemplo vía Tailscale).'}`,
    });
    let deviceUrl = '';
    try {
      deviceUrl = window.localStorage.getItem('raiz-ollama-url') || '';
    } catch (e) {
      /* nada */
    }
    new Setting(containerEl)
      .setName('URL de Ollama (este dispositivo)')
      .setDesc('Vacío = la URL general de abajo. Útil en el celular para usar la IA de tu PC.')
      .addText((t) =>
        t.setPlaceholder(s.ollamaUrl).setValue(deviceUrl).onChange((v) => {
          try {
            if (v.trim()) window.localStorage.setItem('raiz-ollama-url', v.trim());
            else window.localStorage.removeItem('raiz-ollama-url');
          } catch (e) {
            /* nada */
          }
        })
      );
    new Setting(containerEl).setName('URL general de Ollama').addText((t) => t.setValue(s.ollamaUrl).onChange(async (v) => ((s.ollamaUrl = v.trim() || DEFAULT_SETTINGS.ollamaUrl), await save())));
    new Setting(containerEl)
      .setName('Probar conexión / descargar modelos')
      .addButton((b) => b.setButtonText('Probar').onClick(() => p.checkOllama(true)))
      .addButton((b) => b.setButtonText('Descargar modelos').setCta().onClick(() => p.pullModels()));
    new Setting(containerEl)
      .setName('Elección de modelo')
      .setDesc('Automático: en equipos con poca RAM usa el modelo profundo liviano.')
      .addDropdown((d) => d.addOption('auto', 'Automático según RAM').addOption('manual', 'Manual').setValue(s.modelMode).onChange(async (v) => ((s.modelMode = v), await save(), this.display())));
    new Setting(containerEl).setName('Modelo rápido').setDesc('Notas del día, títulos, condensar texto.').addText((t) => t.setValue(s.fastModel).onChange(async (v) => ((s.fastModel = v.trim()), await save())));
    new Setting(containerEl).setName('Modelo profundo').setDesc('Resúmenes, Rueda de la Vida, coach, preguntas largas.').addText((t) => t.setValue(s.deepModel).onChange(async (v) => ((s.deepModel = v.trim()), await save())));
    if (s.modelMode === 'auto')
      new Setting(containerEl)
        .setName(`Modelo profundo con menos de ${s.lowRamThresholdGB} GB de RAM`)
        .addText((t) => t.setValue(s.lowRamDeepModel).onChange(async (v) => ((s.lowRamDeepModel = v.trim()), await save())));
    new Setting(containerEl)
      .setName('Contexto (tokens)')
      .setDesc('Más contexto = lee más notas a la vez, pero usa más RAM. 8192 es buen equilibrio.')
      .addText((t) => t.setValue(String(s.numCtx)).onChange(async (v) => ((s.numCtx = clamp(parseInt(v, 10) || 8192, 2048, 65536)), await save())));
    }
    }
    new Setting(containerEl)
      .setName('Sobre ti')
      .setDesc('La IA usa esto como contexto. Cuéntale tu situación.')
      .addTextArea((t) => {
        t.setValue(s.userProfile).onChange(async (v) => ((s.userProfile = v), await save()));
        t.inputEl.rows = 4;
        t.inputEl.style.width = '100%';
      });

    containerEl.createEl('h3', { text: 'Tipografía' });
    const fontOpts = p.fontOptions();
    s.fonts = s.fonts || {};
    for (const [slot, name, desc] of [
      ['text', 'Texto', 'Lo que escribes y lees en tus notas.'],
      ['headings', 'Títulos', 'Encabezados, títulos de página y de los paneles.'],
      ['ui', 'Interfaz', 'Menús, barra lateral y botones.'],
    ]) {
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addDropdown((d) => {
          for (const [v, l] of fontOpts) d.addOption(v, l);
          d.setValue(s.fonts[slot] || '').onChange(async (v) => ((s.fonts[slot] = v), await save(), p.applyFonts(), this.display()));
        });
      if (s.fonts[slot] === 'custom')
        new Setting(containerEl)
          .setName(`${name}: nombre de la fuente`)
          .setDesc('Tal como aparece en tu sistema, ej: Garamond, Book Antiqua, Cascadia Code.')
          .addText((t) => t.setValue(s.fonts[`${slot}Custom`] || '').onChange(async (v) => ((s.fonts[`${slot}Custom`] = v.trim()), await save(), p.applyFonts())));
    }
    const prev = containerEl.createDiv({ cls: 'raiz-font-preview' });
    prev.createDiv({ cls: 'raiz-font-preview-h', text: 'Aprender es conectar ideas' });
    prev.createDiv({ cls: 'raiz-font-preview-t', text: 'Cuando el cerebro codifica información busca un lugar donde ponerla. Así se ve tu texto · 0123456789' });
    new Setting(containerEl)
      .setName('Fuentes de tu PC')
      .setDesc(`Agrega archivos .ttf, .otf, .woff o .woff2 y aparecen en las listas de arriba. Se guardan solo en este vault, sin subirse a GitHub. ${(p.userFonts || []).length ? `Tienes: ${p.userFonts.join(', ')}.` : ''}`)
      .addButton((b) => b.setButtonText('Agregar fuente').onClick(() => p.pickFont(() => this.display())));
    containerEl.createDiv({ cls: 'setting-item-description', text: 'Las fuentes con nombre (EB Garamond, Lora, Playfair…) se descargan de Google Fonts la primera vez: sin internet se usa una parecida de tu sistema.' });

    containerEl.createEl('h3', { text: 'Vida académica' });
    new Setting(containerEl).setName('Semestre actual').setDesc('Ej: 2026-2. Vacío = se calcula por la fecha.').addText((t) => t.setValue(s.semestreActual).onChange(async (v) => ((s.semestreActual = v.trim()), await save())));
    new Setting(containerEl).setName('Escala de notas').setDesc('Mínima · aprobación · máxima').addText((t) =>
      t.setValue(`${s.notaMin} · ${s.notaAprobacion} · ${s.notaMax}`).onChange(async (v) => {
        const n = v.split(/[·;|]/).map((x) => num(x));
        if (n.length === 3 && n.every((x) => x !== null)) {
          [s.notaMin, s.notaAprobacion, s.notaMax] = n;
          await save();
        }
      })
    );

    containerEl.createEl('h3', { text: 'Entrenamiento' });
    new Setting(containerEl).setName('Meta de sesiones por semana').addText((t) => t.setValue(String(s.metaSesionesSemana)).onChange(async (v) => ((s.metaSesionesSemana = clamp(parseInt(v, 10) || 4, 1, 14)), await save())));
    new Setting(containerEl)
      .setName('Tipos de entrenamiento')
      .setDesc('Separados por coma. Aplica a las notas nuevas.')
      .addTextArea((t) => t.setValue(s.trainingTypes.join(', ')).onChange(async (v) => ((s.trainingTypes = v.split(',').map((x) => x.trim()).filter(Boolean)), await save())));

    new Setting(containerEl).setName('Descanso entre series (segundos)').addText((t) => t.setValue(String(s.restSeconds || 90)).onChange(async (v) => ((s.restSeconds = clamp(parseInt(v, 10) || 90, 10, 600)), await save())));

    containerEl.createEl('h3', { text: 'Inicio' });
    new Setting(containerEl)
      .setName('Tarjetas del inicio')
      .setDesc('Una por línea: título | imagen (nombre en Portadas o Banners, o URL) | notas separadas por coma. Vacío = las de siempre.')
      .addTextArea((t) => {
        t.setPlaceholder('Estudio | mi-portada.jpg | Panel académico, Conocimiento, Repaso').setValue(s.hubCards || '').onChange(async (v) => ((s.hubCards = v), await save()));
        t.inputEl.rows = 4;
        t.inputEl.style.width = '100%';
      });

    containerEl.createEl('h3', { text: 'Conexiones y repaso' });
    new Setting(containerEl).setName('Modelo de embeddings').setDesc('Para notas relacionadas y preguntas al vault. Recomendado: bge-m3 (multilingüe, ~1,2 GB). Más liviano: nomic-embed-text (entiende peor el español).').addText((t) => t.setValue(s.embedModel).onChange(async (v) => ((s.embedModel = v.trim() || 'bge-m3'), await save())));
    new Setting(containerEl).setName('Indexar en segundo plano al abrir Obsidian').addToggle((t) => t.setValue(s.autoIndex !== false).onChange(async (v) => ((s.autoIndex = v), await save())));
    new Setting(containerEl).setName('Enlaces nuevos en páginas crean subpáginas').setDesc('Al hacer clic en un [[enlace]] que aún no existe dentro de una página de estudio, la nota nueva nace como subpágina suya (con cabecera, padre y propiedades heredadas).').addToggle((t) => t.setValue(s.autoSubpages !== false).onChange(async (v) => ((s.autoSubpages = v), await save())));
    new Setting(containerEl).setName('Tarjetas nuevas por día').addText((t) => t.setValue(String(s.newCardsPerDay || 15)).onChange(async (v) => ((s.newCardsPerDay = clamp(parseInt(v, 10) || 15, 1, 200)), await save())));

    containerEl.createEl('h3', { text: 'Biblioteca' });
    new Setting(containerEl)
      .setName('Categorías')
      .setDesc('Una por línea: clave | emoji | nombre | color | buscador | unidad. Buscadores: steam, openlibrary, anime, manga, tvmaze, wikipedia, none.')
      .addTextArea((t) => {
        t.setValue(s.mediaCategories.map((c) => [c.key, c.emoji, c.label, c.color, c.provider, c.unidad].join(' | ')).join('\n')).onChange(async (v) => {
          const cats = v
            .split('\n')
            .map((l) => l.split('|').map((x) => x.trim()))
            .filter((x) => x[0] && x[2])
            .map(([key, emoji, label, color, provider, unidad]) => ({ key: norm(key).replace(/[^a-z0-9]/g, ''), emoji: emoji || '✨', label, color: /^#[0-9a-f]{3,6}$/i.test(color || '') ? color : '#94a3b8', provider: provider || 'wikipedia', unidad: unidad || '' }));
          if (cats.length) {
            s.mediaCategories = cats;
            await save();
          }
        });
        t.inputEl.rows = 8;
        t.inputEl.style.width = '100%';
      });
    new Setting(containerEl)
      .setName('Estados')
      .setDesc('Separados por coma.')
      .addText((t) => t.setValue(s.mediaStates.join(', ')).onChange(async (v) => ((s.mediaStates = v.split(',').map((x) => x.trim()).filter(Boolean)), await save())));

    containerEl.createEl('h3', { text: 'Mis metas' });
    new Setting(containerEl)
      .setName('Metas diarias')
      .setDesc(`${this.plugin.activeGoals().length} activas: agua, comida, pasos, lectura… con tus propios números y unidades.`)
      .addButton((b) => b.setButtonText('Editar mis metas').setCta().onClick(() => this.plugin.editGoals(() => this.display())));
    containerEl.createEl('h3', { text: 'Fondos por apartado' });
    containerEl.createDiv({ cls: 'setting-item-description', text: 'Para cambiar uno, abre una nota de ese apartado y usa el botón Fondo o el comando "Cambiar imagen de fondo".' });
    for (const sec of this.plugin.sections()) {
      const v = this.plugin.sectionBanner(sec.key);
      if (v === null) continue;
      new Setting(containerEl)
        .setName(sec.label)
        .setDesc(v ? String(v).replace(/^\[\[|\]\]$/g, '') : 'Sin imagen')
        .addButton((b) => b.setButtonText('Restaurar el original').onClick(async () => (await this.plugin.applySectionBanner(sec, null), this.display())));
    }
    containerEl.createEl('h3', { text: 'Hábitos y Rueda de la Vida' });
    new Setting(containerEl)
      .setName('Hábitos')
      .setDesc('Uno por línea: clave | etiqueta. Aplica a las notas nuevas.')
      .addTextArea((t) => {
        t.setValue(s.habits.map((h) => `${h.key} | ${h.label}`).join('\n')).onChange(async (v) => {
          s.habits = v
            .split('\n')
            .map((l) => l.split('|').map((x) => x.trim()))
            .filter((x) => x[0] && x[1])
            .map(([key, label]) => ({ key: norm(key).replace(/[^a-z0-9]/g, ''), label }));
          await save();
        });
        t.inputEl.rows = 7;
        t.inputEl.style.width = '100%';
      });
    new Setting(containerEl)
      .setName('Áreas de la Rueda de la Vida')
      .setDesc('Una por línea: clave | emoji | etiqueta | color | descripción para la IA.')
      .addTextArea((t) => {
        t.setValue(s.wheelAreas.map((a) => [a.key, a.emoji, a.label, a.color, a.desc].join(' | ')).join('\n')).onChange(async (v) => {
          const areas = v
            .split('\n')
            .map((l) => l.split('|').map((x) => x.trim()))
            .filter((x) => x[0] && x[2])
            .map(([key, emoji, label, color, desc]) => ({ key: norm(key).replace(/[^a-z0-9]/g, ''), emoji: emoji || '•', label, color: /^#[0-9a-f]{3,6}$/i.test(color || '') ? color : '#888888', desc: desc || label }));
          if (areas.length >= 3) {
            s.wheelAreas = areas;
            await save();
          }
        });
        t.inputEl.rows = 10;
        t.inputEl.style.width = '100%';
      });
  }
}
