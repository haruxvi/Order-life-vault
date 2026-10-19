---
cssclasses:
  - raiz-estudio
tipo: estudio
clase: tema
padre: "[[Conocimientos informáticos extra]]"
categoria: Lenguaje
estado: En curso
importancia: 4
numero:
fecha: 2026-10-19
icono: layers
resumen: ""
tags:
  - estudio
---
```dataviewjs
if (window.raiz) await window.raiz.charts.pageHeader(dv, this.container); else dv.paragraph("Cargando…");
```

## Contenido
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
filters:
  and:
    - tipo == "estudio"
    - if(padre.isType("link"), padre.linksTo(this.file), false)
views:
  - type: table
    name: Todo
    order:
      - file.name
      - clase
      - categoria
      - estado
      - importancia
      - resumen
    sort:
      - property: file.name
        direction: ASC
  - type: table
    name: Por categoría
    order:
      - file.name
      - clase
      - estado
    groupBy:
      property: categoria
      direction: ASC
    sort:
      - property: file.name
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
