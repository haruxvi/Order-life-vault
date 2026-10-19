'use strict';
/*
 * Raíz — plugin propio del vault.
 * IA 100% local vía Ollama (sin API key, sin límites), entrenamiento, vida académica,
 * agenda, hábitos y gráficos. Expone su API en window.raiz para las plantillas de Templater
 * y los bloques dataviewjs.
 */
const { Plugin, PluginSettingTab, Setting, Notice, Modal, FuzzySuggestModal, ItemView, MarkdownRenderer, MarkdownView, getAllTags, requestUrl, TFile, moment } = require('obsidian');

// ───────────────────────────── Configuración por defecto ─────────────────────────────

const DEFAULT_SETTINGS = {
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
  restSeconds: 90,
  embedModel: 'bge-m3',
  newCardsPerDay: 15,
  autoIndex: true,
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
    { key: 'agua', label: '💧 2 L de agua' },
    { key: 'proteina', label: '🥩 Meta de proteína' },
    { key: 'lectura', label: '📖 Leer 20 min' },
    { key: 'aprender', label: '🧠 Aprender algo nuevo' },
    { key: 'planificar', label: '🗒️ Planificar el día' },
    { key: 'pantallas', label: '📵 Sin pantallas antes de dormir' },
  ],
  folders: {
    daily: '01 Daily',
    weekly: '02 Weekly',
    monthly: '03 Monthly',
    quarterly: '04 Quarterly',
    yearly: '05 Yearly',
    templates: '06 Templates/Raiz',
    academic: '08 Académico',
    training: '09 Entrenamiento',
    agenda: '10 Agenda',
    library: '11 Biblioteca',
    banners: '06 Templates/Banners',
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
    this.statusEl.onClickEvent(() => this.checkOllama(true));

    this.addCommand({ id: 'open-settings', name: 'Abrir ajustes', callback: () => this.openSettings() });
    this.addCommand({ id: 'check-ollama', name: 'Comprobar IA local (Ollama)', callback: () => this.checkOllama(true) });
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
      const st = await this.checkOllama(false);
      // Indexado en segundo plano para las conexiones (solo si el modelo de embeddings está instalado)
      const hasEmbed = st.ok && st.installed.some((m) => m.replace(/:latest$/, '') === this.settings.embedModel.replace(/:latest$/, ''));
      if (this.settings.autoIndex && hasEmbed) setTimeout(() => this.indexVault(true).catch(() => {}), 20000);
    });
  }

  onunload() {
    this.stopRest();
    if (window.raiz === this.api) delete window.raiz;
  }

  async loadSettings() {
    const data = (await this.loadData()) || {};
    this.settings = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), data);
    this.settings.folders = Object.assign({}, DEFAULT_SETTINGS.folders, data.folders || {});
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
        check: () => p.checkOllama(true),
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
      if (missing.length) {
        this.statusEl?.setText('✦ IA: faltan modelos');
        if (verbose) new Notice(`Ollama está activo, pero faltan modelos: ${missing.join(', ')}.\nUsa "Raíz: Descargar modelos de IA recomendados".`, 10000);
      } else {
        this.statusEl?.setText(`✦ IA lista · ${this.modelFor('fast')}`);
        if (verbose) new Notice(`✅ IA local lista.\nRápido: ${this.modelFor('fast')}\nProfundo: ${this.modelFor('deep')}`);
      }
      return { ok: true, installed, missing };
    } catch (e) {
      this.statusEl?.setText('✦ IA apagada');
      if (verbose) new Notice(`No encuentro Ollama en ${base}.\nInstálalo desde ollama.com y ábrelo.`, 10000);
      return { ok: false, installed: [], missing: this.neededModels() };
    }
  }

  async pullModels() {
    const base = this.ollamaUrl();
    for (const model of [...this.neededModels(), this.settings.embedModel]) {
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
  async createNote(folder, name, content) {
    const dir = folder.replace(/\/+$/, '');
    await this.ensureFolder(dir);
    let path = `${dir}/${safeName(name)}.md`;
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(path)) path = `${dir}/${safeName(name)} ${i++}.md`;
    const file = await this.app.vault.create(path, content);
    await this.app.workspace.getLeaf(false).openFile(file);
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
      periodHabits: wrap(this.periodHabits),
      monthCalendar: wrap(this.monthCalendar),
      trainingDashboard: wrap(this.trainingDashboard),
      academicDashboard: wrap(this.academicDashboard),
      courseStatus: wrap(this.courseStatus),
      agenda: wrap(this.agendaView),
      home: wrap(this.home),
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
    return container.createEl('h4', { cls: 'raiz-h', text });
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
      if (!list.length) {
        const empty = grid.createDiv({ cls: 'raiz-empty' });
        empty.createDiv({ text: items.length ? 'Nada coincide con los filtros.' : 'Tu biblioteca está vacía.' });
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
  async downloadCover(url, name, alt) {
    for (const u of [url, alt].filter(Boolean)) {
      try {
        const res = await requestUrl({ url: u, method: 'GET', throw: false });
        const ct = String(res.headers?.['content-type'] || res.headers?.['Content-Type'] || '');
        if (res.status >= 400 || !ct.startsWith('image') || !res.arrayBuffer || res.arrayBuffer.byteLength < 1000) continue;
        const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : 'jpg';
        const dir = `${this.settings.folders.library}/_portadas`;
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
    if (this.vec && this.vec.model === this.settings.embedModel) return this.vec;
    try {
      this.vec = JSON.parse(await this.app.vault.adapter.read(this.vecPath()));
    } catch (e) {
      this.vec = null;
    }
    if (!this.vec || this.vec.model !== this.settings.embedModel) this.vec = { model: this.settings.embedModel, items: {} };
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
      this.checkOllama(false);
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
    return ['```meta-bind-button', `id: ${id}`, `label: ${JSON.stringify(label)}`, `style: ${style}`, 'class: raiz-btn', 'hidden: true', 'actions:', actionYaml, '```'].join('\n');
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
    return [`banner: "[[${file ? file.path : name + '.svg'}]]"`, 'banner-y: 50', 'banner-height: 320', 'content-start: 210', 'banner-fade: -75', 'banner-radius: 22'].join('\n');
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
        '### 🌡️ Check-in',
        '- 🙂 **Ánimo** `INPUT[slider(minValue(1), maxValue(5), addLabels):animo]`',
        '- ⚡ **Energía** `INPUT[slider(minValue(1), maxValue(5), addLabels):energia]`',
        '- 😴 **Sueño** `INPUT[number(placeholder(horas)):sueno]` h · ⚖️ **Peso** `INPUT[number(placeholder(kg)):peso]` kg · 📚 **Estudio** `INPUT[number(placeholder(horas)):horasEstudio]` h',
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
    return `---\n${fm.join('\n')}\n---\n${body.join('\n')}\n`;
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

    containerEl.createEl('h3', { text: 'IA local (Ollama)' });
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
    new Setting(containerEl)
      .setName('Sobre ti')
      .setDesc('La IA usa esto como contexto. Cuéntale tu situación.')
      .addTextArea((t) => {
        t.setValue(s.userProfile).onChange(async (v) => ((s.userProfile = v), await save()));
        t.inputEl.rows = 4;
        t.inputEl.style.width = '100%';
      });

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

    containerEl.createEl('h3', { text: 'Conexiones y repaso' });
    new Setting(containerEl).setName('Modelo de embeddings').setDesc('Para notas relacionadas y preguntas al vault. Recomendado: bge-m3 (multilingüe, ~1,2 GB). Más liviano: nomic-embed-text (entiende peor el español).').addText((t) => t.setValue(s.embedModel).onChange(async (v) => ((s.embedModel = v.trim() || 'bge-m3'), await save())));
    new Setting(containerEl).setName('Indexar en segundo plano al abrir Obsidian').addToggle((t) => t.setValue(s.autoIndex !== false).onChange(async (v) => ((s.autoIndex = v), await save())));
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
