---
cssclasses:
  - raiz-estudio
tipo: estudio
clase: {{clase}}
padre: {{padre}}
categoria: {{categoria}}
estado: En curso
importancia:
numero: {{numero}}
fecha: {{fecha}}
icono: {{icono}}
resumen: ""
tags:
  - estudio
---
```dataviewjs
if (window.raiz) await window.raiz.charts.pageHeader(dv, this.container); else dv.paragraph("Cargando…");
```

{{vistas}}
