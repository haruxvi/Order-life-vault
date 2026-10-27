---
cssclasses:
  - raiz-panel
tipo: panel
banner: "[[06 Plantillas/Banners/banner-academico.svg]]"
banner-y: 50
banner-height: 320
content-start: 210
banner-fade: -75
banner-radius: 22
---
# Proyectos

Tus proyectos de desarrollo, con su memoria: qué son, en qué estado quedaron, qué falta y qué se decidió. Los escribes tú y también tus agentes (Claude Code, Codex, OpenCode, Hermes…): al empezar una sesión leen solo lo necesario y al terminar dejan el estado al día. Así el próximo agente no parte de cero ni gasta tokens releyendo el repo.

```raiz-botones
🧩 Nuevo proyecto | comando: raiz:new-project
```

```base
properties:
  file.name:
    displayName: Proyecto
  note.estado:
    displayName: Estado
  note.resumen:
    displayName: Resumen
  note.stack:
    displayName: Tecnologías
  note.actualizado:
    displayName: Actualizado
filters:
  and:
    - tipo == "proyecto"
    - file.inFolder("14 Proyectos")
views:
  - type: table
    name: Proyectos
    order:
      - file.name
      - estado
      - resumen
      - stack
      - actualizado
    sort:
      - property: actualizado
        direction: DESC
  - type: cards
    name: Tarjetas
    order:
      - file.name
      - estado
      - resumen
```

## Cómo lo usa un agente
1. **Al empezar**, pide el contexto del proyecto con una sola llamada: estado actual, pendientes, últimas decisiones y lo aprendido, en unos 600 tokens. No abre la nota entera.
2. **Al terminar**, reemplaza **Estado actual**, agrega a **Decisiones** y **Pendientes**, y guarda en la memoria solo lo que sirva la próxima vez.

Para que lo haga solo, abre un proyecto y usa el botón **Instrucciones para tu agente**: copia las órdenes exactas, con la ruta de este vault, para pegarlas en el `AGENTS.md` o `CLAUDE.md` del repo.

## Cada proyecto tiene
| Sección | Quién la escribe | Cómo |
|---|---|---|
| Contexto | Tú | Qué es, para quién y por qué. |
| Estado actual | Tú o el agente | Se reemplaza entera al terminar cada sesión. |
| Pendientes | Ambos | Se agrega. |
| Decisiones | Ambos | Una viñeta por decisión, con fecha y motivo. Solo se agrega. |
| Aprendizajes | Ambos | Errores, trucos y comandos que conviene recordar. |

Si quieres que un agente solo pueda agregar (y nunca reemplazar) en un proyecto, ponle `revisado: true` en sus propiedades. Las notas de tus proyectos no se suben a GitHub.
