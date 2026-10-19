---
banner: "[[06 Templates/Banners/banner-mes-2.svg]]"
banner-y: 50
banner-height: 320
content-start: 210
banner-fade: -75
banner-radius: 22
cssclasses:
  - raiz-mes
  - monthly
tipo: mensual
date: 2026-10-01
alias:
pregunta:
respuesta: ""
resumen: ""
tipoGrafico: line
---
# Octubre 2026
[[2026-Q4|]]
`BUTTON[raiz-ant, raiz-sup, raiz-sig]`
```meta-bind-button
id: raiz-ant
label: "← Mes anterior"
style: primary
class: raiz-btn
hidden: true
actions:
  - type: open
    link: "[[03 Monthly/2026/2026-09-septiembre]]"
    newTab: false
```
```meta-bind-button
id: raiz-sup
label: "T4 2026"
style: primary
class: raiz-btn
hidden: true
actions:
  - type: open
    link: "[[04 Quarterly/2026/2026-Q4]]"
    newTab: false
```
```meta-bind-button
id: raiz-sig
label: "Mes siguiente →"
style: primary
class: raiz-btn
hidden: true
actions:
  - type: open
    link: "[[03 Monthly/2026/2026-11-noviembre]]"
    newTab: false
```

```meta-bind
INPUT[text(placeholder('Ponle nombre a tu mes'), class('raiz-input-big')):alias]
```

## 📝 Resumen
```meta-bind
INPUT[editor(class(raiz-editor)):resumen]
```
`BUTTON[raiz-ia-resumen, raiz-ia-titulo]`
```meta-bind-button
id: raiz-ia-resumen
label: "✨ Resumir"
style: primary
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:summarize-current
```
```meta-bind-button
id: raiz-ia-titulo
label: "🏷️ Título"
style: primary
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:ai-title
```

## 📅 Calendario
```dataviewjs
if (window.raiz) await window.raiz.charts.monthCalendar(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## 📊 Valoraciones
```dataviewjs
if (window.raiz) await window.raiz.charts.ratingChart(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## 🗒️ Registro
```dataviewjs
if (window.raiz) await window.raiz.charts.periodLogs(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## 📷 Fotos
```dataviewjs
if (window.raiz) await window.raiz.charts.gallery(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## 🗓️ Semanas
```dataviewjs
if (window.raiz) await window.raiz.charts.periodTable(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## 🏋️ Entrenamiento
```dataviewjs
if (window.raiz) await window.raiz.charts.periodTraining(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## ✅ Hábitos
```dataviewjs
if (window.raiz) await window.raiz.charts.periodHabits(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## 🌟 Rueda de la Vida
```dataviewjs
if (window.raiz) await window.raiz.charts.wheelChart(dv, this.container); else dv.paragraph("Cargando Raíz…");
```
**Ver como:** `INPUT[inlineSelect(option(line, líneas), option(bar, barras), option(radar, radar), option(pie, torta)):tipoGrafico]`
```dataviewjs
if (window.raiz) await window.raiz.charts.wheelProgression(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

### 🔎 Pregúntale a tu mes
`INPUT[text(placeholder('Escribe una pregunta…'), class('raiz-input-big')):pregunta]`
`BUTTON[raiz-preguntar]`
```meta-bind-button
id: raiz-preguntar
label: "🔎 Preguntar"
style: primary
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:ask-note
```
```meta-bind
INPUT[editor(class(raiz-editor)):respuesta]
```

