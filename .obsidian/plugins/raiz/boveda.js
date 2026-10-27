#!/usr/bin/env node
/**
 * boveda.js — herramienta de consulta del vault para agentes de IA (CLI y servidor MCP).
 *
 * El problema: un agente sin mapa lee notas completas, y mientras más crece el vault
 * (y su grafo), más tokens gasta por tarea. Esta herramienta sigue un contrato simple:
 * el costo de una consulta depende de cuánto es relevante, no del tamaño del vault.
 *
 *  - El índice nunca entra al contexto: el agente lo CONSULTA y recibe solo lo pertinente.
 *  - Se devuelven secciones (ruta:línea), no archivos enteros.
 *  - El índice se mantiene fresco y barato: solo se reprocesa lo que cambió (fecha y tamaño).
 *  - Cada respuesta tiene un tope duro de caracteres.
 *  - Las notas con `privado: true` nunca salen.
 *  - Todo se mide: cada llamada anota lo que devolvió y lo que habría costado abrir esas notas.
 *
 * Uso (desde la carpeta del vault):
 *   node .obsidian/plugins/raiz/boveda.js buscar "heap y stack" [--limite 8]
 *   node .obsidian/plugins/raiz/boveda.js seccion "08 Académico/Estudio/C++.md" "Punteros"
 *   node .obsidian/plugins/raiz/boveda.js esqueleto "08 Académico/Estudio/C++.md"
 *   node .obsidian/plugins/raiz/boveda.js vecinos "C++"
 *   node .obsidian/plugins/raiz/boveda.js datos --desde 2026-10-01 --columnas sueno,peso
 *   node .obsidian/plugins/raiz/boveda.js medicion
 *   node .obsidian/plugins/raiz/boveda.js memoria contexto "tarea" --proyecto "Mi app"
 *   node .obsidian/plugins/raiz/boveda.js ejecucion iniciar "meta" --tope 10 --plazo 07:40
 *   node .obsidian/plugins/raiz/boveda.js mcp [--perfil vault|proyectos|agente|orquestador|todo]   (servidor MCP por stdio)
 *
 * Sin dependencias: solo Node.js 18 o superior.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const VERSION = '1.2.0';
const CACHE_VERSION = 6;
const MAX_SALIDA = 6000; // caracteres por respuesta: el presupuesto duro
const MAX_SECCION = 4000;
const MAX_BYTES_NOTA = 400000;
const SIEMPRE_FUERA = ['node_modules']; // y toda carpeta oculta (.git, .obsidian, .trash…)
const VACIAS = new Set(
  ('el la los las lo un una unos unas de del al a ante bajo con contra desde en entre hacia hasta para por segun sin sobre tras y e o u ni que qué cual cuál cuales ' +
    'como cómo cuando donde dónde quien quién es son era fue ser estar esta este esto estos estas ese esa eso hay muy mas más menos ya no si sí se su sus mi mis tu tus me te le les nos ' +
    'the of and or to in on for with is are was be it this that an as at by from')
    .split(/\s+/)
    .map((w) => sinAcentos(w))
);

// ───────────── Raíz del vault y rutas auxiliares ─────────────
/**
 * Dónde está el vault, sin suponer nada sobre la carpeta del usuario (escritorio, Documentos, iCloud, un disco externo…):
 * 1. --raiz <carpeta> o la variable RAIZ_VAULT, si se indican;
 * 2. si este archivo está dentro de <vault>/<carpeta de configuración>/plugins/<plugin>/, ese vault
 *    (sirve aunque la carpeta de configuración no se llame .obsidian);
 * 3. si no, se sube desde la carpeta actual hasta encontrar una que tenga una configuración de Obsidian.
 */
function esVault(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory() && e.name.startsWith('.') && fs.existsSync(path.join(dir, e.name, 'app.json')));
  } catch (e) {
    return false;
  }
}
function raizVault() {
  const arg = process.argv.indexOf('--raiz');
  if (arg > -1 && process.argv[arg + 1]) return path.resolve(process.argv[arg + 1]);
  if (process.env.RAIZ_VAULT) return path.resolve(process.env.RAIZ_VAULT);
  if (path.basename(path.dirname(__dirname)) === 'plugins') {
    const v = path.resolve(__dirname, '..', '..', '..');
    if (esVault(v)) return v;
  }
  for (let d = process.cwd(); ; d = path.dirname(d)) {
    if (esVault(d)) return d;
    if (path.dirname(d) === d) break;
  }
  return process.cwd();
}
const RAIZ = raizVault();
// La caché y la medición viven junto al plugin de ESTE vault; si se consulta otro vault, van a una carpeta propia de ese vault
function carpetaDatos() {
  if (process.env.RAIZ_BOVEDA_DATOS) return path.resolve(process.env.RAIZ_BOVEDA_DATOS);
  if (path.basename(path.dirname(__dirname)) === 'plugins' && path.resolve(__dirname, '..', '..', '..') === RAIZ) return __dirname;
  const clave = require('crypto').createHash('sha1').update(RAIZ.toLowerCase()).digest('hex').slice(0, 12);
  const dir = path.join(require('os').tmpdir(), 'raiz-boveda', clave);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    /* sin permiso: se trabaja sin caché */
  }
  return dir;
}
const AUX = carpetaDatos();
const CACHE = path.join(AUX, '.boveda-cache.json');
const MEDICION = path.join(AUX, '.boveda-medicion.jsonl');

function sinAcentos(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function tokens(texto) {
  return sinAcentos(texto)
    .split(/[^a-z0-9ñ+#]+/)
    .filter((t) => t.length > 1 && !VACIAS.has(t))
    .map((t) => (t.length > 4 && t.endsWith('es') ? t.slice(0, -2) : t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
}

// ───────────── .ignore (lo que tampoco se indexa) ─────────────
function reglasIgnorar() {
  const reglas = [];
  try {
    for (const l of fs.readFileSync(path.join(RAIZ, '.ignore'), 'utf8').split(/\r?\n/)) {
      const t = l.trim();
      if (t && !t.startsWith('#') && !t.startsWith('!')) reglas.push(t.replace(/\\/g, '/'));
    }
  } catch (e) {
    /* sin .ignore */
  }
  return reglas;
}
function ignorada(rel, reglas) {
  for (const r of reglas) {
    if (r.startsWith('*.')) {
      if (rel.toLowerCase().endsWith(r.slice(1).toLowerCase())) return true;
    } else if (r.endsWith('/')) {
      if (rel === r.slice(0, -1) || rel.startsWith(r)) return true;
    } else if (rel === r || rel.startsWith(r + '/')) return true;
  }
  return false;
}
function listarNotas() {
  const reglas = reglasIgnorar();
  const out = [];
  const visitar = (dir, rel) => {
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || SIEMPRE_FUERA.includes(e.name) || ignorada(r + '/', reglas)) continue;
        visitar(path.join(dir, e.name), r);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md') && !ignorada(r, reglas)) out.push(r);
    }
  };
  visitar(RAIZ, '');
  return out;
}

// ───────────── Lectura de una nota: frontmatter, secciones y enlaces ─────────────
function frontmatter(txt) {
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const fm = {};
  if (!m) return { fm, cuerpo: txt, lineasFm: 0 };
  let clave = null;
  for (const l of m[1].split(/\r?\n/)) {
    const kv = l.match(/^([A-Za-zÀ-ÿ0-9_-]+):\s*(.*)$/);
    if (kv) {
      clave = kv[1];
      const v = kv[2].trim().replace(/^["']|["']$/g, '');
      fm[clave] = v === '' ? [] : v;
    } else if (clave && /^\s*-\s+/.test(l)) {
      if (!Array.isArray(fm[clave])) fm[clave] = fm[clave] ? [fm[clave]] : [];
      fm[clave].push(l.replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, ''));
    }
  }
  return { fm, cuerpo: txt.slice(m[0].length), lineasFm: m[0].split('\n').length - 1 };
}
function esPrivada(fm) {
  const p = String(Array.isArray(fm.privado) ? fm.privado[0] : fm.privado || '').toLowerCase();
  const tags = (Array.isArray(fm.tags) ? fm.tags : [fm.tags]).map((t) => String(t || '').toLowerCase());
  return p === 'true' || p === 'sí' || p === 'si' || tags.includes('privado');
}
/** Limpia lo que no es contenido: bloques de código de paneles, comentarios, widgets y HTML. */
function limpiarLinea(l) {
  return l
    .replace(/`(?:INPUT|BUTTON|VIEW)\[[^\]]*\][^`]*`/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .trim();
}
function analizar(rel) {
  const abs = path.join(RAIZ, rel);
  const st = fs.statSync(abs);
  if (st.size > MAX_BYTES_NOTA) return { rel, bytes: st.size, mtime: st.mtimeMs, fm: {}, secciones: [], enlaces: [], omitida: 'muy grande' };
  const txt = fs.readFileSync(abs, 'utf8');
  const { fm, cuerpo, lineasFm } = frontmatter(txt);
  const base = path.basename(rel, '.md');
  const enlaces = [...new Set([...txt.matchAll(/\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim().split('/').pop()))];
  const uno = (v) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).trim(); // "resumen: """ llega como lista vacía
  const lista = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).replace(/^\[\[|\]\]$/g, '').split('|')[0].trim()).filter(Boolean);
  const nota = {
    rel,
    bytes: st.size,
    mtime: st.mtimeMs,
    fm: { tipo: uno(fm.tipo), clase: uno(fm.clase), padre: lista(fm.padre)[0] || '', estado: uno(fm.estado), meta: uno(fm.meta), proyecto: lista(fm.proyecto)[0] || '', repo: uno(fm.repo), stack: uno(fm.stack), inicio: uno(fm.inicio), gasto_usd: uno(fm.gasto_usd), resumen: uno(fm.resumen), revisado: uno(fm.revisado), tags: uno(fm.tags), resultado: uno(fm.resultado), correccion: uno(fm.correccion), actualizado: uno(fm.actualizado), fuentes: lista(fm.fuentes) },
    privada: esPrivada(fm),
    enlaces,
    secciones: [],
  };
  if (nota.privada) return nota;
  const lineas = cuerpo.split(/\r?\n/);
  let actual = { titulo: base, nivel: 0, linea: lineasFm + 1, texto: [] };
  const pila = [];
  let codigo = false;
  let comentario = false;
  const cerrar = () => {
    const texto = actual.texto.join('\n').trim();
    // Las palabras ya procesadas quedan en la caché: una consulta no vuelve a tokenizar el vault
    if (texto.length >= 15 || actual.nivel > 0)
      nota.secciones.push({ titulo: actual.titulo, linea: actual.linea, texto: texto.slice(0, 8000), k: tokens(texto).join(' '), kt: tokens(`${base} ${actual.titulo} ${actual.titulo} ${uno(fm.resumen)}`).join(' ') });
  };
  lineas.forEach((l, i) => {
    if (/^\s*```/.test(l)) {
      codigo = !codigo;
      return;
    }
    if (codigo) return;
    if ((l.match(/%%/g) || []).length % 2 === 1) {
      comentario = !comentario;
      return;
    }
    if (comentario || /^%%.*%%$/.test(l.trim())) return;
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      cerrar();
      const nivel = h[1].length;
      while (pila.length && pila[pila.length - 1].nivel >= nivel) pila.pop();
      pila.push({ nivel, titulo: limpiarLinea(h[2]) });
      actual = { titulo: pila.map((p) => p.titulo).join(' > '), nivel, linea: lineasFm + i + 1, texto: [] };
      return;
    }
    const c = limpiarLinea(l);
    if (c && c !== '-' && c !== '---' && !/^-\s*\[ \]\s*$/.test(c)) actual.texto.push(c);
  });
  cerrar();
  nota.secciones = nota.secciones.filter((s) => s.texto.length >= 15);
  return nota;
}

// ───────────── Índice fresco con caché ─────────────
let MEMO = null; // en modo servidor el índice queda en memoria entre consultas
let STAMP = 0; // sube cada vez que cambia alguna nota
function cargarIndice() {
  let cache = MEMO || { v: 0, notas: {} };
  if (!MEMO) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    } catch (e) {
      /* primera vez */
    }
  }
  if (cache.v !== CACHE_VERSION) cache = { v: CACHE_VERSION, notas: {} };
  const rutas = listarNotas();
  const vivas = new Set(rutas);
  let cambios = 0;
  for (const rel of rutas) {
    let st;
    try {
      st = fs.statSync(path.join(RAIZ, rel));
    } catch (e) {
      continue;
    }
    const prev = cache.notas[rel];
    if (prev && prev.mtime === st.mtimeMs && prev.bytes === st.size) continue;
    try {
      cache.notas[rel] = analizar(rel);
      cambios++;
    } catch (e) {
      delete cache.notas[rel];
    }
  }
  for (const rel of Object.keys(cache.notas)) if (!vivas.has(rel)) (delete cache.notas[rel], cambios++);
  if (cambios) {
    try {
      fs.writeFileSync(CACHE, JSON.stringify(cache));
    } catch (e) {
      /* solo lectura: se trabaja en memoria */
    }
  }
  MEMO = cache;
  const notas = Object.values(cache.notas);
  const porNombre = new Map();
  for (const n of notas) {
    const k = sinAcentos(path.basename(n.rel, '.md'));
    if (!porNombre.has(k)) porNombre.set(k, n);
  }
  if (cambios) STAMP++;
  return { notas, porNombre, cambios, stamp: STAMP };
}
/** Parecido entre lo que escribió el agente y una nota: palabras del nombre, de sus carpetas y de su resumen. */
function parecidos(idx, ref, k = 5) {
  const q = new Set(tokens(String(ref || '').replace(/\.md$/i, '')));
  if (!q.size) return [];
  const out = [];
  for (const n of idx.notas) {
    if (n.privada || n.fm.tipo === 'wiki-sistema') continue;
    const nombre = new Set(tokens(path.basename(n.rel, '.md')));
    const resto = new Set(tokens(`${path.dirname(n.rel)} ${n.fm.resumen}`));
    let s = 0;
    for (const t of q) s += nombre.has(t) ? 1 : resto.has(t) ? 0.5 : 0;
    if (!s) continue;
    // cubrir la consulta pesa más que el largo del nombre; un nombre que es justo lo pedido gana
    const sc = s / q.size + (nombre.size ? [...nombre].filter((t) => q.has(t)).length / nombre.size : 0) * 0.5;
    out.push({ n, sc });
  }
  return out.sort((a, b) => b.sc - a.sc).slice(0, k);
}
function buscarNota(idx, ref) {
  const r = String(ref || '').trim().replace(/^\[\[|\]\]$/g, '').replace(/\\/g, '/');
  const exacta = idx.notas.find((n) => n.rel === r || n.rel === r + '.md');
  if (exacta) return exacta;
  const porNombre = idx.porNombre.get(sinAcentos(path.basename(r, '.md')));
  if (porNombre) return porNombre;
  // Nombre aproximado (un agente suele adivinar: "rutina de empuje" → Rutinas/Empuje.md). Solo si no hay duda.
  const p = parecidos(idx, r, 2);
  if (p.length && p[0].sc >= 1.1 && (p.length < 2 || p[0].sc - p[1].sc >= 0.3)) return Object.assign(Object.create(Object.getPrototypeOf(p[0].n)), p[0].n, { aprox: r });
  return null;
}
function noEncuentro(idx, ref) {
  const p = parecidos(idx, ref);
  return `No encuentro la nota "${ref}".${p.length ? ` Quizás quisiste decir:\n${p.map((x) => `- ${x.n.rel}${x.n.fm.resumen ? ` — ${x.n.fm.resumen}` : ''}`).join('\n')}` : ' Usa `buscar` para encontrarla.'}`;
}
const aviso = (n) => (n && n.aprox ? `(Interpreté "${n.aprox}" como ${n.rel}.)\n` : '');

// ───────────── Medición honesta ─────────────
function medir(herramienta, consulta, devueltos, completos, archivos) {
  try {
    fs.appendFileSync(MEDICION, JSON.stringify({ ts: new Date().toISOString(), herramienta, consulta: String(consulta || '').slice(0, 120), devueltos, completos, archivos }) + '\n');
  } catch (e) {
    /* sin permiso de escritura */
  }
}
function recortar(txt, max = MAX_SALIDA) {
  return txt.length <= max ? txt : txt.slice(0, max - 80).replace(/\s+\S*$/, '') + `\n… (recortado al presupuesto de ${max} caracteres; afina la consulta)`;
}
const tok = (chars) => Math.round(chars / 4); // estimación estándar: ~4 caracteres por token

// ───────────── Herramientas ─────────────
/** Índice invertido (palabra → secciones): una consulta solo mira las secciones que tienen sus palabras. */
let INV = null;
function invertido(idx) {
  if (INV && INV.idx === idx.notas.length && !idx.cambios && INV.stamp === idx.stamp) return INV;
  const docs = [];
  const post = new Map();
  for (const n of idx.notas) {
    if (n.privada || n.fm.tipo === 'wiki-sistema') continue; // índice, registro y revisión: se leen aparte si hace falta
    const nombre = path.basename(n.rel, '.md');
    const agregar = (s, toks) => {
      const id = docs.length;
      docs.push({ n, s, largo: toks.length });
      const tf = new Map();
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      for (const [t, f] of tf) (post.get(t) || post.set(t, []).get(t)).push(id, f);
    };
    // BM25 por sección, con más peso al título de la nota, al título de la sección y al resumen
    for (const s of n.secciones) {
      const t = s.k !== undefined ? (s.k ? s.k.split(' ') : []) : tokens(s.texto);
      const extra = s.kt !== undefined ? (s.kt ? s.kt.split(' ') : []) : tokens(`${nombre} ${s.titulo} ${s.titulo} ${n.fm.resumen || ''}`);
      agregar(s, t.concat(extra, extra));
    }
    // Una nota sin texto propio (solo paneles, o recién creada) igual se encuentra por su nombre y resumen
    if (!n.secciones.length) {
      const t = tokens(`${nombre} ${nombre} ${n.fm.resumen} ${n.fm.tags} ${n.fm.clase}`);
      if (t.length) agregar({ titulo: nombre, linea: 1, texto: n.fm.resumen || `(nota sin texto propio${n.fm.clase ? `, ${n.fm.clase}` : ''})` }, t);
    }
  }
  const prom = docs.reduce((a, d) => a + d.largo, 0) / (docs.length || 1);
  INV = { idx: idx.notas.length, stamp: idx.stamp, docs, post, prom };
  return INV;
}
// ───────────── Búsqueda por significado (opcional y con resguardos) ─────────────
// Reutiliza los vectores que Raíz ya calculó (vectores.json, uno por nota). Solo se embebe la consulta, en local,
// y SOLO si el modelo ya está cargado en Ollama o el equipo tiene 12 GB de RAM o más: en un equipo justo de memoria
// no se carga un modelo extra. Ante cualquier duda, la búsqueda sigue siendo por palabras.
function leerJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}
async function conTiempo(promesa, ms) {
  let t;
  return Promise.race([promesa, new Promise((_, rej) => (t = setTimeout(() => rej(new Error('tiempo')), ms)))]).finally(() => clearTimeout(t));
}
let VEC = null;
async function similitudes(consulta) {
  if (AUX !== __dirname || typeof fetch !== 'function') return null; // los vectores son de ESTE vault
  const vec = leerJson(path.join(__dirname, 'vectores.json'));
  const ajustes = leerJson(path.join(__dirname, 'data.json')) || {};
  const modelo = ajustes.embedModel || 'bge-m3';
  if (!vec || !vec.items || vec.model !== modelo) return null;
  const url = String(process.env.RAIZ_OLLAMA || ajustes.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  try {
    const ramGB = require('os').totalmem() / 1024 ** 3;
    if (ramGB < 12) {
      const ps = await conTiempo(fetch(`${url}/api/ps`).then((r) => r.json()), 1500);
      const cargado = (ps.models || []).some((m) => String(m.name || m.model).replace(/:latest$/, '') === modelo.replace(/:latest$/, ''));
      if (!cargado) return null;
    }
    const r = await conTiempo(fetch(`${url}/api/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelo, input: [consulta], keep_alive: '2m' }) }).then((x) => x.json()), 8000);
    const q = r.embeddings?.[0];
    if (!q) return null;
    let n = 0;
    for (const x of q) n += x * x;
    n = Math.sqrt(n) || 1;
    if (!VEC || VEC.raw !== vec) {
      const dec = new Map();
      for (const [rel, it] of Object.entries(vec.items)) {
        const buf = Buffer.from(it.v, 'base64');
        dec.set(rel.replace(/\\/g, '/'), new Float32Array(new Uint8Array(buf).buffer));
      }
      VEC = { raw: vec, dec };
    }
    const sim = new Map();
    for (const [rel, v] of VEC.dec) {
      if (v.length !== q.length) continue;
      let s = 0;
      for (let i = 0; i < q.length; i++) s += (q[i] / n) * v[i];
      sim.set(rel, s);
    }
    return sim;
  } catch (e) {
    return null;
  }
}
async function buscar(consulta, limite = 8, modo = 'auto') {
  const idx = cargarIndice();
  const q = [...new Set(tokens(consulta))];
  if (!q.length) return 'Escribe palabras con contenido (no solo artículos o preposiciones).';
  limite = Math.max(1, Math.min(Number(limite) || 8, 20));
  const { docs, post, prom } = invertido(idx);
  if (!docs.length) return 'El vault no tiene notas indexables.';
  const sim = modo === 'palabras' ? null : await similitudes(consulta);
  const N = docs.length;
  const k1 = 1.2;
  const b = 0.75;
  const acum = new Map(); // id de sección → { sc, palabras }
  for (const t of q) {
    const lista = post.get(t);
    if (!lista) continue;
    const df = lista.length / 2;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    for (let i = 0; i < lista.length; i += 2) {
      const d = docs[lista[i]];
      const f = lista[i + 1];
      const a = acum.get(lista[i]) || { sc: 0, palabras: 0 };
      a.sc += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.largo) / prom));
      a.palabras++;
      acum.set(lista[i], a);
    }
  }
  const puntuados = [];
  for (const [id, a] of acum) {
    const d = docs[id];
    let sc = a.sc * (1 + 0.15 * (a.palabras - 1)); // premia que estén varias palabras de la consulta
    if (d.n.fm.tipo === 'wiki') sc *= 1.1; // la wiki ya está destilada
    puntuados.push({ d, sc });
  }
  puntuados.sort((a, b2) => b2.sc - a.sc);
  // Fusión por rango recíproco: las palabras siguen mandando y el significado suma, sobre todo cuando la nota usa otras palabras
  if (sim && sim.size) {
    const rangoNota = new Map([...sim.entries()].sort((a, b2) => b2[1] - a[1]).map(([rel], i) => [rel, i]));
    const tope = Math.max(...sim.values());
    const K = 60;
    for (const [i, p] of puntuados.entries()) p.f = 1 / (K + i) + (rangoNota.has(p.d.n.rel) ? 1 / (K + rangoNota.get(p.d.n.rel)) : 0);
    // Notas que las palabras no encontraron pero el significado sí (sinónimos, otro idioma): entran con su primera sección
    const conPalabras = new Set(puntuados.map((p) => p.d.n.rel));
    const extra = [...sim.entries()].filter(([rel, s]) => !conPalabras.has(rel) && s >= 0.45 && s >= tope - 0.08).sort((a, b2) => b2[1] - a[1]).slice(0, 3);
    for (const [rel] of extra) {
      const d = docs.find((x) => x.n.rel === rel);
      if (d) puntuados.push({ d, sc: 0, f: 1 / (K + rangoNota.get(rel)) });
    }
    puntuados.sort((a, b2) => b2.f - a.f);
  }
  // Máximo 2 secciones por nota, para no gastar el presupuesto en una sola
  const porNota = new Map();
  const elegidos = [];
  for (const p of puntuados) {
    const c = porNota.get(p.d.n.rel) || 0;
    if (c >= 2) continue;
    porNota.set(p.d.n.rel, c + 1);
    elegidos.push(p);
    if (elegidos.length >= limite) break;
  }
  if (!elegidos.length) return `Sin resultados para "${consulta}". Prueba con sinónimos o menos palabras.${sim ? '' : ' (Búsqueda solo por palabras: la de significado no está disponible ahora.)'}`;
  const fragmento = (texto) => {
    const plano = texto.replace(/\s+/g, ' ');
    const low = sinAcentos(plano);
    let pos = -1;
    for (const t of q) {
      const i = low.indexOf(t);
      if (i > -1 && (pos < 0 || i < pos)) pos = i;
    }
    const ini = Math.max(0, pos - 90);
    return (ini > 0 ? '…' : '') + plano.slice(ini, ini + 300).trim() + (plano.length > ini + 300 ? '…' : '');
  };
  const L = [`${elegidos.length} sección(es) para "${consulta}" (de ${idx.notas.length} notas, por ${sim ? 'palabras y significado' : 'palabras'}). Lee una sección completa con \`seccion\` solo si la necesitas.`, ''];
  for (const { d } of elegidos) {
    const res = d.n.fm.resumen ? ` — ${d.n.fm.resumen}` : '';
    L.push(`■ ${d.n.rel}:${d.s.linea} · ${d.s.titulo}${res}`);
    L.push(`  ${fragmento(d.s.texto)}`);
  }
  const salida = recortar(L.join('\n'));
  const tocados = [...porNota.keys()];
  medir('buscar', consulta, salida.length, tocados.reduce((a, r) => a + (idx.notas.find((n) => n.rel === r)?.bytes || 0), 0), tocados.length);
  return salida;
}
function seccion(ref, titulo) {
  const idx = cargarIndice();
  const n = buscarNota(idx, ref);
  if (!n) return noEncuentro(idx, ref);
  if (n.privada) return `"${n.rel}" es privada: no sale de la bóveda.`;
  if (!titulo) return esqueleto(ref);
  const t = sinAcentos(titulo);
  const s = n.secciones.find((x) => sinAcentos(x.titulo) === t) || n.secciones.find((x) => sinAcentos(x.titulo).endsWith(t)) || n.secciones.find((x) => sinAcentos(x.titulo).includes(t));
  if (!s) return `${aviso(n)}"${n.rel}" no tiene una sección "${titulo}". ${n.secciones.length ? `Sus secciones:\n${n.secciones.map((x) => `- ${x.titulo} (línea ${x.linea})`).join('\n')}` : 'No tiene texto propio.'}\nPara ver qué notas contiene o enlaza, usa \`vecinos\` o \`explorar\`.`;
  const salida = recortar(`${aviso(n)}${n.rel}:${s.linea} · ${s.titulo}\n\n${s.texto}`, MAX_SECCION);
  medir('seccion', `${n.rel} > ${titulo}`, salida.length, n.bytes, 1);
  return salida;
}
function esqueleto(ref) {
  const idx = cargarIndice();
  const n = buscarNota(idx, ref);
  if (!n) return noEncuentro(idx, ref);
  if (n.privada) return `"${n.rel}" es privada: no sale de la bóveda.`;
  const fm = Object.entries(n.fm)
    .filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
  const L = [`${aviso(n)}${n.rel} (${n.bytes} bytes, ~${tok(n.bytes)} tokens si la abrieras entera)`, ...fm.map((x) => `  ${x}`), 'Secciones:', ...n.secciones.map((s) => `- ${s.titulo} (línea ${s.linea}, ${s.texto.length} caracteres)`)];
  // Las páginas que cuelgan de esta (padre: [[esta]]) se ven en Obsidian con un bloque base, que es código y no se indexa
  // Se muestran dos niveles, como un árbol de carpetas: área → colección → asignaturas
  const porPadre = new Map();
  for (const x of idx.notas) {
    if (!x.fm.padre) continue;
    const p = sinAcentos(x.fm.padre.split('/').pop());
    if (!porPadre.has(p)) porPadre.set(p, []);
    porPadre.get(p).push(x);
  }
  const base = (x) => path.basename(x.rel, '.md');
  const hijas = (porPadre.get(sinAcentos(base(n))) || []).filter((x) => x.rel !== n.rel);
  if (hijas.length) {
    L.push(`Páginas dentro (${hijas.length}):`);
    for (const h of hijas.slice(0, 30)) {
      const nietas = (porPadre.get(sinAcentos(base(h))) || []).filter((x) => x.rel !== h.rel && x.rel !== n.rel);
      L.push(`- ${base(h)}${h.fm.clase ? ` (${h.fm.clase})` : ''}${nietas.length ? `, contiene: ${nietas.slice(0, 12).map(base).join(', ')}${nietas.length > 12 ? `, … y ${nietas.length - 12} más` : ''}` : ''}`);
    }
    if (hijas.length > 30) L.push(`… y ${hijas.length - 30} más.`);
  }
  if (n.enlaces.length) L.push(`Enlaza a ${n.enlaces.length} nota(s); usa \`vecinos\` para verlas con su resumen.`);
  const salida = recortar(L.join('\n'));
  medir('esqueleto', n.rel, salida.length, n.bytes, 1);
  return salida;
}
function vecinos(ref, limite = 40) {
  const idx = cargarIndice();
  const n = buscarNota(idx, ref);
  if (!n) return noEncuentro(idx, ref);
  if (n.privada) return `"${n.rel}" es privada: no sale de la bóveda.`;
  const nombre = sinAcentos(path.basename(n.rel, '.md'));
  const linea = (x, alt) => (x ? (x.privada ? `- ${path.basename(x.rel, '.md')} (privada)` : `- ${x.rel}${x.fm.resumen ? ` — ${x.fm.resumen}` : x.fm.clase ? ` (${x.fm.clase})` : ''}`) : `- ${alt} (no existe todavía)`);
  const salen = n.enlaces.slice(0, limite).map((e) => linea(idx.porNombre.get(sinAcentos(e)), e));
  const entran = idx.notas.filter((x) => x.rel !== n.rel && x.enlaces.some((e) => sinAcentos(e) === nombre));
  const L = [`${aviso(n)}Vecinos de ${n.rel}`, `Enlaza a (${n.enlaces.length}):`, ...salen, `La enlazan (${entran.length}):`, ...entran.slice(0, limite).map((x) => linea(x))];
  if (entran.length > limite) L.push(`… y ${entran.length - limite} más.`);
  const salida = recortar(L.join('\n'));
  const vec = [...entran, ...n.enlaces.map((e) => idx.porNombre.get(sinAcentos(e))).filter(Boolean)];
  medir('vecinos', n.rel, salida.length, vec.reduce((a, x) => a + x.bytes, 0), vec.length);
  return salida;
}
// ───────────── Recorrer el grafo con presupuesto (sin abrir notas) ─────────────
let GRAFO = null;
function grafo(idx) {
  if (GRAFO && GRAFO.stamp === idx.stamp && GRAFO.n === idx.notas.length) return GRAFO.ady;
  const ady = new Map(idx.notas.map((n) => [n.rel, new Set()]));
  for (const n of idx.notas) {
    for (const e of n.enlaces) {
      const t = idx.porNombre.get(sinAcentos(e));
      if (!t || t === n) continue;
      ady.get(n.rel).add(t.rel);
      ady.get(t.rel).add(n.rel);
    }
  }
  GRAFO = { stamp: idx.stamp, n: idx.notas.length, ady };
  return ady;
}
/** Hasta 3 saltos desde una nota, cada una con su resumen; lo más conectado primero, y corta al presupuesto. */
function explorar(ref, profundidad = 2) {
  const idx = cargarIndice();
  const n = buscarNota(idx, ref);
  if (!n) return noEncuentro(idx, ref);
  if (n.privada) return `"${n.rel}" es privada: no sale de la bóveda.`;
  const ady = grafo(idx);
  const prof = Math.max(1, Math.min(Number(profundidad) || 2, 3));
  const porRel = new Map(idx.notas.map((x) => [x.rel, x]));
  const visto = new Map([[n.rel, 0]]);
  let frente = [n.rel];
  // Las notas muy conectadas (guías, paneles, índices) enlazan a casi todo: se muestran, pero no se recorre a través de
  // ellas, para que el presupuesto se gaste en lo cercano al tema y no en todo el vault
  const grados = [...ady.values()].map((s) => s.size).sort((a, b2) => a - b2);
  const umbral = Math.max(8, grados[Math.floor(grados.length * 0.95)] || 8);
  const nucleo = (r) => r !== n.rel && (ady.get(r)?.size || 0) > umbral;
  for (let d = 1; d <= prof; d++) {
    const sig = [];
    for (const r of frente) {
      if (nucleo(r)) continue;
      for (const v of ady.get(r) || []) if (!visto.has(v)) (visto.set(v, d), sig.push(v));
    }
    frente = sig;
  }
  const L = [`${aviso(n)}Alrededor de ${n.rel} (hasta ${prof} salto${prof > 1 ? 's' : ''}):`];
  for (let d = 1; d <= prof; d++) {
    const anillo = [...visto.entries()].filter(([, x]) => x === d).map(([r]) => porRel.get(r)).filter((x) => x && !x.privada);
    if (!anillo.length) continue;
    anillo.sort((a, b2) => (ady.get(b2.rel)?.size || 0) - (ady.get(a.rel)?.size || 0));
    L.push(`${d} salto${d > 1 ? 's' : ''} (${anillo.length}):`);
    for (const x of anillo) L.push(`- ${x.rel}${x.fm.resumen ? ` — ${x.fm.resumen}` : ''} · ${ady.get(x.rel)?.size || 0} enlaces${nucleo(x.rel) ? ' (nota central: no se recorre a través de ella)' : ''}`);
  }
  const salida = recortar(L.join('\n'));
  const tocadas = [...visto.keys()].map((r) => porRel.get(r)).filter(Boolean);
  medir('explorar', `${n.rel} ×${prof}`, salida.length, tocadas.reduce((a, x) => a + x.bytes, 0), tocadas.length);
  return salida;
}
/** El camino más corto entre dos notas: cómo se conectan dos ideas. */
function camino(a, b) {
  const idx = cargarIndice();
  const na = buscarNota(idx, a);
  const nb = buscarNota(idx, b);
  if (!na || !nb) return `No encuentro ${!na ? `"${a}"` : `"${b}"`}.`;
  if (na.privada || nb.privada) return 'Una de las notas es privada: no sale de la bóveda.';
  const ady = grafo(idx);
  const previo = new Map([[na.rel, null]]);
  const cola = [na.rel];
  while (cola.length && !previo.has(nb.rel)) {
    const r = cola.shift();
    for (const v of ady.get(r) || []) if (!previo.has(v)) (previo.set(v, r), cola.push(v));
  }
  if (!previo.has(nb.rel)) return `No hay un camino de enlaces entre "${na.rel}" y "${nb.rel}".`;
  const ruta = [];
  for (let r = nb.rel; r; r = previo.get(r)) ruta.unshift(r);
  const porRel = new Map(idx.notas.map((x) => [x.rel, x]));
  const salida = recortar([`Camino de ${ruta.length - 1} salto(s):`, ...ruta.map((r, i) => `${i ? '→ ' : '  '}${r}${porRel.get(r)?.fm.resumen ? ` — ${porRel.get(r).fm.resumen}` : ''}`)].join('\n'));
  medir('camino', `${na.rel} → ${nb.rel}`, salida.length, ruta.reduce((s, r) => s + (porRel.get(r)?.bytes || 0), 0), ruta.length);
  return salida;
}

// ───────────── Escribir por secciones (solo en 13 Wiki y 14 Proyectos, con respaldo) ─────────────
// Reescribir una página entera para cambiar una línea cuesta muchos tokens de salida. Estas herramientas cambian solo
// lo necesario y protegen lo tuyo: nada fuera de 13 Wiki, nada en Fuentes, y lo que revisaste (revisado: true) solo crece.
const WIKI = '13 Wiki';
const CARPETAS = { resumen: 'Resúmenes', entidad: 'Entidades', concepto: 'Conceptos', tema: 'Temas', respuesta: 'Respuestas' };
const DE_RAIZ = new Set(['Índice.md', 'Registro.md', 'Revisión.md', 'Wiki.md', 'Lecciones.md'].map((n) => `${WIKI}/${n}`));
const hoy = () => new Date().toISOString().slice(0, 10);
function escribible(rel) {
  const abs = path.resolve(RAIZ, rel);
  const r = path.relative(RAIZ, abs).replace(/\\/g, '/');
  if (!(r.startsWith(WIKI + '/') || r.startsWith(PROYECTOS + '/')) || r.includes('..')) throw new Error('Solo escribo dentro de 13 Wiki y 14 Proyectos: el resto del vault es de la persona.');
  if (r === `${PROYECTOS}/Proyectos.md`) throw new Error('Proyectos.md es el panel: escribe en la nota de cada proyecto.');
  if (/^13 Wiki\/(Fuentes|Datos|Índices)\//.test(r)) throw new Error('Fuentes, Datos e Índices no se editan: las fuentes son de solo lectura y lo demás lo genera Raíz.');
  if (DE_RAIZ.has(r)) throw new Error(r.endsWith('Registro.md') ? 'El Registro solo crece al final: usa `registrar`.' : 'Ese archivo lo genera Raíz. Para el registro usa `registrar`.');
  if (!r.toLowerCase().endsWith('.md')) throw new Error('Solo notas .md.');
  return { abs, rel: r };
}
function respaldar(abs, rel) {
  const dir = path.join(AUX, '.boveda-respaldos');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(abs, path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')} ${path.basename(rel)}`));
    const todos = fs.readdirSync(dir).sort();
    for (const f of todos.slice(0, Math.max(0, todos.length - 100))) fs.unlinkSync(path.join(dir, f)); // se guardan los últimos 100
  } catch (e) {
    /* sin respaldo no se escribe a ciegas: se avisa abajo */
    return false;
  }
  return true;
}
function guardar(abs, texto, eol = '\n') {
  const tmp = `${abs}.boveda-tmp`;
  fs.writeFileSync(tmp, eol === '\r\n' ? texto.replace(/\r?\n/g, '\r\n') : texto, 'utf8');
  fs.renameSync(tmp, abs); // atómico: Obsidian nunca ve un archivo a medias
}
function conActualizado(txt) {
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return txt;
  const fm = /^actualizado:.*$/m.test(m[1]) ? m[1].replace(/^actualizado:.*$/m, `actualizado: ${hoy()}`) : `${m[1]}\nactualizado: ${hoy()}`;
  return txt.replace(m[0], `---\n${fm}\n---`);
}
function ponerPropiedad(txt, clave, valor) {
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const linea = `${clave}: ${JSON.stringify(String(valor))}`;
  if (!m) return `---\n${linea}\n---\n${txt}`;
  const re = new RegExp(`^${clave}:.*$`, 'm');
  return txt.replace(m[0], `---\n${re.test(m[1]) ? m[1].replace(re, linea) : `${m[1]}\n${linea}`}\n---`);
}
/** Ubica una sección en el texto crudo: línea del título y dónde termina su cuerpo. */
function ubicarSeccion(lineas, titulo) {
  const t = sinAcentos(titulo).replace(/^#+\s*/, '').trim();
  let codigo = false;
  const titulos = [];
  lineas.forEach((l, i) => {
    if (/^\s*```/.test(l)) codigo = !codigo;
    const h = !codigo && l.match(/^(#{1,6})\s+(.*)$/);
    if (h) titulos.push({ i, nivel: h[1].length, texto: sinAcentos(limpiarLinea(h[2])) });
  });
  const ultimo = t.split('>').pop().trim();
  const h = titulos.find((x) => x.texto === ultimo) || titulos.find((x) => x.texto.includes(ultimo));
  if (!h) return null;
  const fin = titulos.find((x) => x.i > h.i && x.nivel <= h.nivel);
  return { inicio: h.i, fin: fin ? fin.i : lineas.length };
}
function notaEscribible(ref) {
  const idx = cargarIndice();
  const n = buscarNota(idx, ref);
  if (!n) throw new Error(`${noEncuentro(idx, ref)}\nPara una página nueva usa \`crear_pagina\`.`);
  // Para escribir no se adivina: un nombre aproximado podría caer en otra página
  if (n.aprox) throw new Error(`Para escribir necesito el nombre exacto. ¿Es ${n.rel}? Si es esa, vuelve a llamar con "${path.basename(n.rel, '.md')}".`);
  const { abs, rel } = escribible(n.rel);
  const crudo = fs.readFileSync(abs, 'utf8');
  // Se trabaja en LF y se guarda con los finales de línea que tenía el archivo
  return { n, abs, rel, txt: crudo.replace(/\r\n/g, '\n'), eol: /\r\n/.test(crudo) ? '\r\n' : '\n' };
}
function reemplazarSeccion(ref, titulo, texto) {
  const { n, abs, rel, txt, eol } = notaEscribible(ref);
  if (/^true$/i.test(n.fm.revisado)) return `"${rel}" la revisó la persona (revisado: true): no reemplazo su contenido. Usa \`agregar_a_seccion\` para sumar, por ejemplo bajo "Contradicciones".`;
  const lineas = txt.split(/\r?\n/);
  const s = ubicarSeccion(lineas, titulo);
  if (!s) return `"${rel}" no tiene la sección "${titulo}". Usa \`agregar_a_seccion\` para crearla.`;
  if (!respaldar(abs, rel)) return 'No pude guardar un respaldo, así que no modifiqué nada.';
  const nuevo = [...lineas.slice(0, s.inicio + 1), String(texto).replace(/\s+$/, ''), '', ...lineas.slice(s.fin)].join('\n');
  guardar(abs, conActualizado(nuevo), eol);
  medir('reemplazar_seccion', `${rel} > ${titulo}`, String(texto).length, txt.length, 1);
  return `Listo: reemplacé "${titulo}" en ${rel}. (Respaldo guardado.)`;
}
function agregarASeccion(ref, titulo, texto) {
  const { abs, rel, txt, eol } = notaEscribible(ref);
  const lineas = txt.split(/\r?\n/);
  const s = ubicarSeccion(lineas, titulo);
  if (!respaldar(abs, rel)) return 'No pude guardar un respaldo, así que no modifiqué nada.';
  let nuevo;
  if (s) {
    let fin = s.fin;
    while (fin - 1 > s.inicio && !lineas[fin - 1].trim()) fin--;
    nuevo = [...lineas.slice(0, fin), String(texto).replace(/\s+$/, ''), ...(s.fin < lineas.length ? [''] : []), ...lineas.slice(s.fin)].join('\n');
  } else nuevo = `${txt.replace(/\s+$/, '')}\n\n## ${titulo.split('>').pop().trim()}\n${String(texto).replace(/\s+$/, '')}\n`;
  guardar(abs, conActualizado(nuevo), eol);
  medir('agregar_a_seccion', `${rel} > ${titulo}`, String(texto).length, txt.length, 1);
  return `Listo: agregué a "${titulo}" en ${rel}${s ? '' : ' (la sección no existía y la creé al final)'}.`;
}
function crearPagina({ clase, titulo, resumen, fuentes, cuerpo }) {
  const carpeta = CARPETAS[String(clase || '').toLowerCase()];
  if (!carpeta) return `Clase desconocida. Usa una de: ${Object.keys(CARPETAS).join(', ')}.`;
  const nombre = String(titulo || '').replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!nombre) return 'Falta el título.';
  const idx = cargarIndice();
  let existe = buscarNota(idx, nombre);
  if (existe && existe.aprox) existe = null; // solo cuenta el nombre exacto: "Qué es un árbol" no es "Árbol binario"
  if (existe) return `Ya existe "${existe.rel}". Agrega lo nuevo con \`agregar_a_seccion\` en vez de crear otra página.`;
  const { abs, rel } = escribible(`${WIKI}/${carpeta}/${nombre}.md`);
  const fs2 = (Array.isArray(fuentes) ? fuentes : fuentes ? String(fuentes).split(',') : []).map((f) => String(f).replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean);
  const fm = ['---', 'tipo: wiki', `clase: ${String(clase).toLowerCase()}`, `resumen: ${JSON.stringify(String(resumen || '').replace(/\s+/g, ' ').trim())}`, 'fuentes:', ...fs2.map((f) => `  - ${JSON.stringify(`[[${f}]]`)}`), `actualizado: ${hoy()}`, 'revisado: false', ...(String(clase).toLowerCase() === 'respuesta' ? ['resultado: ""'] : []), 'tags:', '  - wiki', '---'];
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  // El título ya lo pone la página: si el agente lo repitió al inicio del cuerpo, no se duplica
  const texto = String(cuerpo || '').replace(/\r\n/g, '\n').replace(/^\s*#\s+(.+)\n+/, (m, t) => (sinAcentos(t.trim()) === sinAcentos(nombre) ? '' : m)).replace(/\s+$/, '');
  guardar(abs, `${fm.join('\n')}\n# ${nombre}\n\n${texto}\n`);
  medir('crear_pagina', rel, String(cuerpo || '').length, String(cuerpo || '').length, 1);
  // No bloquea (una página puede salir de lo que sabe el agente), pero avisa: cada dato debería llevar su fuente
  const sinFuente = fs2.filter((f) => { const m = buscarNota(idx, f); return !m || m.aprox; });
  const ojo = !fs2.length
    ? ' Ojo: no citaste fuentes. Si los datos salen del vault, agrega en la página las notas que leíste (cada dato lleva su fuente).'
    : sinFuente.length
      ? ` Ojo: estas fuentes no existen en el vault: ${sinFuente.join(', ')}. Busca el nombre exacto con \`buscar\`.`
      : '';
  return `Creada ${rel}.${ojo} Recuerda anotarla con \`registrar\`.`;
}
function registrar({ tipo, titulo, paginas }) {
  const t = sinAcentos(String(tipo || '')).replace('revision', 'revisión');
  if (!['ingesta', 'consulta', 'revisión', 'edicion', 'edición'].includes(t)) return 'Tipo: ingesta, consulta, revisión o edición.';
  const abs = path.join(RAIZ, WIKI, 'Registro.md');
  // Cada página se anota por su nombre real; las que no existen no se inventan en el Registro
  const idx = cargarIndice();
  const pedidas = (Array.isArray(paginas) ? paginas : paginas ? String(paginas).split(',') : []).map((p) => String(p).replace(/^\[\[|\]\]$/g, '').replace(/\.md$/i, '').trim()).filter(Boolean);
  const faltan = [];
  const lista = [];
  for (const p of pedidas) {
    const exacta = (x) => { const m = buscarNota(idx, x); return m && !m.aprox ? m : null; };
    const n = exacta(p) || exacta(p.split(/[\/]/).pop());
    if (n) lista.push(`[[${path.basename(n.rel, '.md')}]]`);
    else faltan.push(p);
  }
  const entrada = `\n## [${hoy()}] ${t.replace('edicion', 'edición')} | ${String(titulo || '').replace(/\n/g, ' ').slice(0, 120)}\n${lista.length ? `Páginas: ${lista.join(', ')}\n` : ''}`;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.appendFileSync(abs, (fs.existsSync(abs) ? '' : '# Registro de la wiki\n') + entrada);
  return `Anotado en el Registro.${faltan.length ? ` No anoté ${faltan.map((p) => `"${p}"`).join(', ')}: no existe${faltan.length > 1 ? 'n' : ''} en el vault (usa el nombre de la página, sin carpeta).` : ''}`;
}
/** Cómo resultó una respuesta guardada: alimenta las lecciones para que no se repitan búsquedas inútiles. */
function marcarResultado({ nota, resultado, correccion }) {
  const r = sinAcentos(String(resultado || '')).replace(/\s+/g, '_');
  if (!['util', 'sin_salida', 'corregida'].includes(r)) return 'Resultado: util, sin_salida o corregida.';
  const { n, abs, rel, txt, eol } = notaEscribible(nota);
  if (n.fm.clase !== 'respuesta') return 'Solo las páginas de Respuestas llevan resultado.';
  if (!respaldar(abs, rel)) return 'No pude guardar un respaldo, así que no modifiqué nada.';
  let nuevo = ponerPropiedad(txt, 'resultado', r);
  if (correccion) nuevo = ponerPropiedad(nuevo, 'correccion', String(correccion).slice(0, 300));
  guardar(abs, conActualizado(nuevo), eol);
  return `Marcada como ${r}.`;
}

// ───────────── Lecciones: memoria de trabajo entre sesiones (sin IA, determinista) ─────────────
/** Lo que se aprendió de las respuestas guardadas: qué fuentes sirven, qué es callejón sin salida, qué se corrigió. */
function lecciones() {
  const idx = cargarIndice();
  const resp = idx.notas.filter((n) => n.fm.clase === 'respuesta' && n.fm.resultado && !n.privada);
  if (!resp.length) return 'Todavía no hay lecciones. Cuando una respuesta guardada sirva, no sirva o haya que corregirla, márcala con `marcar_resultado` (o en su propiedad "resultado").';
  const ahora = Date.now();
  const peso = { util: 1, sin_salida: -1, corregida: -1 };
  const fuentes = new Map(); // fuente → { puntos, positivas, negativas }
  for (const r of resp) {
    const dias = (ahora - (Date.parse(r.fm.actualizado) || r.mtime)) / 86400000;
    const w = (peso[r.fm.resultado] || 0) * Math.pow(0.5, dias / 60); // vida media de 60 días: lo reciente pesa más
    for (const f of r.fm.fuentes) {
      const e = fuentes.get(f) || { puntos: 0, pos: 0, neg: 0 };
      e.puntos += w;
      w > 0 ? e.pos++ : e.neg++;
      fuentes.set(f, e);
    }
  }
  const orden = [...fuentes.entries()].sort((a, b2) => b2[1].puntos - a[1].puntos);
  const preferidas = orden.filter(([, e]) => e.pos >= 2 && e.puntos > 0);
  const discutidas = orden.filter(([, e]) => e.pos && e.neg);
  const sinSalida = resp.filter((r) => r.fm.resultado === 'sin_salida');
  const corregidas = resp.filter((r) => r.fm.resultado === 'corregida');
  const L = ['Lecciones de sesiones anteriores (léelas antes de investigar):'];
  if (preferidas.length) L.push('Fuentes que ya sirvieron varias veces:', ...preferidas.slice(0, 10).map(([f, e]) => `- [[${f}]] (${e.pos} respuestas útiles)`));
  if (discutidas.length) L.push('Fuentes discutidas (sirvieron y fallaron; manda lo más reciente):', ...discutidas.slice(0, 6).map(([f]) => `- [[${f}]]`));
  if (sinSalida.length) L.push('Callejones sin salida (no repitas estas búsquedas):', ...sinSalida.slice(-8).map((r) => `- ${path.basename(r.rel, '.md')}`));
  if (corregidas.length) L.push('Correcciones de la persona (tienen prioridad):', ...corregidas.slice(-8).map((r) => `- ${path.basename(r.rel, '.md')}: ${r.fm.correccion || 'ver la página'}`));
  const salida = recortar(L.join('\n'), 2500);
  medir('lecciones', '', salida.length, resp.reduce((a, r) => a + r.bytes, 0), resp.length);
  return salida;
}

function datos({ desde, hasta, columnas } = {}) {
  const csv = path.join(RAIZ, '13 Wiki', 'Datos', 'diario.csv');
  let txt;
  try {
    txt = fs.readFileSync(csv, 'utf8');
  } catch (e) {
    return 'No existe 13 Wiki/Datos/diario.csv todavía. Abre Obsidian (Raíz lo genera solo) o usa el comando "Wiki: actualizar índice y datos para agentes".';
  }
  const filas = txt.trim().split(/\r?\n/);
  const cab = filas[0].split(',');
  const quiero = columnas ? ['fecha'].concat(String(columnas).split(',').map((c) => c.trim()).filter((c) => c && c !== 'fecha')) : cab;
  const idxs = quiero.map((c) => cab.indexOf(c)).filter((i) => i > -1);
  const sel = filas.slice(1).filter((f) => {
    const fecha = f.slice(0, 10);
    return (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
  });
  const parse = (f) => f.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, ''));
  const util = sel.map(parse).filter((c) => idxs.slice(1).some((i) => c[i] !== '' && c[i] !== undefined));
  const out = [idxs.map((i) => cab[i]).join(','), ...util.map((c) => idxs.map((i) => c[i] ?? '').join(','))];
  const salida = recortar(`${util.length} día(s) con datos (de ${sel.length} en el rango).\n${out.join('\n')}`);
  medir('datos', `${desde || ''}..${hasta || ''} ${columnas || ''}`, salida.length, Buffer.byteLength(txt), 1);
  return salida;
}
function medicion() {
  let filas = [];
  try {
    filas = fs.readFileSync(MEDICION, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch (e) {
    return 'Todavía no hay mediciones: se anotan solas cada vez que un agente usa la herramienta.';
  }
  const por = new Map();
  for (const f of filas) {
    const p = por.get(f.herramienta) || { n: 0, dev: 0, comp: 0 };
    p.n++;
    p.dev += f.devueltos;
    p.comp += f.completos;
    por.set(f.herramienta, p);
  }
  const ESCR = new Set(['crear_pagina', 'agregar_a_seccion', 'reemplazar_seccion']);
  const lec = filas.filter((f) => !ESCR.has(f.herramienta));
  const esc = filas.filter((f) => ESCR.has(f.herramienta) && f.herramienta !== 'crear_pagina');
  const dev = lec.reduce((a, f) => a + f.devueltos, 0);
  const comp = lec.reduce((a, f) => a + f.completos, 0);
  const escDev = esc.reduce((a, f) => a + f.devueltos, 0);
  const escComp = esc.reduce((a, f) => a + f.completos, 0);
  const L = [
    `${filas.length} consulta(s) medidas desde ${filas[0].ts.slice(0, 10)}.`,
    `Lectura: devuelto ~${tok(dev)} tokens. Abrir esas mismas notas completas: ~${tok(comp)} tokens.${comp ? ` Ahorro medido: ${Math.max(0, Math.round((1 - dev / comp) * 100))} %.` : ''}`,
    ...(esc.length ? [`Escritura: ~${tok(escDev)} tokens escritos por secciones, frente a ~${tok(escComp)} reescribiendo esas páginas enteras (${Math.max(0, Math.round((1 - escDev / (escComp || 1)) * 100))} % menos).`] : []),
    'La comparación de lectura es contra abrir solo las notas que aparecieron en cada respuesta, no contra el vault entero: es la cifra más conservadora.',
    '',
    ...[...por.entries()].map(([h, p]) => `- ${h}: ${p.n} llamadas · ~${tok(p.dev)} tokens devueltos vs ~${tok(p.comp)} abriendo las notas`),
  ];
  return L.join('\n');
}
function estado() {
  const t0 = Date.now();
  const idx = cargarIndice();
  const privadas = idx.notas.filter((n) => n.privada).length;
  const bytes = idx.notas.reduce((a, n) => a + n.bytes, 0);
  return `Bóveda en ${RAIZ}\n${idx.notas.length} notas (${privadas} privadas) · ${idx.notas.reduce((a, n) => a + n.secciones.length, 0)} secciones · ~${tok(bytes)} tokens si se leyera todo.\nÍndice al día en ${Date.now() - t0} ms (${idx.cambios} nota(s) reprocesadas).`;
}

// ───────────── Proyectos y orquestación: memoria persistente para agentes ─────────────
// El vault guarda qué pasó en cada ejecución, lo que vale la pena recordar y el estado de cada proyecto, y cada agente
// recibe solo el contexto que le sirve, con un tope de tokens.
//  - 14 Proyectos/<Proyecto>.md: contexto, estado actual, pendientes y decisiones de un proyecto (tuyo y de tus agentes).
//  - 15 Agentes/Registros/<id>.jsonl: una línea por evento y solo se agrega, así que varios agentes pueden anotar a la vez.
//  - 15 Agentes/Ejecuciones/<id>.md: el resumen de cada ejecución. Lo lees tú en Obsidian y lo encuentra `buscar`.
//  - 15 Agentes/Memoria/memoria.jsonl: recuerdos breves y reutilizables, de un proyecto o generales.
//    Nada se reescribe: se refuerza o se marca como olvidado.
const PROYECTOS = '14 Proyectos';
const AGENTES = '15 Agentes';
const TIPOS_EVENTO = ['tool_call', 'decision', 'error', 'artefacto', 'nota', 'agente'];
const TIPOS_MEMORIA = ['hecho', 'decision', 'error', 'preferencia', 'procedimiento'];
const ESTADOS_FIN = ['hecha', 'fallida', 'cancelada', 'detenida'];
const rutaAg = (...p) => path.join(RAIZ, AGENTES, ...p);
const corto = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const usd = (x) => `$${Number((Number(x) || 0).toFixed(4))}`;
const numero = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : undefined);
const listaDe = (v) => (Array.isArray(v) ? v : v ? String(v).split(',') : []).map((x) => corto(x, 60)).filter(Boolean);
const dos = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
function leerJsonl(abs) {
  let txt = '';
  try {
    txt = fs.readFileSync(abs, 'utf8');
  } catch (e) {
    return [];
  }
  const out = [];
  for (const l of txt.split('\n')) {
    if (!l.trim()) continue;
    try {
      out.push(JSON.parse(l));
    } catch (e) {
      /* una línea a medias o de otro programa no tumba la lectura */
    }
  }
  return out;
}
function anexar(abs, obj) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.appendFileSync(abs, JSON.stringify(obj) + '\n'); // una sola escritura por línea: varios procesos pueden anotar a la vez
}
function idEjecucion(id) {
  const s = String(id || '').trim();
  if (!/^\d{8}-\d{6}-[a-z0-9-]{0,48}$/.test(s)) throw new Error(`"${s}" no es un id de ejecución. Se ven así: 20261027-235100-producto-que-la-gente-paga (usa ejecucion lista).`);
  return s;
}
/** "07:40" es la próxima vez que el reloj marque esa hora; también sirve una fecha y hora completa. */
function plazoDe(plazo, desde) {
  if (!plazo) return null;
  const m = String(plazo).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const d = new Date(desde);
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (d <= desde) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  const t = Date.parse(plazo);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// Totales de una ejecución. En el servidor MCP se leen solo los bytes nuevos: anotar un evento no relee todo el registro.
const nuevoResumen = () => ({ inicio: null, fin: null, n: 0, gasto: 0, tin: 0, tout: 0, llamadas: 0, errores: 0, agentes: new Map() });
function acumular(r, e) {
  if (e.tipo === 'inicio') return void (r.inicio = e);
  if (e.tipo === 'fin') return void (r.fin = e);
  r.n++;
  r.gasto += Number(e.costo_usd) || 0;
  r.tin += Number(e.tokens_entrada) || 0;
  r.tout += Number(e.tokens_salida) || 0;
  if (e.tipo === 'tool_call') r.llamadas++;
  if (e.tipo === 'error') r.errores++;
  const a = r.agentes.get(e.agente) || { n: 0, gasto: 0, tin: 0, tout: 0, errores: 0, ultimo: null };
  a.n++;
  a.gasto += Number(e.costo_usd) || 0;
  a.tin += Number(e.tokens_entrada) || 0;
  a.tout += Number(e.tokens_salida) || 0;
  if (e.tipo === 'error') a.errores++;
  a.ultimo = e;
  r.agentes.set(e.agente, a);
}
const EJECUCIONES = new Map();
function estadoEjecucion(id) {
  const abs = rutaAg('Registros', `${id}.jsonl`);
  let st;
  try {
    st = fs.statSync(abs);
  } catch (e) {
    throw new Error(`No existe la ejecución ${id}. Créala con ejecucion iniciar o busca su id con ejecucion lista.`);
  }
  let s = EJECUCIONES.get(id);
  if (!s || st.size < s.bytes) s = { bytes: 0, r: nuevoResumen(), recientes: [] };
  if (st.size > s.bytes) {
    const fd = fs.openSync(abs, 'r');
    const buf = Buffer.alloc(st.size - s.bytes);
    fs.readSync(fd, buf, 0, buf.length, s.bytes);
    fs.closeSync(fd);
    const txt = buf.toString('utf8');
    const fin = txt.lastIndexOf('\n'); // una línea que otro agente está escribiendo se lee en la próxima vuelta
    for (const l of txt.slice(0, fin + 1).split('\n')) {
      if (!l.trim()) continue;
      try {
        const e = JSON.parse(l);
        acumular(s.r, e);
        if (e.tipo !== 'inicio' && e.tipo !== 'fin') s.recientes = s.recientes.concat(e).slice(-6);
      } catch (e) {
        /* línea ajena */
      }
    }
    s.bytes += Buffer.byteLength(txt.slice(0, fin + 1));
  }
  EJECUCIONES.set(id, s);
  return s;
}
/** El guardián del presupuesto: la respuesta a cada evento dice si se puede seguir. */
function guardia(r) {
  const tope = Number(r.inicio?.tope_usd) || 0;
  const plazo = r.inicio?.plazo ? Date.parse(r.inicio.plazo) : 0;
  if (tope && r.gasto >= tope) return `DETENER: se alcanzó el tope de gasto (${usd(r.gasto)} de ${usd(tope)}). Cierra con ejecucion cerrar.`;
  if (plazo && Date.now() > plazo) return `DETENER: pasó el plazo (${r.inicio.plazo_texto || r.inicio.plazo}). Cierra con ejecucion cerrar.`;
  const base = `ok · ${r.n} evento(s) · ${usd(r.gasto)}${tope ? ` de ${usd(tope)}` : ''}`;
  return tope && r.gasto >= tope * 0.8 ? `${base} · ojo: ${Math.round((r.gasto / tope) * 100)} % del tope` : base;
}
function notaEjecucion(id, r, extra = {}) {
  const ini = r.inicio || {};
  const fm = [
    '---',
    'tipo: ejecucion',
    `estado: ${extra.estado || 'en curso'}`,
    `meta: ${JSON.stringify(ini.meta || '')}`,
    `id: ${id}`,
    ...(ini.proyecto ? [`proyecto: ${JSON.stringify(`[[${ini.proyecto}]]`)}`] : []),
    `inicio: ${ini.ts ? local(new Date(ini.ts)) : ''}`,
    `fin: ${extra.fin || ''}`,
    `tope_usd: ${ini.tope_usd ?? ''}`,
    `plazo: ${ini.plazo ? local(new Date(ini.plazo)) : ''}`,
    `gasto_usd: ${Number(r.gasto.toFixed(4))}`,
    `eventos: ${r.n}`,
    `tokens_entrada: ${r.tin}`,
    `tokens_salida: ${r.tout}`,
    'agentes:',
    ...[...new Set([...(ini.agentes || []), ...r.agentes.keys()])].map((a) => `  - ${JSON.stringify(a)}`),
    `resumen: ${JSON.stringify(corto(extra.resumen || '', 200))}`,
    'tags:',
    '  - ejecucion',
    '---',
  ];
  return `${fm.join('\n')}\n# ${corto(ini.meta || id, 120)}\n> Ejecución \`${id}\` · registro completo en \`${AGENTES}/Registros/${id}.jsonl\`\n\n${extra.cuerpo || 'En curso: este resumen se completa al cerrarla.'}\n`;
}
async function iniciarEjecucion({ meta, tope_usd, plazo, agentes, proyecto, presupuesto_tokens }) {
  const m = corto(meta, 300);
  if (!m) return 'Falta la meta de la ejecución.';
  const p = proyecto ? buscarProyecto(cargarIndice(), proyecto) : null;
  if (proyecto && !p) return `No existe el proyecto "${proyecto}". ${listaProyectos()}\nCréalo con proyecto crear o inicia sin proyecto.`;
  const ahora = new Date();
  const slug = sinAcentos(m).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  const base = `${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}${dos(ahora.getSeconds())}-${slug}`;
  let id = base;
  for (let i = 2; fs.existsSync(rutaAg('Registros', `${id}.jsonl`)); i++) id = `${base}-${i}`;
  const tope = numero(tope_usd);
  const inicio = { ts: ahora.toISOString(), tipo: 'inicio', meta: m, tope_usd: tope ?? null, plazo: plazoDe(plazo, ahora), plazo_texto: plazo ? corto(plazo, 40) : null, agentes: listaDe(agentes), proyecto: p ? path.basename(p.rel, '.md') : undefined };
  anexar(rutaAg('Registros', `${id}.jsonl`), inicio);
  const r = nuevoResumen();
  r.inicio = inicio;
  fs.mkdirSync(rutaAg('Ejecuciones'), { recursive: true });
  guardar(rutaAg('Ejecuciones', `${id}.md`), notaEjecucion(id, r));
  const previo = await contexto({ consulta: m, alcance: 'todo', proyecto: inicio.proyecto, presupuesto_tokens: presupuesto_tokens || 600 });
  return `Ejecución ${id} iniciada${tope ? ` · tope ${usd(tope)}` : ''}${inicio.plazo ? ` · plazo ${local(new Date(inicio.plazo))}` : ''}.\nAnota cada paso con ejecucion evento (la respuesta dice si hay que DETENER) y ciérrala con ejecucion cerrar.\n\n${previo}`;
}
function eventoEjecucion({ ejecucion, agente, tipo, texto, costo_usd, tokens_entrada, tokens_salida, ms, estado }) {
  const id = idEjecucion(ejecucion);
  const s = estadoEjecucion(id);
  if (s.r.fin) return `La ejecución ${id} ya terminó (${s.r.fin.estado}): no anoto más eventos.`;
  const t = sinAcentos(tipo || 'nota');
  if (!TIPOS_EVENTO.includes(t)) return `Tipo de evento: ${TIPOS_EVENTO.join(', ')}.`;
  const e = { ts: new Date().toISOString(), agente: corto(agente, 40) || 'sin nombre', tipo: t, texto: corto(texto, 1000) };
  for (const [k, v] of Object.entries({ costo_usd, tokens_entrada, tokens_salida, ms })) if (numero(v) !== undefined) e[k] = numero(v);
  if (t === 'agente') e.estado = corto(estado || 'running', 20);
  anexar(rutaAg('Registros', `${id}.jsonl`), e);
  return guardia(estadoEjecucion(id).r); // incluye lo que anotaron los demás agentes mientras tanto
}
function verEjecucion({ ejecucion }) {
  const id = idEjecucion(ejecucion);
  const { r, recientes } = estadoEjecucion(id);
  const ini = r.inicio || {};
  const L = [
    `${ini.meta || id} · ${r.fin ? `cerrada (${r.fin.estado})` : 'en curso'}`,
    `${r.n} evento(s) · ${r.llamadas} llamada(s) a herramientas · ${r.errores} error(es) · ${usd(r.gasto)}${ini.tope_usd ? ` de ${usd(ini.tope_usd)}` : ''} · tokens ${r.tin}/${r.tout}`,
  ];
  if (ini.plazo && !r.fin) {
    const min = Math.round((Date.parse(ini.plazo) - Date.now()) / 60000);
    L.push(min >= 0 ? `Quedan ${Math.floor(min / 60)} h ${min % 60} min para el plazo.` : 'Pasó el plazo.');
  }
  if (r.agentes.size) L.push('Agentes:', ...[...r.agentes.entries()].map(([a, x]) => `- ${a}: ${x.n} evento(s), ${usd(x.gasto)}${x.errores ? `, ${x.errores} error(es)` : ''} · último: ${x.ultimo.tipo === 'agente' ? x.ultimo.estado : x.ultimo.tipo}`));
  if (recientes.length) L.push('Últimos eventos:', ...recientes.map((e) => `- ${e.ts.slice(11, 19)} [${e.agente}] ${e.tipo}: ${corto(e.texto, 120)}`));
  if (!r.fin) L.push(guardia(r));
  return recortar(L.join('\n'), 2500);
}
function cerrarEjecucion({ ejecucion, estado, resumen, resultado }) {
  const id = idEjecucion(ejecucion);
  const s = estadoEjecucion(id);
  if (s.r.fin) return `La ejecución ${id} ya estaba cerrada (${s.r.fin.estado}).`;
  const est = ESTADOS_FIN.includes(sinAcentos(estado)) ? sinAcentos(estado) : 'hecha';
  const ahora = new Date();
  anexar(rutaAg('Registros', `${id}.jsonl`), { ts: ahora.toISOString(), tipo: 'fin', estado: est, resumen: corto(resumen, 2000), resultado: corto(resultado, 500) });
  // El registro completo se lee una sola vez, al cerrar, para dejar un resumen que cualquiera puede leer barato
  const eventos = leerJsonl(rutaAg('Registros', `${id}.jsonl`));
  const r = nuevoResumen();
  for (const e of eventos) acumular(r, e);
  const de = (t, n = 15) => eventos.filter((e) => e.tipo === t).slice(-n).map((e) => `- [${e.agente}] ${corto(e.texto, 300)}`);
  const ini = r.inicio || {};
  const min = ini.ts ? Math.round((ahora - Date.parse(ini.ts)) / 60000) : 0;
  const cuerpo = [
    `**${est}** · ${min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`} · ${r.n} eventos · ${usd(r.gasto)}${ini.tope_usd ? ` de ${usd(ini.tope_usd)}` : ''} · tokens ${r.tin}/${r.tout}`,
    '',
    '## Resumen',
    corto(resumen, 2000) || '(sin resumen)',
    ...(resultado ? ['', '## Resultado', corto(resultado, 500)] : []),
    ...[['Decisiones', 'decision'], ['Errores', 'error'], ['Artefactos', 'artefacto']].flatMap(([titulo, t]) => (de(t).length ? ['', `## ${titulo}`, ...de(t)] : [])),
    ...(r.agentes.size ? ['', '## Agentes', '| Agente | Eventos | Gasto | Tokens entrada/salida | Errores |', '|---|---|---|---|---|', ...[...r.agentes.entries()].map(([a, x]) => `| ${a} | ${x.n} | ${usd(x.gasto)} | ${x.tin}/${x.tout} | ${x.errores} |`)] : []),
  ].join('\n');
  guardar(rutaAg('Ejecuciones', `${id}.md`), notaEjecucion(id, r, { estado: est, fin: local(ahora), resumen, cuerpo }));
  EJECUCIONES.delete(id);
  return `Ejecución ${id} cerrada (${est}) · ${r.n} eventos · ${usd(r.gasto)}. Resumen en ${AGENTES}/Ejecuciones/${id}.md. Si aprendiste algo que sirva la próxima vez, guárdalo con memoria guardar.`;
}
function listaEjecuciones({ limite } = {}) {
  let archivos = [];
  try {
    archivos = fs.readdirSync(rutaAg('Ejecuciones')).filter((f) => /^\d{8}-\d{6}-.*\.md$/.test(f)).sort().reverse();
  } catch (e) {
    return 'Todavía no hay ejecuciones.';
  }
  const n = Math.min(30, Math.max(1, Number(limite) || 10));
  const L = archivos.slice(0, n).map((f) => {
    const { fm } = frontmatter(fs.readFileSync(rutaAg('Ejecuciones', f), 'utf8'));
    const v = (k) => (Array.isArray(fm[k]) ? fm[k].join(', ') : fm[k] || '');
    return `- ${f.slice(0, -3)} · ${v('estado')} · ${usd(v('gasto_usd'))} · ${v('meta')}`;
  });
  return L.length ? `${archivos.length} ejecución(es); las más recientes:\n${L.join('\n')}` : 'Todavía no hay ejecuciones.';
}

// Memoria: cada recuerdo es una o dos frases. El agente recibe los que tocan su tarea, nunca el archivo entero.
const MEMORIA = () => rutaAg('Memoria', 'memoria.jsonl');
let MEMO_RECUERDOS = null;
function recuerdos() {
  let st;
  try {
    st = fs.statSync(MEMORIA());
  } catch (e) {
    return new Map();
  }
  if (MEMO_RECUERDOS && MEMO_RECUERDOS.bytes === st.size && MEMO_RECUERDOS.mtime === st.mtimeMs) return MEMO_RECUERDOS.items;
  const items = new Map();
  for (const e of leerJsonl(MEMORIA())) {
    if (e.id && e.texto) items.set(e.id, { ...e, refuerzos: Number(e.refuerzos) || 0, ultimo: e.ultimo || e.ts, k: tokens(`${e.texto} ${(e.etiquetas || []).join(' ')}`) });
    else if (e.refuerza && items.has(e.refuerza)) {
      const m = items.get(e.refuerza);
      m.refuerzos++;
      m.ultimo = e.ts;
    } else if (e.olvida) items.delete(e.olvida);
  }
  MEMO_RECUERDOS = { bytes: st.size, mtime: st.mtimeMs, items };
  return items;
}
// Las claves viven en el Llavero de Obsidian, nunca en notas: la memoria es texto plano dentro del vault
const SECRETO = /\b(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|gh[pous]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})|(contraseña|password|passwd|api[_ -]?key|token)\s*[:=]\s*\S{6,}/i;
function guardarMemoria({ texto, tipo, agente, etiquetas, ejecucion, proyecto }) {
  const t = sinAcentos(tipo || 'hecho');
  if (!TIPOS_MEMORIA.includes(t)) return `Tipo de recuerdo: ${TIPOS_MEMORIA.join(', ')}.`;
  const txt = corto(texto, 500);
  if (txt.length < 8) return 'El recuerdo está vacío o es muy corto: escribe una o dos frases que sirvan la próxima vez.';
  if (SECRETO.test(txt)) return 'No guardo eso: parece una clave, un token o una contraseña. Las claves van en el Llavero, no en el vault.';
  const p = proyecto ? buscarProyecto(cargarIndice(), proyecto) : null;
  if (proyecto && !p) return `No existe el proyecto "${proyecto}". ${listaProyectos()}`;
  const pr = p ? path.basename(p.rel, '.md') : undefined;
  const k = new Set(tokens(txt));
  for (const m of recuerdos().values()) {
    if (m.tipo !== t || m.proyecto !== pr) continue;
    let comunes = 0;
    for (const x of new Set(m.k)) if (k.has(x)) comunes++;
    if (comunes / (k.size + new Set(m.k).size - comunes || 1) >= 0.8) {
      anexar(MEMORIA(), { ts: new Date().toISOString(), refuerza: m.id, agente: corto(agente, 40) || undefined });
      return `Ya lo sabía (${m.id}): lo reforcé, así pesa más la próxima vez.`;
    }
  }
  const id = `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  anexar(MEMORIA(), { id, ts: new Date().toISOString(), tipo: t, agente: corto(agente, 40) || undefined, proyecto: pr, texto: txt, etiquetas: listaDe(etiquetas).slice(0, 8), ejecucion: ejecucion ? corto(ejecucion, 70) : undefined });
  return `Guardado ${id}${pr ? ` en ${pr}` : ''}.`;
}
function olvidarMemoria({ id, motivo }) {
  const m = recuerdos().get(String(id || '').trim());
  if (!m) return `No tengo el recuerdo "${id}".`;
  anexar(MEMORIA(), { ts: new Date().toISOString(), olvida: m.id, motivo: corto(motivo, 200) });
  return `Olvidado ${m.id}: ya no aparece en el contexto.`;
}
/** Reescribe la memoria aplicando refuerzos y olvidos. Mecánico y sin IA; antes guarda un respaldo. */
function compactarMemoria() {
  const abs = MEMORIA();
  for (let intento = 0; intento < 3; intento++) {
    let st;
    try {
      st = fs.statSync(abs);
    } catch (e) {
      return 'No hay memoria todavía.';
    }
    const antes = leerJsonl(abs).length;
    const items = [...recuerdos().values()].map(({ k, ...m }) => m);
    respaldar(abs, 'memoria.jsonl');
    const tmp = `${abs}.boveda-tmp`;
    fs.writeFileSync(tmp, items.map((m) => JSON.stringify(m)).join('\n') + (items.length ? '\n' : ''));
    if (fs.statSync(abs).size !== st.size) {
      fs.unlinkSync(tmp); // alguien anotó mientras tanto: se vuelve a intentar con lo nuevo
      continue;
    }
    fs.renameSync(tmp, abs);
    MEMO_RECUERDOS = null;
    return `Memoria compactada: ${antes} líneas → ${items.length} recuerdos.`;
  }
  return 'La memoria se está usando mucho ahora mismo; intenta compactar más tarde.';
}
/** load_context: lo que ya se sabe sobre una tarea (estado del proyecto, recuerdos y ejecuciones anteriores), dentro de un presupuesto fijo. */
async function contexto({ consulta, agente, alcance, proyecto, presupuesto_tokens } = {}) {
  const tope = Math.min(3000, Math.max(100, Number(presupuesto_tokens) || 600)) * 4; // caracteres
  const al = sinAcentos(alcance || 'todo');
  const q = tokens(consulta || '');
  const L = [];
  let usado = 0;
  let considerados = 0;
  let fuentes = 0;
  const poner = (l) => (usado + l.length + 1 > tope ? false : (L.push(l), (usado += l.length + 1), true));
  // Un apartado entra con su título solo si cabe al menos una línea, y nunca pasa de su cupo
  const apartado = (titulo, items, cupo) => {
    const hasta = Math.min(tope, usado + cupo);
    let puestas = 0;
    for (const l of items) {
      if (usado + l.length + 1 + (puestas ? 0 : titulo.length + 1) > hasta) break;
      if (!puestas) poner(titulo);
      poner(l);
      puestas++;
    }
    fuentes += puestas;
  };
  // Con un proyecto, primero su estado (hasta 40 % del presupuesto)
  let pr = null;
  if (proyecto) {
    const p = buscarProyecto(cargarIndice(), proyecto);
    if (!p) return `No existe el proyecto "${proyecto}". ${listaProyectos()}`;
    pr = path.basename(p.rel, '.md');
    considerados += p.bytes;
    fuentes++;
    for (const l of bloqueProyecto(p, Math.round(tope * 0.4)).split('\n')) poner(l);
  }
  // BM25 simple: la consulta contra cada documento ya tokenizado
  const puntuar = (docs) => {
    const N = docs.length || 1;
    const df = new Map();
    let largo = 0;
    for (const d of docs) {
      largo += d.k.length;
      for (const t of new Set(d.k)) df.set(t, (df.get(t) || 0) + 1);
    }
    const prom = largo / N || 1;
    return (d) => {
      let s = 0;
      for (const t of q) {
        const f = d.k.filter((x) => x === t).length;
        if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
        s += (idf * f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.k.length / prom)));
      }
      return s;
    };
  };
  // Lo que apenas roza la consulta (una palabra suelta en común) no entra: se corta bajo un cuarto del mejor puntaje
  const relevantes = (orden) => (q.length && orden.length ? orden.filter((x) => x.s >= orden[0].s * 0.25) : orden);
  let lineasMem = [];
  if (al === 'todo' || al === 'memoria') {
    const items = [...recuerdos().values()];
    considerados += items.reduce((a, m) => a + m.texto.length, 0);
    const bm = puntuar(items);
    const ahora = Date.now();
    const orden = items
      .map((m) => {
        const dias = (ahora - Date.parse(m.ultimo || m.ts)) / 86400000;
        const vigencia = ['preferencia', 'procedimiento'].includes(m.tipo) ? 1 : Math.pow(0.5, dias / 120); // lo estable no envejece
        const base = q.length ? bm(m) : !pr ? 1 : m.proyecto === pr ? 1 : m.proyecto ? 0 : 0.5; // sin consulta: lo del proyecto y lo general
        const delProyecto = !pr ? 1 : m.proyecto === pr ? 2 : m.proyecto ? 0.3 : 1; // lo de otro proyecto casi nunca sirve
        return { m, s: base * delProyecto * (1 + 0.3 * Math.log2(1 + m.refuerzos)) * vigencia * (agente && m.agente === agente ? 1.2 : 1) };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    lineasMem = relevantes(orden).map(({ m }) => {
      const datos = [m.tipo, m.proyecto && m.proyecto !== pr ? m.proyecto : '', m.agente || '', String(m.ultimo || m.ts).slice(0, 10), m.refuerzos ? `×${m.refuerzos + 1}` : ''].filter(Boolean);
      return `- [${datos.join(' · ')}] ${m.texto} (${m.id})`;
    });
  }
  let lineasRun = [];
  if (al === 'todo' || al === 'ejecuciones') {
    const idx = cargarIndice();
    const runs = idx.notas
      .filter((n) => n.fm.tipo === 'ejecucion' && n.fm.estado && n.fm.estado !== 'en curso')
      .map((n) => ({ n, k: n.secciones.flatMap((s) => s.k.split(' ')).concat(tokens(n.fm.meta || '')) }));
    considerados += runs.reduce((a, x) => a + x.n.bytes, 0);
    const bm = puntuar(runs);
    const delProyecto = (x) => (!pr ? 1 : sinAcentos(String(x.n.fm.proyecto || '').replace(/^\[\[|\]\]$/g, '')) === sinAcentos(pr) ? 2 : 0.3);
    const orden = runs.map((x) => ({ x, s: (q.length ? bm(x) : 1) * delProyecto(x) })).filter((y) => y.s > 0).sort((a, b) => b.s - a.s);
    lineasRun = relevantes(orden)
      .slice(0, 5)
      .map(({ x }) => {
        const f = x.n.fm;
        return `- ${String(f.inicio || '').slice(0, 10)} · "${corto(f.meta, 90)}" → ${f.estado} · ${usd(f.gasto_usd)}${f.resumen ? ` · ${corto(f.resumen, 160)}` : ''} (${path.basename(x.n.rel, '.md')})`;
      });
  }
  // Los recuerdos no se comen todo: si hay ejecuciones parecidas, se quedan con un 60 % de lo que resta
  const resto = tope - usado;
  apartado('Memoria (lo que ya se sabe):', lineasMem, lineasRun.length ? Math.round(resto * 0.6) : resto);
  apartado('Ejecuciones parecidas:', lineasRun, tope - usado);
  if (!L.length) return q.length ? 'Sin memoria previa sobre esto: es la primera vez que se trabaja en algo así.' : 'La memoria está vacía.';
  medir('contexto', corto(consulta, 80), usado, considerados, fuentes);
  return `${L.join('\n')}\n(~${tok(usado)} tokens; presupuesto ${tope / 4})`;
}
// Proyectos: una nota por proyecto, que escriben tú y tus agentes (por secciones). La memoria se agrupa por proyecto.
function buscarProyecto(idx, ref) {
  const r = sinAcentos(String(ref || '').replace(/^\[\[|\]\]$/g, '').replace(/\.md$/i, '').split('/').pop().trim());
  if (!r) return null;
  const ps = idx.notas.filter((n) => n.fm.tipo === 'proyecto' && n.rel.startsWith(PROYECTOS + '/') && !n.privada);
  const exacto = ps.find((n) => sinAcentos(path.basename(n.rel, '.md')) === r);
  if (exacto) return exacto;
  const parecidos = ps.filter((n) => sinAcentos(path.basename(n.rel, '.md')).includes(r));
  return parecidos.length === 1 ? parecidos[0] : null; // solo si no hay dudas: la memoria de un proyecto no debe caer en otro
}
function listaProyectos() {
  const ps = cargarIndice().notas.filter((n) => n.fm.tipo === 'proyecto' && n.rel.startsWith(PROYECTOS + '/') && !n.privada);
  if (!ps.length) return 'Todavía no hay proyectos (créalos con proyecto crear).';
  return `Proyectos (${ps.length}):\n${ps.slice(0, 40).map((n) => `- ${path.basename(n.rel, '.md')} · ${n.fm.estado || 'sin estado'}${n.fm.resumen ? ` — ${corto(n.fm.resumen, 100)}` : ''}`).join('\n')}`;
}
/** Lo justo para retomar un proyecto: estado actual, pendientes y las últimas decisiones. */
function bloqueProyecto(n, max = 2400) {
  const f = n.fm;
  const sec = (t) => n.secciones.find((s) => sinAcentos(s.titulo.split('>').pop().trim()) === sinAcentos(t)); // los títulos llegan con su ruta: "Proyecto > Estado actual"
  const L = [`Proyecto ${path.basename(n.rel, '.md')} (${f.estado || 'sin estado'})${f.repo ? ` · repo: ${f.repo}` : ''}${f.stack ? ` · ${f.stack}` : ''}`];
  if (f.resumen) L.push(corto(f.resumen, 300));
  for (const [t, parte] of [['Estado actual', 0.4], ['Pendientes', 0.3], ['Decisiones', 0.3]]) {
    const s = sec(t);
    if (!s || !s.texto.trim()) continue;
    const lineas = s.texto.split('\n').filter((l) => l.trim());
    const txt = (t === 'Decisiones' ? lineas.slice(-6) : lineas).join('\n'); // de las decisiones, las más recientes
    L.push(`${t}:`, txt.length > max * parte ? `${txt.slice(0, Math.round(max * parte))}…` : txt);
  }
  medir('proyecto', n.rel, Math.min(max, L.join('\n').length), n.bytes, 1);
  return recortar(L.join('\n'), max);
}
function plantillaProyecto({ nombre, resumen, repo, stack, estado }) {
  const est = ['idea', 'activo', 'pausado', 'terminado'].includes(sinAcentos(estado)) ? sinAcentos(estado) : 'activo';
  return [
    '---',
    'tipo: proyecto',
    `estado: ${est}`,
    `resumen: ${JSON.stringify(corto(resumen, 200))}`,
    `repo: ${JSON.stringify(corto(repo, 300))}`,
    'stack:',
    ...listaDe(stack).map((s) => `  - ${JSON.stringify(s)}`),
    `inicio: ${hoy()}`,
    `actualizado: ${hoy()}`,
    'tags:',
    '  - proyecto',
    '---',
    `# ${nombre}`,
    '```raiz-botones',
    '🤖 Instrucciones para tu agente | comando: raiz:project-agent-snippet | estilo: secundario',
    '```',
    '',
    '## Contexto',
    corto(resumen, 500) || '%% Qué es, para quién y por qué existe. %%',
    '',
    '## Estado actual',
    '%% Qué funciona, qué falta y en qué se quedó la última sesión. Se reemplaza entero al terminar cada sesión. %%',
    '',
    '## Pendientes',
    '',
    '## Decisiones',
    '%% Una viñeta por decisión: fecha, qué se decidió y por qué. Solo se agrega. %%',
    '',
    '## Aprendizajes',
    '%% Lo que conviene recordar la próxima vez: errores, trucos, comandos. %%',
    '',
  ].join('\n');
}
function crearProyecto({ nombre, proyecto, resumen, repo, stack, estado }) {
  const n = String(nombre || proyecto || '').replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+\s*/, '').slice(0, 80); // sin puntos al inicio: nada de archivos ocultos
  if (!n) return 'Falta el nombre del proyecto.';
  const rel = `${PROYECTOS}/${n}.md`;
  const abs = path.join(RAIZ, rel);
  if (fs.existsSync(abs) || buscarProyecto(cargarIndice(), n)?.rel === rel) return `Ya existe ${rel}: usa proyecto ver.`;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  guardar(abs, plantillaProyecto({ nombre: n, resumen, repo, stack, estado }));
  return `Creado ${rel}. Escribe en sus secciones con agregar_a_seccion (Decisiones, Pendientes, Aprendizajes) y reemplazar_seccion (Estado actual).`;
}
async function proyecto(a = {}) {
  const acc = sinAcentos(a.accion || 'lista');
  if (acc === 'lista') return listaProyectos();
  if (acc === 'ver') {
    const p = buscarProyecto(cargarIndice(), a.proyecto || a.nombre);
    return p ? bloqueProyecto(p, 4000) : `No existe el proyecto "${a.proyecto || a.nombre || ''}". ${listaProyectos()}`;
  }
  if (acc === 'crear') return crearProyecto(a);
  return 'accion: lista, ver o crear.';
}
async function memoria(a = {}) {
  const acc = sinAcentos(a.accion || 'contexto');
  if (acc === 'contexto') return contexto(a);
  if (acc === 'guardar') return guardarMemoria(a);
  if (acc === 'olvidar') return olvidarMemoria(a);
  if (acc === 'compactar') return compactarMemoria();
  return 'accion: contexto, guardar u olvidar.';
}
async function ejecucion(a = {}) {
  const acc = sinAcentos(a.accion || '');
  if (acc === 'iniciar') return iniciarEjecucion(a);
  if (acc === 'evento') return eventoEjecucion(a);
  if (acc === 'estado') return verEjecucion(a);
  if (acc === 'cerrar') return cerrarEjecucion(a);
  if (acc === 'lista') return listaEjecuciones(a);
  return 'accion: iniciar, evento, estado, cerrar o lista.';
}

// ───────────── Servidor MCP (stdio, JSON-RPC 2.0) ─────────────
const texto = (d) => ({ type: 'string', description: d });
const LECTURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ESCRITURA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const HERRAMIENTAS = [
  { name: 'lecciones', ann: LECTURA, description: 'Lo aprendido en sesiones anteriores: fuentes que ya sirvieron, callejones sin salida y correcciones de la persona. Llámala AL EMPEZAR, antes de investigar.', inputSchema: { type: 'object', properties: {} }, run: () => lecciones() },
  { name: 'buscar', ann: LECTURA, description: 'Busca en todo el vault (por palabras y, si está disponible, por significado) y devuelve las secciones más relevantes con ruta:línea y un fragmento. Úsala ANTES de abrir notas: cuesta lo mismo con 100 o con 20.000 notas.', inputSchema: { type: 'object', properties: { consulta: texto('Palabras clave o pregunta'), limite: { type: 'number', description: 'Secciones a devolver (1-20, por defecto 8)' } }, required: ['consulta'] }, run: (a) => buscar(a.consulta, a.limite) },
  { name: 'seccion', ann: LECTURA, description: 'Lee una sola sección de una nota (por su título), no la nota entera. Sin título devuelve el esqueleto.', inputSchema: { type: 'object', properties: { nota: texto('Ruta o nombre de la nota'), titulo: texto('Título de la sección (basta una parte)') }, required: ['nota'] }, run: (a) => seccion(a.nota, a.titulo) },
  { name: 'esqueleto', ann: LECTURA, description: 'Resumen, propiedades, lista de secciones y páginas que están dentro de una nota (sus hijas), sin el contenido. Para decidir qué leer.', inputSchema: { type: 'object', properties: { nota: texto('Ruta o nombre') }, required: ['nota'] }, run: (a) => esqueleto(a.nota) },
  { name: 'vecinos', ann: LECTURA, description: 'Las notas que una nota enlaza y las que la enlazan, cada una con su resumen de una línea.', inputSchema: { type: 'object', properties: { nota: texto('Ruta o nombre'), limite: { type: 'number' } }, required: ['nota'] }, run: (a) => vecinos(a.nota, a.limite) },
  { name: 'explorar', ann: LECTURA, description: 'El vecindario de una nota hasta 3 saltos, con resúmenes y lo más conectado primero, dentro de un presupuesto fijo. Para entender un tema sin abrir notas.', inputSchema: { type: 'object', properties: { nota: texto('Ruta o nombre'), profundidad: { type: 'number', description: '1 a 3 (por defecto 2)' } }, required: ['nota'] }, run: (a) => explorar(a.nota, a.profundidad) },
  { name: 'camino', ann: LECTURA, description: 'Cómo se conectan dos notas: el camino más corto de enlaces entre ellas.', inputSchema: { type: 'object', properties: { desde: texto('Nota de inicio'), hasta: texto('Nota de destino') }, required: ['desde', 'hasta'] }, run: (a) => camino(a.desde, a.hasta) },
  { name: 'datos', ann: LECTURA, description: 'Datos diarios de la persona (sueño, peso, metas, ánimo, entrenamiento…) como CSV, filtrados por fechas y columnas.', inputSchema: { type: 'object', properties: { desde: texto('AAAA-MM-DD'), hasta: texto('AAAA-MM-DD'), columnas: texto('Separadas por coma, ej. sueno,peso') } }, run: (a) => datos(a) },
  { name: 'crear_pagina', ann: ESCRITURA, description: 'Crea una página de la wiki (13 Wiki) con su encabezado correcto. Falla si ya existe: en ese caso agrega a la existente.', inputSchema: { type: 'object', properties: { clase: texto('resumen | entidad | concepto | tema | respuesta'), titulo: texto('Título de la página'), resumen: texto('Una línea'), fuentes: { type: 'array', items: { type: 'string' }, description: 'Nombres de las notas fuente' }, cuerpo: texto('Contenido en markdown, sin el título') }, required: ['clase', 'titulo', 'resumen'] }, run: (a) => crearPagina(a) },
  { name: 'agregar_a_seccion', ann: ESCRITURA, description: 'Agrega texto al final de una sección de una página de la wiki (la crea si no existe). Mucho más barato que reescribir la página. Sirve también en páginas revisadas.', inputSchema: { type: 'object', properties: { nota: texto('Página de 13 Wiki'), titulo: texto('Sección, ej. Menciones o Contradicciones'), texto: texto('Lo que se agrega') }, required: ['nota', 'titulo', 'texto'] }, run: (a) => agregarASeccion(a.nota, a.titulo, a.texto) },
  { name: 'reemplazar_seccion', ann: ESCRITURA, description: 'Reemplaza el contenido de UNA sección de una página de la wiki, sin tocar el resto. No funciona en páginas revisadas por la persona (revisado: true).', inputSchema: { type: 'object', properties: { nota: texto('Página de 13 Wiki'), titulo: texto('Sección a reemplazar'), texto: texto('Nuevo contenido de la sección') }, required: ['nota', 'titulo', 'texto'] }, run: (a) => reemplazarSeccion(a.nota, a.titulo, a.texto) },
  { name: 'registrar', ann: ESCRITURA, description: 'Agrega una entrada al Registro de la wiki (solo se agrega al final).', inputSchema: { type: 'object', properties: { tipo: texto('ingesta | consulta | revisión | edición'), titulo: texto('Qué se hizo'), paginas: { type: 'array', items: { type: 'string' } } }, required: ['tipo', 'titulo'] }, run: (a) => registrar(a) },
  { name: 'marcar_resultado', ann: ESCRITURA, description: 'Marca cómo resultó una respuesta guardada (util, sin_salida o corregida, con la corrección). Alimenta las lecciones.', inputSchema: { type: 'object', properties: { nota: texto('Página de 13 Wiki/Respuestas'), resultado: texto('util | sin_salida | corregida'), correccion: texto('Si fue corregida: la respuesta correcta') }, required: ['nota', 'resultado'] }, run: (a) => marcarResultado(a) },
  { name: 'memoria', ann: ESCRITURA, description: 'Memoria persistente entre sesiones y agentes. contexto: lo que ya se sabe para una tarea, con tope de tokens (úsala al empezar). guardar: un recuerdo breve y reutilizable, no un log. olvidar: descarta uno por su id.', inputSchema: { type: 'object', properties: { accion: { type: 'string', enum: ['contexto', 'guardar', 'olvidar'] }, consulta: { type: 'string' }, proyecto: { type: 'string' }, alcance: { type: 'string', enum: ['todo', 'memoria', 'ejecuciones'] }, presupuesto_tokens: { type: 'number' }, texto: { type: 'string' }, tipo: { type: 'string', enum: TIPOS_MEMORIA }, agente: { type: 'string' }, etiquetas: { type: 'array', items: { type: 'string' } }, ejecucion: { type: 'string' }, id: { type: 'string' }, motivo: { type: 'string' } }, required: ['accion'] }, run: (a) => memoria(a) },
  { name: 'proyecto', ann: ESCRITURA, description: 'Proyectos de 14 Proyectos. lista; ver: estado actual, pendientes y últimas decisiones; crear. Para escribir en uno usa agregar_a_seccion o reemplazar_seccion.', inputSchema: { type: 'object', properties: { accion: { type: 'string', enum: ['lista', 'ver', 'crear'] }, proyecto: { type: 'string' }, nombre: { type: 'string' }, resumen: { type: 'string' }, repo: { type: 'string' }, stack: { type: 'array', items: { type: 'string' } }, estado: { type: 'string', enum: ['idea', 'activo', 'pausado', 'terminado'] } }, required: ['accion'] }, run: (a) => proyecto(a) },
  { name: 'ejecucion', ann: ESCRITURA, description: 'Registro de una ejecución de varios agentes. iniciar (meta, tope_usd, plazo HH:MM, proyecto): da el id y el contexto previo. evento: anota un paso en una línea; responde DETENER si se pasó el tope o el plazo. estado, cerrar (estado, resumen), lista.', inputSchema: { type: 'object', properties: { accion: { type: 'string', enum: ['iniciar', 'evento', 'estado', 'cerrar', 'lista'] }, ejecucion: { type: 'string' }, meta: { type: 'string' }, tope_usd: { type: 'number' }, plazo: { type: 'string' }, proyecto: { type: 'string' }, agentes: { type: 'array', items: { type: 'string' } }, agente: { type: 'string' }, tipo: { type: 'string', enum: TIPOS_EVENTO }, texto: { type: 'string' }, costo_usd: { type: 'number' }, tokens_entrada: { type: 'number' }, tokens_salida: { type: 'number' }, ms: { type: 'number' }, estado: { type: 'string', description: 'cerrar: hecha | fallida | cancelada | detenida · evento agente: running | idle | done' }, resumen: { type: 'string' }, resultado: { type: 'string' } }, required: ['accion'] }, run: (a) => ejecucion(a) },
  { name: 'medicion', ann: LECTURA, description: 'Cuántos tokens ha ahorrado la herramienta, al leer y al escribir, medido llamada a llamada.', inputSchema: { type: 'object', properties: {} }, run: () => medicion() },
];
// Cada definición viaja en cada vuelta del agente: el perfil de siempre (vault) no cambia y no cuesta más por tener lo nuevo
const PERFILES = {
  vault: ['lecciones', 'buscar', 'seccion', 'esqueleto', 'vecinos', 'explorar', 'camino', 'datos', 'crear_pagina', 'agregar_a_seccion', 'reemplazar_seccion', 'registrar', 'marcar_resultado', 'medicion'],
  proyectos: ['lecciones', 'buscar', 'seccion', 'esqueleto', 'vecinos', 'explorar', 'camino', 'datos', 'agregar_a_seccion', 'reemplazar_seccion', 'memoria', 'proyecto'],
  agente: ['buscar', 'seccion', 'esqueleto', 'memoria', 'ejecucion'],
  orquestador: ['lecciones', 'buscar', 'esqueleto', 'datos', 'memoria', 'proyecto', 'ejecucion'],
  todo: null,
};
function herramientasDelPerfil() {
  const lista = opcion('herramientas');
  const perfil = opcion('perfil') || 'vault';
  const nombres = lista ? lista.split(',').map((x) => x.trim()) : perfil in PERFILES ? PERFILES[perfil] : PERFILES.vault;
  return nombres ? HERRAMIENTAS.filter((h) => nombres.includes(h.name)) : HERRAMIENTAS;
}
const INSTRUCCIONES =
  'Bóveda de Obsidian de una persona (vida personal, estudio y entrenamiento), en español. Para ahorrar tokens: ' +
  '1) al empezar, `lecciones`; 2) `buscar` antes de abrir cualquier nota; 3) lee solo la `seccion` que necesitas; 4) recorre el grafo con `vecinos`, `explorar` o `camino` (las páginas de estudio cuelgan unas de otras: `esqueleto` muestra las que están dentro); ' +
  '5) para datos personales, `datos`; 6) para escribir en la wiki usa `crear_pagina`, `agregar_a_seccion` y `reemplazar_seccion`, nunca reescribas una página entera. Reglas completas en AGENTS.md.';
const INSTRUCCIONES_MEMORIA =
  ' Memoria: al empezar una tarea, `memoria` accion=contexto (con el proyecto, si es de uno); al terminar, guarda solo lo que sirva la próxima vez y actualiza la sección "Estado actual" del proyecto.';
function servidorMcp() {
  const expuestas = herramientasDelPerfil();
  const enviar = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) > -1) {
      const linea = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!linea) continue;
      let m;
      try {
        m = JSON.parse(linea);
      } catch (e) {
        enviar({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } });
        continue;
      }
      const ok = (result) => m.id !== undefined && enviar({ jsonrpc: '2.0', id: m.id, result });
      const err = (code, message) => m.id !== undefined && enviar({ jsonrpc: '2.0', id: m.id, error: { code, message } });
      try {
        if (m.method === 'initialize') ok({ protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'raiz-boveda', version: VERSION }, instructions: INSTRUCCIONES + (expuestas.some((h) => h.name === 'memoria') ? INSTRUCCIONES_MEMORIA : '') });
        else if (m.method === 'ping') ok({});
        else if (m.method === 'tools/list') ok({ tools: expuestas.map(({ name, description, inputSchema, ann }) => ({ name, description, inputSchema, annotations: ann })) });
        else if (m.method === 'tools/call') {
          const h = expuestas.find((x) => x.name === m.params?.name);
          if (!h) err(-32602, `Herramienta desconocida: ${m.params?.name}`);
          else
            Promise.resolve()
              .then(() => h.run(m.params.arguments || {}))
              .then((text) => ok({ content: [{ type: 'text', text: String(text) }] }))
              .catch((e) => ok({ content: [{ type: 'text', text: `error: ${e.message}` }], isError: true }));
        } else if (m.method && m.method.startsWith('notifications/')) {
          /* sin respuesta */
        } else err(-32601, `Método no soportado: ${m.method}`);
      } catch (e) {
        if (m.method === 'tools/call') ok({ content: [{ type: 'text', text: `error: ${e.message}` }], isError: true });
        else err(-32603, e.message);
      }
    }
  });
}

// ───────────── CLI ─────────────
function opcion(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
async function principal() {
  const args = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
  const [cmd, ...resto] = args;
  const out = (t) => process.stdout.write(String(t) + '\n');
  try {
    switch (cmd) {
      case 'buscar':
        return out(await buscar(resto.join(' '), opcion('limite'), opcion('modo')));
      case 'seccion':
        return out(seccion(resto[0], resto.slice(1).join(' ')));
      case 'esqueleto':
        return out(esqueleto(resto.join(' ')));
      case 'vecinos':
        return out(vecinos(resto.join(' '), opcion('limite')));
      case 'explorar':
        return out(explorar(resto.join(' '), opcion('profundidad')));
      case 'camino':
        return out(camino(resto[0], resto[1]));
      case 'datos':
        return out(datos({ desde: opcion('desde'), hasta: opcion('hasta'), columnas: opcion('columnas') }));
      case 'lecciones':
        return out(lecciones());
      case 'crear':
        return out(crearPagina({ clase: resto[0], titulo: resto[1], resumen: opcion('resumen'), fuentes: opcion('fuentes'), cuerpo: opcion('cuerpo') }));
      case 'agregar':
        return out(agregarASeccion(resto[0], resto[1], resto.slice(2).join(' ')));
      case 'reemplazar':
        return out(reemplazarSeccion(resto[0], resto[1], resto.slice(2).join(' ')));
      case 'registrar':
        return out(registrar({ tipo: resto[0], titulo: resto.slice(1).join(' '), paginas: opcion('paginas') }));
      case 'marcar':
        return out(marcarResultado({ nota: resto[0], resultado: resto[1], correccion: opcion('correccion') }));
      case 'memoria': {
        const sub = sinAcentos(resto[0] || 'contexto');
        if (sub === 'contexto') return out(await contexto({ consulta: resto.slice(1).join(' '), proyecto: opcion('proyecto'), agente: opcion('agente'), alcance: opcion('alcance'), presupuesto_tokens: opcion('presupuesto') }));
        if (sub === 'guardar') return out(guardarMemoria({ tipo: resto[1], texto: resto.slice(2).join(' '), proyecto: opcion('proyecto'), agente: opcion('agente'), etiquetas: opcion('etiquetas'), ejecucion: opcion('ejecucion') }));
        if (sub === 'olvidar') return out(olvidarMemoria({ id: resto[1], motivo: resto.slice(2).join(' ') }));
        if (sub === 'compactar') return out(compactarMemoria());
        return out('memoria contexto <consulta> · guardar <tipo> <texto> · olvidar <id> <motivo> · compactar');
      }
      case 'proyecto': {
        const sub = sinAcentos(resto[0] || 'lista');
        if (sub === 'crear') return out(crearProyecto({ nombre: resto.slice(1).join(' '), resumen: opcion('resumen'), repo: opcion('repo'), stack: opcion('stack'), estado: opcion('estado') }));
        return out(await proyecto({ accion: sub, proyecto: resto.slice(1).join(' ') }));
      }
      case 'ejecucion': {
        const sub = sinAcentos(resto[0] || 'lista');
        if (sub === 'iniciar') return out(await iniciarEjecucion({ meta: resto.slice(1).join(' '), tope_usd: opcion('tope'), plazo: opcion('plazo'), agentes: opcion('agentes'), proyecto: opcion('proyecto'), presupuesto_tokens: opcion('presupuesto') }));
        if (sub === 'evento') return out(eventoEjecucion({ ejecucion: resto[1], agente: resto[2], tipo: resto[3], texto: resto.slice(4).join(' '), costo_usd: opcion('costo'), tokens_entrada: opcion('entrada'), tokens_salida: opcion('salida'), ms: opcion('ms'), estado: opcion('estado') }));
        if (sub === 'estado') return out(verEjecucion({ ejecucion: resto[1] }));
        if (sub === 'cerrar') return out(cerrarEjecucion({ ejecucion: resto[1], estado: resto[2], resumen: resto.slice(3).join(' '), resultado: opcion('resultado') }));
        if (sub === 'lista') return out(listaEjecuciones({ limite: opcion('limite') }));
        return out('ejecucion iniciar <meta> · evento <id> <agente> <tipo> <texto> · estado <id> · cerrar <id> <estado> <resumen> · lista');
      }
      case 'medicion':
        return out(medicion());
      case 'estado':
        return out(estado());
      case 'mcp':
        return servidorMcp();
      default:
        out(
          `boveda ${VERSION} — consulta y edita el vault gastando pocos tokens.\n` +
            'Leer: lecciones · buscar <consulta> · seccion <nota> <título> · esqueleto <nota> · vecinos <nota> · explorar <nota> [--profundidad 2] · camino <nota> <nota> · datos [--desde --hasta --columnas]\n' +
            'Escribir: crear <clase> <título> --resumen "…" [--fuentes a,b --cuerpo "…"] (wiki) · agregar <nota> <sección> <texto> · reemplazar <nota> <sección> <texto> · registrar <tipo> <título> [--paginas a,b] · marcar <nota> <util|sin_salida|corregida> (agregar y reemplazar sirven en 13 Wiki y 14 Proyectos)\n' +
            'Proyectos y agentes: proyecto lista|ver <nombre>|crear <nombre> [--resumen --repo --stack a,b] · memoria contexto <consulta> [--proyecto --presupuesto 600] · memoria guardar <tipo> <texto> [--proyecto --agente] · memoria olvidar <id> · memoria compactar\n' +
            'Ejecuciones: ejecucion iniciar <meta> [--tope 10 --plazo 07:40 --proyecto] · evento <id> <agente> <tipo> <texto> [--costo --entrada --salida --ms] · estado <id> · cerrar <id> <hecha|fallida|cancelada|detenida> <resumen> · lista\n' +
            'Otros: medicion · estado · mcp [--perfil vault|proyectos|agente|orquestador|todo] [--herramientas a,b]'
        );
    }
  } catch (e) {
    out(`error: ${e.message}`);
    process.exitCode = 1;
  }
}
if (require.main === module) principal();
module.exports = { buscar, seccion, esqueleto, vecinos, explorar, camino, datos, lecciones, crearPagina, agregarASeccion, reemplazarSeccion, registrar, marcarResultado, medicion, estado, cargarIndice, tokens, contexto, guardarMemoria, olvidarMemoria, compactarMemoria, iniciarEjecucion, eventoEjecucion, verEjecucion, cerrarEjecucion, listaEjecuciones, crearProyecto, listaProyectos, proyecto, memoria, ejecucion };
