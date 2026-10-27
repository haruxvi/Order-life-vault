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

```raiz-botones
Capturar | comando: raiz:capture | icono: inbox
Página de estudio | comando: raiz:new-study-page | icono: book-open
Evento | comando: raiz:new-event | icono: calendar-plus | estilo: secundario
Preparar mi espacio | comando: raiz:prepare-workspace | icono: layout-panel-left | estilo: secundario
```

## Hoy
```dataviewjs
if (window.raiz) await window.raiz.charts.home(dv, this.container); else dv.paragraph("Cargando…");
```

---
[[Panel académico|Académico]] · [[Panel de entrenamiento|Entrenamiento]] · [[Agenda]] · [[Bandeja]] · [[Biblioteca]] · [[Conocimiento]] · [[Proyectos]] · [[Agentes]] · [[Mi espacio]] · [[Guía Raíz|Guía]]
