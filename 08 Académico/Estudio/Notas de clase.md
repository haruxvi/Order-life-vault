---
cssclasses:
  - raiz-estudio
tipo: estudio
clase: coleccion
padre: "[[Informática]]"
categoria: ""
estado: En curso
importancia:
numero:
fecha: 2026-10-19
icono: pencil-line
resumen: Una página por asignatura, con sus clases dentro.
tags:
  - estudio
---
```dataviewjs
if (window.raiz) await window.raiz.charts.pageHeader(dv, this.container); else dv.paragraph("Cargando…");
```

## Entradas
```meta-bind-button
label: "Nueva entrada"
icon: plus
style: default
class: raiz-btn raiz-new-entry
actions:
  - type: command
    command: raiz:new-child
```
```base
properties:
  file.name:
    displayName: Página
  note.clase:
    displayName: Tipo
  note.categoria:
    displayName: Categoría
  note.estado:
    displayName: Estado
  note.importancia:
    displayName: Importancia
  note.numero:
    displayName: N°
  note.fecha:
    displayName: Fecha
  note.resumen:
    displayName: Resumen
  note.revisado:
    displayName: Revisado
filters:
  and:
    - tipo == "estudio"
    - if(padre.isType("link"), padre.linksTo(this.file), false)
views:
  - type: table
    name: Todas las notas
    order:
      - file.name
      - numero
      - revisado
      - estado
      - importancia
      - resumen
    sort:
      - property: numero
        direction: ASC
  - type: table
    name: Por número de curso
    order:
      - numero
      - file.name
      - fecha
      - estado
    groupBy:
      property: estado
      direction: ASC
    sort:
      - property: numero
        direction: ASC
  - type: cards
    name: Tarjetas
    order:
      - file.name
      - categoria
      - estado
    image: note.banner
    imageFit: cover
    cardSize: 200
  - type: list
    name: Lista simple
    order:
      - file.name
```
