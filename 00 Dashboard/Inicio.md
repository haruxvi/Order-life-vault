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
# ✦ Inicio

`BUTTON[raiz-captura, raiz-evento, raiz-asignatura, raiz-rutina]`
```meta-bind-button
id: raiz-captura
label: "📥 Capturar"
style: primary
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:capture
```
```meta-bind-button
id: raiz-evento
label: 📅 Evento
style: primary
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:new-event
```
```meta-bind-button
id: raiz-asignatura
label: 🎓 Asignatura
style: primary
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:new-course
```
```meta-bind-button
id: raiz-rutina
label: 🏋️ Rutina
style: primary
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:new-routine
```

```dataviewjs
if (window.raiz) await window.raiz.charts.home(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

---
[[Panel académico|🎓 Académico]] · [[Panel de entrenamiento|🏋️ Entrenamiento]] · [[Agenda|📅 Agenda]] · [[Bandeja|📥 Bandeja]] · [[Biblioteca|📚 Biblioteca]] · [[Conocimiento|🧠 Conocimiento]] · [[Ideas de preguntas para la IA|🔎 Preguntas]] · [[Guía Raíz|📖 Guía]]
