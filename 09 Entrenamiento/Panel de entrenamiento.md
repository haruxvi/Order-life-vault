---
cssclasses:
  - raiz-panel
banner: "[[banner-entrenamiento.svg]]"
banner-y: 50
content-start: 200
banner-height: 300
banner-fade: -75
banner-radius: 25
tipo: panel
semanas: 12
ejercicio: Press banca
coach: ""
coachFecha: 
---
# 🏋️ Panel de entrenamiento
**Ver últimas** `INPUT[number:semanas]` semanas · **Progresión de** `INPUT[text(placeholder(ejercicio)):ejercicio]`

```dataviewjs
if (window.raiz) await window.raiz.charts.trainingDashboard(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## 🧠 Coach
`BUTTON[raiz-coach, raiz-rutina]`
```meta-bind-button
id: raiz-coach
label: 🧠 Analizar mis últimas 4 semanas
style: primary
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:training-coach
```
```meta-bind-button
id: raiz-rutina
label: ➕ Nueva rutina
style: default
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:new-routine
```
Último análisis: `VIEW[{coachFecha}]`
```meta-bind
INPUT[editor(class(raiz-editor)):coach]
```

## 📋 Mis rutinas
```dataview
TABLE WITHOUT ID file.link AS Rutina, entreno AS Tipo
FROM "09 Entrenamiento/Rutinas"
SORT file.name ASC
```

## 📝 Cómo registrar
En tu nota diaria, sección **🏋️ Entrenamiento**:
1. Elige el tipo y aprieta **▶ Empezar** (cronómetro).
2. **📋 Rutina** carga los ejercicios con tu **última marca** de cada uno, o agrega ejercicios con el buscador (autocompleta con tu historial).
3. Ajusta kg y reps y marca **✓** al terminar cada serie: arranca el **descanso** con aviso y la serie queda registrada. Si superas tu mejor marca aparece **🔥 PR**.
4. **⏹ Terminar** guarda la duración. Elige tu **RPE**.

También puedes escribir a mano, una línea por ejercicio: `- Press banca: 4x8 @ 60kg` · `- Dominadas lastradas: 4x6 @ +10kg` · `- Plancha: 3x45s` · `- Trote: 5km 28min`.
