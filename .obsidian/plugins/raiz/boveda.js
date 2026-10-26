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
 *   node .obsidian/plugins/raiz/boveda.js mcp          (servidor MCP por stdio)
 *
 * Sin dependencias: solo Node.js 18 o superior.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const VERSION = '1.1.0';
const CACHE_VERSION = 4;
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
    fm: { tipo: uno(fm.tipo), clase: uno(fm.clase), resumen: uno(fm.resumen), revisado: uno(fm.revisado), tags: uno(fm.tags), resultado: uno(fm.resultado), correccion: uno(fm.correccion), actualizado: uno(fm.actualizado), fuentes: lista(fm.fuentes) },
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
function buscarNota(idx, ref) {
  const r = String(ref || '').trim().replace(/^\[\[|\]\]$/g, '').replace(/\\/g, '/');
  const exacta = idx.notas.find((n) => n.rel === r || n.rel === r + '.md');
  if (exacta) return exacta;
  return idx.porNombre.get(sinAcentos(path.basename(r, '.md'))) || null;
}

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
  if (!n) return `No encuentro la nota "${ref}".`;
  if (n.privada) return `"${n.rel}" es privada: no sale de la bóveda.`;
  if (!titulo) return esqueleto(ref);
  const t = sinAcentos(titulo);
  const s = n.secciones.find((x) => sinAcentos(x.titulo) === t) || n.secciones.find((x) => sinAcentos(x.titulo).endsWith(t)) || n.secciones.find((x) => sinAcentos(x.titulo).includes(t));
  if (!s) return `"${n.rel}" no tiene una sección "${titulo}". Sus secciones:\n${n.secciones.map((x) => `- ${x.titulo} (línea ${x.linea})`).join('\n')}`;
  const salida = recortar(`${n.rel}:${s.linea} · ${s.titulo}\n\n${s.texto}`, MAX_SECCION);
  medir('seccion', `${n.rel} > ${titulo}`, salida.length, n.bytes, 1);
  return salida;
}
function esqueleto(ref) {
  const idx = cargarIndice();
  const n = buscarNota(idx, ref);
  if (!n) return `No encuentro la nota "${ref}".`;
  if (n.privada) return `"${n.rel}" es privada: no sale de la bóveda.`;
  const fm = Object.entries(n.fm)
    .filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
  const L = [`${n.rel} (${n.bytes} bytes, ~${tok(n.bytes)} tokens si la abrieras entera)`, ...fm.map((x) => `  ${x}`), 'Secciones:', ...n.secciones.map((s) => `- ${s.titulo} (línea ${s.linea}, ${s.texto.length} caracteres)`)];
  if (n.enlaces.length) L.push(`Enlaza a ${n.enlaces.length} nota(s); usa \`vecinos\` para verlas con su resumen.`);
  const salida = recortar(L.join('\n'));
  medir('esqueleto', n.rel, salida.length, n.bytes, 1);
  return salida;
}
function vecinos(ref, limite = 40) {
  const idx = cargarIndice();
  const n = buscarNota(idx, ref);
  if (!n) return `No encuentro la nota "${ref}".`;
  if (n.privada) return `"${n.rel}" es privada: no sale de la bóveda.`;
  const nombre = sinAcentos(path.basename(n.rel, '.md'));
  const linea = (x, alt) => (x ? (x.privada ? `- ${path.basename(x.rel, '.md')} (privada)` : `- ${x.rel}${x.fm.resumen ? ` — ${x.fm.resumen}` : x.fm.clase ? ` (${x.fm.clase})` : ''}`) : `- ${alt} (no existe todavía)`);
  const salen = n.enlaces.slice(0, limite).map((e) => linea(idx.porNombre.get(sinAcentos(e)), e));
  const entran = idx.notas.filter((x) => x !== n && x.enlaces.some((e) => sinAcentos(e) === nombre));
  const L = [`Vecinos de ${n.rel}`, `Enlaza a (${n.enlaces.length}):`, ...salen, `La enlazan (${entran.length}):`, ...entran.slice(0, limite).map((x) => linea(x))];
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
  if (!n) return `No encuentro la nota "${ref}".`;
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
  const L = [`Alrededor de ${n.rel} (hasta ${prof} salto${prof > 1 ? 's' : ''}):`];
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

// ───────────── Escribir por secciones (solo en 13 Wiki, con respaldo) ─────────────
// Reescribir una página entera para cambiar una línea cuesta muchos tokens de salida. Estas herramientas cambian solo
// lo necesario y protegen lo tuyo: nada fuera de 13 Wiki, nada en Fuentes, y lo que revisaste (revisado: true) solo crece.
const WIKI = '13 Wiki';
const CARPETAS = { resumen: 'Resúmenes', entidad: 'Entidades', concepto: 'Conceptos', tema: 'Temas', respuesta: 'Respuestas' };
const DE_RAIZ = new Set(['Índice.md', 'Revisión.md', 'Wiki.md', 'Lecciones.md'].map((n) => `${WIKI}/${n}`));
const hoy = () => new Date().toISOString().slice(0, 10);
function escribible(rel) {
  const abs = path.resolve(RAIZ, rel);
  const r = path.relative(RAIZ, abs).replace(/\\/g, '/');
  if (!r.startsWith(WIKI + '/') || r.includes('..')) throw new Error('Solo escribo dentro de 13 Wiki: el resto del vault es de la persona.');
  if (/^13 Wiki\/(Fuentes|Datos|Índices)\//.test(r)) throw new Error('Fuentes, Datos e Índices no se editan: las fuentes son de solo lectura y lo demás lo genera Raíz.');
  if (DE_RAIZ.has(r)) throw new Error('Ese archivo lo genera Raíz. Para el registro usa `registrar`.');
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
function guardar(abs, texto) {
  const tmp = `${abs}.boveda-tmp`;
  fs.writeFileSync(tmp, texto, 'utf8');
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
  if (!n) throw new Error(`No encuentro "${ref}". Para una página nueva usa \`crear_pagina\`.`);
  const { abs, rel } = escribible(n.rel);
  return { n, abs, rel, txt: fs.readFileSync(abs, 'utf8') };
}
function reemplazarSeccion(ref, titulo, texto) {
  const { n, abs, rel, txt } = notaEscribible(ref);
  if (/^true$/i.test(n.fm.revisado)) return `"${rel}" la revisó la persona (revisado: true): no reemplazo su contenido. Usa \`agregar_a_seccion\` para sumar, por ejemplo bajo "Contradicciones".`;
  const lineas = txt.split(/\r?\n/);
  const s = ubicarSeccion(lineas, titulo);
  if (!s) return `"${rel}" no tiene la sección "${titulo}". Usa \`agregar_a_seccion\` para crearla.`;
  if (!respaldar(abs, rel)) return 'No pude guardar un respaldo, así que no modifiqué nada.';
  const nuevo = [...lineas.slice(0, s.inicio + 1), String(texto).replace(/\s+$/, ''), '', ...lineas.slice(s.fin)].join('\n');
  guardar(abs, conActualizado(nuevo));
  medir('reemplazar_seccion', `${rel} > ${titulo}`, String(texto).length, txt.length, 1);
  return `Listo: reemplacé "${titulo}" en ${rel}. (Respaldo guardado.)`;
}
function agregarASeccion(ref, titulo, texto) {
  const { abs, rel, txt } = notaEscribible(ref);
  const lineas = txt.split(/\r?\n/);
  const s = ubicarSeccion(lineas, titulo);
  if (!respaldar(abs, rel)) return 'No pude guardar un respaldo, así que no modifiqué nada.';
  let nuevo;
  if (s) {
    let fin = s.fin;
    while (fin - 1 > s.inicio && !lineas[fin - 1].trim()) fin--;
    nuevo = [...lineas.slice(0, fin), String(texto).replace(/\s+$/, ''), ...(s.fin < lineas.length ? [''] : []), ...lineas.slice(s.fin)].join('\n');
  } else nuevo = `${txt.replace(/\s+$/, '')}\n\n## ${titulo.split('>').pop().trim()}\n${String(texto).replace(/\s+$/, '')}\n`;
  guardar(abs, conActualizado(nuevo));
  medir('agregar_a_seccion', `${rel} > ${titulo}`, String(texto).length, txt.length, 1);
  return `Listo: agregué a "${titulo}" en ${rel}${s ? '' : ' (la sección no existía y la creé al final)'}.`;
}
function crearPagina({ clase, titulo, resumen, fuentes, cuerpo }) {
  const carpeta = CARPETAS[String(clase || '').toLowerCase()];
  if (!carpeta) return `Clase desconocida. Usa una de: ${Object.keys(CARPETAS).join(', ')}.`;
  const nombre = String(titulo || '').replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!nombre) return 'Falta el título.';
  const idx = cargarIndice();
  const existe = buscarNota(idx, nombre);
  if (existe) return `Ya existe "${existe.rel}". Agrega lo nuevo con \`agregar_a_seccion\` en vez de crear otra página.`;
  const { abs, rel } = escribible(`${WIKI}/${carpeta}/${nombre}.md`);
  const fs2 = (Array.isArray(fuentes) ? fuentes : fuentes ? String(fuentes).split(',') : []).map((f) => String(f).replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean);
  const fm = ['---', 'tipo: wiki', `clase: ${String(clase).toLowerCase()}`, `resumen: ${JSON.stringify(String(resumen || '').replace(/\s+/g, ' ').trim())}`, 'fuentes:', ...fs2.map((f) => `  - ${JSON.stringify(`[[${f}]]`)}`), `actualizado: ${hoy()}`, 'revisado: false', ...(String(clase).toLowerCase() === 'respuesta' ? ['resultado: ""'] : []), 'tags:', '  - wiki', '---'];
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  guardar(abs, `${fm.join('\n')}\n# ${nombre}\n\n${String(cuerpo || '').replace(/\s+$/, '')}\n`);
  medir('crear_pagina', rel, String(cuerpo || '').length, String(cuerpo || '').length, 1);
  return `Creada ${rel}. Recuerda anotarla con \`registrar\`.`;
}
function registrar({ tipo, titulo, paginas }) {
  const t = sinAcentos(String(tipo || '')).replace('revision', 'revisión');
  if (!['ingesta', 'consulta', 'revisión', 'edicion', 'edición'].includes(t)) return 'Tipo: ingesta, consulta, revisión o edición.';
  const abs = path.join(RAIZ, WIKI, 'Registro.md');
  const lista = (Array.isArray(paginas) ? paginas : paginas ? String(paginas).split(',') : []).map((p) => `[[${String(p).replace(/^\[\[|\]\]$/g, '').trim()}]]`);
  const entrada = `\n## [${hoy()}] ${t.replace('edicion', 'edición')} | ${String(titulo || '').replace(/\n/g, ' ').slice(0, 120)}\n${lista.length ? `Páginas: ${lista.join(', ')}\n` : ''}`;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.appendFileSync(abs, (fs.existsSync(abs) ? '' : '# Registro de la wiki\n') + entrada);
  return 'Anotado en el Registro.';
}
/** Cómo resultó una respuesta guardada: alimenta las lecciones para que no se repitan búsquedas inútiles. */
function marcarResultado({ nota, resultado, correccion }) {
  const r = sinAcentos(String(resultado || '')).replace(/\s+/g, '_');
  if (!['util', 'sin_salida', 'corregida'].includes(r)) return 'Resultado: util, sin_salida o corregida.';
  const { n, abs, rel, txt } = notaEscribible(nota);
  if (n.fm.clase !== 'respuesta') return 'Solo las páginas de Respuestas llevan resultado.';
  if (!respaldar(abs, rel)) return 'No pude guardar un respaldo, así que no modifiqué nada.';
  let nuevo = ponerPropiedad(txt, 'resultado', r);
  if (correccion) nuevo = ponerPropiedad(nuevo, 'correccion', String(correccion).slice(0, 300));
  guardar(abs, conActualizado(nuevo));
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

// ───────────── Servidor MCP (stdio, JSON-RPC 2.0) ─────────────
const texto = (d) => ({ type: 'string', description: d });
const LECTURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ESCRITURA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const HERRAMIENTAS = [
  { name: 'lecciones', ann: LECTURA, description: 'Lo aprendido en sesiones anteriores: fuentes que ya sirvieron, callejones sin salida y correcciones de la persona. Llámala AL EMPEZAR, antes de investigar.', inputSchema: { type: 'object', properties: {} }, run: () => lecciones() },
  { name: 'buscar', ann: LECTURA, description: 'Busca en todo el vault (por palabras y, si está disponible, por significado) y devuelve las secciones más relevantes con ruta:línea y un fragmento. Úsala ANTES de abrir notas: cuesta lo mismo con 100 o con 20.000 notas.', inputSchema: { type: 'object', properties: { consulta: texto('Palabras clave o pregunta'), limite: { type: 'number', description: 'Secciones a devolver (1-20, por defecto 8)' } }, required: ['consulta'] }, run: (a) => buscar(a.consulta, a.limite) },
  { name: 'seccion', ann: LECTURA, description: 'Lee una sola sección de una nota (por su título), no la nota entera. Sin título devuelve el esqueleto.', inputSchema: { type: 'object', properties: { nota: texto('Ruta o nombre de la nota'), titulo: texto('Título de la sección (basta una parte)') }, required: ['nota'] }, run: (a) => seccion(a.nota, a.titulo) },
  { name: 'esqueleto', ann: LECTURA, description: 'Resumen, propiedades y lista de secciones de una nota, sin el contenido. Para decidir qué sección leer.', inputSchema: { type: 'object', properties: { nota: texto('Ruta o nombre') }, required: ['nota'] }, run: (a) => esqueleto(a.nota) },
  { name: 'vecinos', ann: LECTURA, description: 'Las notas que una nota enlaza y las que la enlazan, cada una con su resumen de una línea.', inputSchema: { type: 'object', properties: { nota: texto('Ruta o nombre'), limite: { type: 'number' } }, required: ['nota'] }, run: (a) => vecinos(a.nota, a.limite) },
  { name: 'explorar', ann: LECTURA, description: 'El vecindario de una nota hasta 3 saltos, con resúmenes y lo más conectado primero, dentro de un presupuesto fijo. Para entender un tema sin abrir notas.', inputSchema: { type: 'object', properties: { nota: texto('Ruta o nombre'), profundidad: { type: 'number', description: '1 a 3 (por defecto 2)' } }, required: ['nota'] }, run: (a) => explorar(a.nota, a.profundidad) },
  { name: 'camino', ann: LECTURA, description: 'Cómo se conectan dos notas: el camino más corto de enlaces entre ellas.', inputSchema: { type: 'object', properties: { desde: texto('Nota de inicio'), hasta: texto('Nota de destino') }, required: ['desde', 'hasta'] }, run: (a) => camino(a.desde, a.hasta) },
  { name: 'datos', ann: LECTURA, description: 'Datos diarios de la persona (sueño, peso, metas, ánimo, entrenamiento…) como CSV, filtrados por fechas y columnas.', inputSchema: { type: 'object', properties: { desde: texto('AAAA-MM-DD'), hasta: texto('AAAA-MM-DD'), columnas: texto('Separadas por coma, ej. sueno,peso') } }, run: (a) => datos(a) },
  { name: 'crear_pagina', ann: ESCRITURA, description: 'Crea una página de la wiki (13 Wiki) con su encabezado correcto. Falla si ya existe: en ese caso agrega a la existente.', inputSchema: { type: 'object', properties: { clase: texto('resumen | entidad | concepto | tema | respuesta'), titulo: texto('Título de la página'), resumen: texto('Una línea'), fuentes: { type: 'array', items: { type: 'string' }, description: 'Nombres de las notas fuente' }, cuerpo: texto('Contenido en markdown, sin el título') }, required: ['clase', 'titulo', 'resumen'] }, run: (a) => crearPagina(a) },
  { name: 'agregar_a_seccion', ann: ESCRITURA, description: 'Agrega texto al final de una sección de una página de la wiki (la crea si no existe). Mucho más barato que reescribir la página. Sirve también en páginas revisadas.', inputSchema: { type: 'object', properties: { nota: texto('Página de 13 Wiki'), titulo: texto('Sección, ej. Menciones o Contradicciones'), texto: texto('Lo que se agrega') }, required: ['nota', 'titulo', 'texto'] }, run: (a) => agregarASeccion(a.nota, a.titulo, a.texto) },
  { name: 'reemplazar_seccion', ann: ESCRITURA, description: 'Reemplaza el contenido de UNA sección de una página de la wiki, sin tocar el resto. No funciona en páginas revisadas por la persona (revisado: true).', inputSchema: { type: 'object', properties: { nota: texto('Página de 13 Wiki'), titulo: texto('Sección a reemplazar'), texto: texto('Nuevo contenido de la sección') }, required: ['nota', 'titulo', 'texto'] }, run: (a) => reemplazarSeccion(a.nota, a.titulo, a.texto) },
  { name: 'registrar', ann: ESCRITURA, description: 'Agrega una entrada al Registro de la wiki (solo se agrega al final).', inputSchema: { type: 'object', properties: { tipo: texto('ingesta | consulta | revisión | edición'), titulo: texto('Qué se hizo'), paginas: { type: 'array', items: { type: 'string' } } }, required: ['tipo', 'titulo'] }, run: (a) => registrar(a) },
  { name: 'marcar_resultado', ann: ESCRITURA, description: 'Marca cómo resultó una respuesta guardada (util, sin_salida o corregida, con la corrección). Alimenta las lecciones.', inputSchema: { type: 'object', properties: { nota: texto('Página de 13 Wiki/Respuestas'), resultado: texto('util | sin_salida | corregida'), correccion: texto('Si fue corregida: la respuesta correcta') }, required: ['nota', 'resultado'] }, run: (a) => marcarResultado(a) },
  { name: 'medicion', ann: LECTURA, description: 'Cuántos tokens ha ahorrado la herramienta, al leer y al escribir, medido llamada a llamada.', inputSchema: { type: 'object', properties: {} }, run: () => medicion() },
];
const INSTRUCCIONES =
  'Bóveda de Obsidian de una persona (vida personal, estudio y entrenamiento), en español. Para ahorrar tokens: ' +
  '1) al empezar, `lecciones`; 2) `buscar` antes de abrir cualquier nota; 3) lee solo la `seccion` que necesitas; 4) recorre el grafo con `vecinos`, `explorar` o `camino`; ' +
  '5) para datos personales, `datos`; 6) para escribir en la wiki usa `crear_pagina`, `agregar_a_seccion` y `reemplazar_seccion`, nunca reescribas una página entera. Reglas completas en AGENTS.md.';
function servidorMcp() {
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
        if (m.method === 'initialize') ok({ protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'raiz-boveda', version: VERSION }, instructions: INSTRUCCIONES });
        else if (m.method === 'ping') ok({});
        else if (m.method === 'tools/list') ok({ tools: HERRAMIENTAS.map(({ name, description, inputSchema, ann }) => ({ name, description, inputSchema, annotations: ann })) });
        else if (m.method === 'tools/call') {
          const h = HERRAMIENTAS.find((x) => x.name === m.params?.name);
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
            'Escribir (solo 13 Wiki): crear <clase> <título> --resumen "…" [--fuentes a,b --cuerpo "…"] · agregar <nota> <sección> <texto> · reemplazar <nota> <sección> <texto> · registrar <tipo> <título> [--paginas a,b] · marcar <nota> <util|sin_salida|corregida>\n' +
            'Otros: medicion · estado · mcp'
        );
    }
  } catch (e) {
    out(`error: ${e.message}`);
    process.exitCode = 1;
  }
}
if (require.main === module) principal();
module.exports = { buscar, seccion, esqueleto, vecinos, explorar, camino, datos, lecciones, crearPagina, agregarASeccion, reemplazarSeccion, registrar, marcarResultado, medicion, estado, cargarIndice, tokens };
