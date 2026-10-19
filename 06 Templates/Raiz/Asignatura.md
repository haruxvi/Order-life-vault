---
cssclasses:
  - raiz-estudio
tipo: asignatura
clase: asignatura
icono: book-open
importancia:
nombre: "{{nombre}}"
codigo: "{{codigo}}"
semestre: "{{semestre}}"
profesor: "{{profesor}}"
creditos: 
horario:
{{horarioYaml}}
notaAprobacion: {{notaAprobacion}}
estado: cursando
tags:
  - asignatura
---
```dataviewjs
if (window.raiz) await window.raiz.charts.pageHeader(dv, this.container); else dv.paragraph("Cargando…");
```
**Estado** `INPUT[inlineSelect(option(cursando), option(aprobada), option(reprobada), option(convalidada)):estado]` · **Créditos** `INPUT[number:creditos]` · **Aprobación** `INPUT[number:notaAprobacion]`

```dataviewjs
if (window.raiz) await window.raiz.charts.courseStatus(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

[[Panel académico|]]

## Evaluaciones
%% Una evaluación por línea, igual que los ejemplos: nombre y luego los campos tipo (certamen, control, tarea, laboratorio, proyecto o examen), pond (porcentaje), fecha (AAAA-MM-DD) y nota. Cuando tengas la nota, escríbela y marca la casilla. %%
- [ ] Certamen 1 [tipo:: certamen] [pond:: 30] [fecha:: ] [nota:: ]
- [ ] Certamen 2 [tipo:: certamen] [pond:: 30] [fecha:: ] [nota:: ]
- [ ] Controles [tipo:: control] [pond:: 20] [fecha:: ] [nota:: ]
- [ ] Tareas y laboratorios [tipo:: tarea] [pond:: 20] [fecha:: ] [nota:: ]

## Pendientes del ramo
- [ ] 

## Notas de clase
```base
properties:
  file.name:
    displayName: Página
  note.numero:
    displayName: N°
  note.fecha:
    displayName: Fecha
  note.estado:
    displayName: Estado
  note.importancia:
    displayName: Importancia
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
  - type: list
    name: Lista simple
    order:
      - file.name
```

## Apuntes conectados
🃏 Repasa sus preguntas en [[Repaso]] (elige este ramo arriba; si se acerca un certamen aparece el **modo certamen**).
%% Crea apuntes con "Raíz: Nueva nota de conocimiento" y elige esta asignatura como mapa. %%
```dataviewjs
if (window.raiz) await window.raiz.charts.moc(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## En mi diario
```dataview
LIST alias
FROM [[]] AND "01 Daily"
SORT file.name DESC
```
