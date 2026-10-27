---
cssclasses:
  - raiz-panel
tipo: panel
banner: "[[06 Plantillas/Banners/banner-conocimiento.svg]]"
banner-y: 50
banner-height: 320
content-start: 210
banner-fade: -75
banner-radius: 22
---
# Agentes

La memoria de tus agentes y de los sistemas de varios agentes (un orquestador que reparte el trabajo entre otros): qué pasó en cada ejecución, cuánto costó y lo que vale la pena recordar. La escribe la herramienta `boveda` y tú la ves aquí. El panel se actualiza solo mientras haya una ejecución en curso.

```raiz-agentes
```

## Cómo se conecta un orquestador
`boveda.js` está en `.obsidian/plugins/raiz/` de este vault y encuentra el vault sola, esté donde esté. Sirve por terminal o como servidor MCP (`node …/boveda.js mcp --perfil orquestador`).

| Momento | Herramienta MCP | Terminal | Responde |
|---|---|---|---|
| Empezar | `ejecucion` iniciar | `ejecucion iniciar "meta" --tope 10 --plazo 07:40` | El id y lo que ya se sabe de algo parecido |
| Cada paso | `ejecucion` evento | `ejecucion evento <id> <agente> <tipo> "qué pasó" --costo 0.001` | `ok · 3 eventos · $0.05 de $10` o **DETENER** |
| Antes de la tarea de un agente | `memoria` contexto | `memoria contexto "tarea" --presupuesto 600` | Solo los recuerdos que tocan esa tarea |
| Algo que sirva la próxima vez | `memoria` guardar | `memoria guardar error "…"` | El id, o "ya lo sabía" si estaba |
| Terminar | `ejecucion` cerrar | `ejecucion cerrar <id> hecha "resumen"` | La nota de la ejecución, lista |

- **DETENER** llega cuando se alcanza el tope de gasto o pasa el plazo: el orquestador debe cerrar la ejecución.
- **Perfiles MCP:** cada definición de herramienta viaja en cada vuelta del agente. Los trabajadores usan `--perfil agente` (5 herramientas, ~900 tokens por vuelta) y quien coordina, `--perfil orquestador` (~1.150).
- Si tu orquestador anota muchísimos pasos, puede escribir el registro directamente, sin llamar a `boveda`: una línea JSON por evento al final de `Registros/<id>.jsonl`, por ejemplo `{"ts":"2026-10-27T23:40:03Z","agente":"grok-bot","tipo":"tool_call","texto":"x.stream_search → 214 posts","costo_usd":0.001}`.

## Las carpetas
| Carpeta | Qué hay |
|---|---|
| `Ejecuciones/` | Un resumen por ejecución: meta, estado, gasto, decisiones, errores y costo por agente. Lo encuentra `buscar`. |
| `Registros/` | El registro completo de cada ejecución, una línea por evento. Solo crece. |
| `Memoria/` | Los recuerdos: una o dos frases cada uno, de un proyecto o generales. Nada se borra a mano: se olvida con `memoria olvidar`. |

Nada de esto se sube a GitHub. Los recuerdos que parecen claves o contraseñas se rechazan: las claves viven en el Llavero de Obsidian.
