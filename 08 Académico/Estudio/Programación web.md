---
cssclasses:
  - raiz-estudio
tipo: estudio
clase: asignatura
padre: "[[Notas de clase]]"
categoria: Informática
estado: En curso
importancia:
numero: 2
fecha: 2026-10-19
icono: book-open
resumen: ""
tags:
  - estudio
revisado: false
---
```dataviewjs
if (window.raiz) await window.raiz.charts.pageHeader(dv, this.container); else dv.paragraph("Cargando…");
```

## Notas de clase
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
    name: Todas las notas
    order:
      - file.name
      - numero
      - fecha
      - estado
      - importancia
      - resumen
    sort:
      - property: numero
        direction: ASC
  - type: table
    name: Por número de clase
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

## Páginas
[[Microservicios 27-03]]

```dataviewjs
if (window.raiz) await window.raiz.charts.pageCard(dv, this.container, { ruta: "08 Académico/Estudio/Spring orientado al desarrollo web.md" });
```
