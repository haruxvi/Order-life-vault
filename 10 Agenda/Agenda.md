---
cssclasses:
  - raiz-panel
banner: "[[banner-inicio.svg]]"
banner-y: 50
content-start: 200
banner-height: 300
banner-fade: -75
banner-radius: 25
tipo: panel
---
# 📅 Agenda
`BUTTON[raiz-evento]`
```meta-bind-button
id: raiz-evento
label: ➕ Nuevo evento o reunión
style: primary
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:new-event
```

## Próximos 60 días
```dataviewjs
if (window.raiz) await window.raiz.charts.agenda(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## Este mes
```dataviewjs
if (window.raiz) await window.raiz.charts.monthCalendar(dv, this.container, { month: moment().format("YYYY-MM") }); else dv.paragraph("Cargando Raíz…");
```

## ⏰ Tareas con fecha
```dataview
TASK
WHERE !completed AND vence
SORT vence ASC
```

## 🗂️ Eventos pasados
```dataview
TABLE WITHOUT ID file.link AS Evento, fecha AS Fecha, categoria AS Tipo
FROM "10 Agenda"
WHERE contains(tipo, "evento") AND fecha < date(today)
SORT fecha DESC
LIMIT 30
```
