---
cssclasses:
  - raiz-panel
banner:
  - - banner-inicio.svg
banner-y: 10
banner-x: 30
content-start: 200
banner-display: cover
banner-repeat: true
banner-height: 300
banner-fade: -75
banner-radius: 25
---
```dataviewjs
if (window.raiz) await window.raiz.charts.hub(dv, this.container); else dv.paragraph("Cargando…");
```

`BUTTON[raiz-captura, raiz-pagina, raiz-evento, raiz-espacio]`
```meta-bind-button
id: raiz-captura
label: "Capturar"
icon: inbox
style: primary
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:capture
```
```meta-bind-button
id: raiz-pagina
label: "Página de estudio"
icon: book-open
style: primary
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:new-study-page
```
```meta-bind-button
id: raiz-evento
label: "Evento"
icon: calendar-plus
style: default
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:new-event
```
```meta-bind-button
id: raiz-espacio
label: "Preparar mi espacio"
icon: layout-panel-left
style: default
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:prepare-workspace
```

## Hoy
```dataviewjs
if (window.raiz) await window.raiz.charts.home(dv, this.container); else dv.paragraph("Cargando…");
```

---
[[Panel académico|Académico]] · [[Panel de entrenamiento|Entrenamiento]] · [[Agenda]] · [[Bandeja]] · [[Biblioteca]] · [[Conocimiento]] · [[Mi espacio]] · [[Guía Raíz|Guía]]
