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
coach: |-
  # Cómo vas
  Esta semana has dado un paso adelante en tu entrenamiento del torso. Aprender una nueva técnica de abdominales ha sido beneficioso y te permite ver progresos pequeños pero reales.

  ## Progresos
  - Has subido el número de series en ejercicios específicos para los músculos del abdomen, lo que indica un aumento en la resistencia y fortaleza.
    
  ## Estancados o en riesgo
  - No has notado cambios significativos en tu fuerza en los abdominales. La fatiga acumulada podría estar afectando tus resultados.

  ## Plan para la próxima semana
  1. Realiza 3 series de 8 repeticiones cada una con 50% de descarga, centrándote especialmente en el estiramiento y contracción de los músculos del abdomen.
  2. Aprende un nuevo ejercicio para los glúteos para equilibrar tu entrenamiento.
  3. Incorpora ejercicios alternativos para los deltoides, que han sido menos demandados durante este período.
  4. Planifica tu día con anticipación y asegúrate de tener una hora de descanso antes de la siesta.
  5. Trata de evitar el uso de dispositivos electrónicos por al menos 30 minutos antes de acostarte para mejorar tu calidad de sueño.

  Meta: 4 sesiones por semana.
coachFecha: 2026-10-27
---
# Panel de entrenamiento
**Ver últimas** `INPUT[number:semanas]` semanas · **Progresión de** `INPUT[text(placeholder(ejercicio)):ejercicio]`

```dataviewjs
if (window.raiz) await window.raiz.charts.trainingDashboard(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

## Coach
```raiz-botones
Analizar mis últimas 4 semanas | comando: raiz:training-coach | icono: brain
Nueva rutina | comando: raiz:new-routine | icono: plus | estilo: secundario
```
Último análisis: `VIEW[{coachFecha}]`
```meta-bind
INPUT[editor(class(raiz-editor)):coach]
```

## Mis rutinas
```dataview
TABLE WITHOUT ID file.link AS Rutina, entreno AS Tipo
FROM "09 Entrenamiento/Rutinas"
SORT file.name ASC
```

## Cómo registrar
En tu nota diaria, sección **🏋️ Entrenamiento**:
1. Elige el tipo y aprieta **▶ Empezar** (cronómetro).
2. **📋 Rutina** carga los ejercicios con tu **última marca** de cada uno, o agrega ejercicios con el buscador (autocompleta con tu historial).
3. Ajusta kg y reps y marca **✓** al terminar cada serie: arranca el **descanso** con aviso y la serie queda registrada. Si superas tu mejor marca aparece **🔥 PR**.
4. **⏹ Terminar** guarda la duración. Elige tu **RPE**.

También puedes escribir a mano, una línea por ejercicio: `- Press banca: 4x8 @ 60kg` · `- Dominadas lastradas: 4x6 @ +10kg` · `- Plancha: 3x45s` · `- Trote: 5km 28min`.
