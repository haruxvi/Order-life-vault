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

const VERSION = '1.0.0';
const CACHE_VERSION = 3;
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
  const nota = { rel, bytes: st.size, mtime: st.mtimeMs, fm: { tipo: uno(fm.tipo), clase: uno(fm.clase), resumen: uno(fm.resumen), revisado: uno(fm.revisado), tags: uno(fm.tags) }, privada: esPrivada(fm), enlaces, secciones: [] };
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
function buscar(consulta, limite = 8) {
  const idx = cargarIndice();
  const q = [...new Set(tokens(consulta))];
  if (!q.length) return 'Escribe palabras con contenido (no solo artículos o preposiciones).';
  limite = Math.max(1, Math.min(Number(limite) || 8, 20));
  const { docs, post, prom } = invertido(idx);
  if (!docs.length) return 'El vault no tiene notas indexables.';
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
  if (!elegidos.length) return `Sin resultados para "${consulta}". Prueba con sinónimos o menos palabras.`;
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
  const L = [`${elegidos.length} sección(es) para "${consulta}" (de ${idx.notas.length} notas). Lee una sección completa con \`seccion\` solo si la necesitas.`, ''];
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
  const dev = filas.reduce((a, f) => a + f.devueltos, 0);
  const comp = filas.reduce((a, f) => a + f.completos, 0);
  const L = [
    `${filas.length} consulta(s) medidas desde ${filas[0].ts.slice(0, 10)}.`,
    `Devuelto: ~${tok(dev)} tokens. Abrir esas mismas notas completas: ~${tok(comp)} tokens.${comp ? ` Ahorro medido: ${Math.max(0, Math.round((1 - dev / comp) * 100))} %.` : ''}`,
    'La comparación es contra abrir solo las notas que aparecieron en cada respuesta, no contra el vault entero: es la cifra más conservadora.',
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
const HERRAMIENTAS = [
  { name: 'buscar', description: 'Busca en todo el vault y devuelve las secciones más relevantes (ruta:línea, título y un fragmento). Úsala ANTES de abrir notas: cuesta lo mismo con 100 o con 10.000 notas.', inputSchema: { type: 'object', properties: { consulta: { type: 'string', description: 'Palabras clave o pregunta' }, limite: { type: 'number', description: 'Secciones a devolver (1-20, por defecto 8)' } }, required: ['consulta'] }, run: (a) => buscar(a.consulta, a.limite) },
  { name: 'seccion', description: 'Lee una sola sección de una nota (por su título), no la nota entera. Sin título devuelve el esqueleto.', inputSchema: { type: 'object', properties: { nota: { type: 'string', description: 'Ruta o nombre de la nota' }, titulo: { type: 'string', description: 'Título de la sección (basta una parte)' } }, required: ['nota'] }, run: (a) => seccion(a.nota, a.titulo) },
  { name: 'esqueleto', description: 'Resumen, propiedades y lista de secciones de una nota, sin el contenido. Para decidir qué sección leer.', inputSchema: { type: 'object', properties: { nota: { type: 'string' } }, required: ['nota'] }, run: (a) => esqueleto(a.nota) },
  { name: 'vecinos', description: 'Las notas que una nota enlaza y las que la enlazan, cada una con su resumen de una línea. Recorre el grafo sin abrir las notas.', inputSchema: { type: 'object', properties: { nota: { type: 'string' }, limite: { type: 'number' } }, required: ['nota'] }, run: (a) => vecinos(a.nota, a.limite) },
  { name: 'datos', description: 'Datos diarios de la persona (sueño, peso, metas, ánimo, entrenamiento…) como tabla CSV, filtrados por fechas y columnas. En vez de leer notas diarias.', inputSchema: { type: 'object', properties: { desde: { type: 'string', description: 'AAAA-MM-DD' }, hasta: { type: 'string', description: 'AAAA-MM-DD' }, columnas: { type: 'string', description: 'Separadas por coma, ej. sueno,peso' } } }, run: (a) => datos(a) },
  { name: 'medicion', description: 'Cuántos tokens ha ahorrado la herramienta, medido llamada a llamada.', inputSchema: { type: 'object', properties: {} }, run: () => medicion() },
];
const INSTRUCCIONES =
  'Bóveda de Obsidian de una persona (vida personal, estudio y entrenamiento), en español. Para ahorrar tokens: ' +
  '1) usa `buscar` antes de abrir cualquier nota; 2) lee con `seccion` solo la parte que necesitas; 3) recorre enlaces con `vecinos` en vez de abrir notas; ' +
  '4) para datos personales usa `datos`. Las reglas completas están en AGENTS.md.';
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
        else if (m.method === 'tools/list') ok({ tools: HERRAMIENTAS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } })) });
        else if (m.method === 'tools/call') {
          const h = HERRAMIENTAS.find((x) => x.name === m.params?.name);
          if (!h) err(-32602, `Herramienta desconocida: ${m.params?.name}`);
          else ok({ content: [{ type: 'text', text: h.run(m.params.arguments || {}) }] });
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
function principal() {
  const args = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
  const [cmd, ...resto] = args;
  const out = (t) => process.stdout.write(t + '\n');
  switch (cmd) {
    case 'buscar':
      return out(buscar(resto.join(' '), opcion('limite')));
    case 'seccion':
      return out(seccion(resto[0], resto.slice(1).join(' ')));
    case 'esqueleto':
      return out(esqueleto(resto.join(' ')));
    case 'vecinos':
      return out(vecinos(resto.join(' '), opcion('limite')));
    case 'datos':
      return out(datos({ desde: opcion('desde'), hasta: opcion('hasta'), columnas: opcion('columnas') }));
    case 'medicion':
      return out(medicion());
    case 'estado':
      return out(estado());
    case 'mcp':
      return servidorMcp();
    default:
      out(`boveda ${VERSION} — consulta el vault gastando pocos tokens.\nComandos: buscar <consulta> · seccion <nota> <título> · esqueleto <nota> · vecinos <nota> · datos [--desde --hasta --columnas] · medicion · estado · mcp`);
  }
}
if (require.main === module) principal();
module.exports = { buscar, seccion, esqueleto, vecinos, datos, medicion, estado, cargarIndice, tokens };
