---
cssclasses:
  - raiz-panel
tipo: mapa
temas:
{{temasYaml}}
tags:
  - mapa
---
# {{titulo}}
{{descripcion}}

**Etiquetas que reúne:** `INPUT[list:temas]`

```dataviewjs
if (window.raiz) await window.raiz.charts.moc(dv, this.container); else dv.paragraph("Cargando Raíz…");
```

[[Conocimiento|]]

## Todas las notas del tema
```dataviewjs
if (window.raiz) await window.raiz.charts.topicTable(dv, this.container); else dv.paragraph("Cargando…");
```

## Ruta sugerida
%% Ordena aquí las notas clave en el orden en que conviene leerlas. %%
1. 
