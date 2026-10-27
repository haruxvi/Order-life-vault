---
banner: "[[banner-mes-2.svg]]"
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
```raiz-botones
← Mes anterior | abrir: 03 Mensual/2026/2026-09-septiembre
T4 2026 | abrir: 04 Trimestral/2026/2026-Q4
Mes siguiente → | abrir: 03 Mensual/2026/2026-11-noviembre
```

```meta-bind
INPUT[text(placeholder('Ponle nombre a tu mes'), class('raiz-input-big')):alias]
```

## Resumen
```meta-bind
INPUT[editor(class(raiz-editor)):resumen]
```
```raiz-botones
Resumir | comando: raiz:summarize-current | icono: sparkles
Título | comando: raiz:ai-title | icono: tag
```

## Calendario
```dataviewjs
if (window.raiz) await window.raiz.charts.monthCalendar(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## Valoraciones
```dataviewjs
if (window.raiz) await window.raiz.charts.ratingChart(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## Registro
```dataviewjs
if (window.raiz) await window.raiz.charts.periodLogs(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## Fotos
```dataviewjs
if (window.raiz) await window.raiz.charts.gallery(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## Semanas
```dataviewjs
if (window.raiz) await window.raiz.charts.periodTable(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## Entrenamiento
```dataviewjs
if (window.raiz) await window.raiz.charts.periodTraining(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## Hábitos
```dataviewjs
if (window.raiz) await window.raiz.charts.periodHabits(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## Rueda de la Vida
```dataviewjs
if (window.raiz) await window.raiz.charts.wheelChart(dv, this.container); else dv.paragraph("Cargando Raíz…");
```
**Ver como:** `INPUT[inlineSelect(option(line, líneas), option(bar, barras), option(radar, radar), option(pie, torta)):tipoGrafico]`
```dataviewjs
if (window.raiz) await window.raiz.charts.wheelProgression(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

### Pregúntale a tu mes
`INPUT[text(placeholder('Escribe una pregunta…'), class('raiz-input-big')):pregunta]`
```raiz-botones
Preguntar | comando: raiz:ask-note | icono: search
```
```meta-bind
INPUT[editor(class(raiz-editor)):respuesta]
```
