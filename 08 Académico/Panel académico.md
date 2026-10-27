---
cssclasses:
  - raiz-panel
banner: "[[banner-academico.svg]]"
banner-y: 50
content-start: 200
banner-height: 300
banner-fade: -75
banner-radius: 25
tipo: panel
semestre: 
---
# Panel académico
```raiz-botones
Nueva asignatura | comando: raiz:new-course | icono: plus
```
**Semestre** `INPUT[text(placeholder(vacío = el más reciente)):semestre]` ·

```dataviewjs
if (window.raiz) await window.raiz.charts.academicDashboard(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## Pendientes de los ramos
```dataview
TASK
FROM "08 Académico"
WHERE !completed AND !pond AND text != ""
GROUP BY file.link
```

## Historial
```dataview
TABLE WITHOUT ID file.link AS Asignatura, semestre AS Semestre, estado AS Estado, creditos AS Créditos
FROM "08 Académico"
WHERE contains(tipo, "asignatura")
SORT semestre DESC, file.name ASC
```
