---
cssclasses:
  - raiz-panel
tipo: nota
mapa: {{mapaYaml}}
fuente: "{{fuente}}"
creada: {{fecha}}
resumen: ""
importancia:
icono: lightbulb
tags:
{{tagsYaml}}
---
```dataviewjs
if (window.raiz) await window.raiz.charts.pageHeader(dv, this.container); else dv.paragraph("Cargando…");
```
**Mapa:** {{mapa}} · **Fuente:** {{fuente}}
**En una frase:** `INPUT[text(placeholder(La idea en una línea…)):resumen]`
```raiz-botones
Generar preguntas | comando: raiz:generate-cards | icono: layers
Conexiones | comando: raiz:open-connections | icono: link | estilo: secundario
```

## La idea
%% Explícala con tus palabras, como si se la contaras a alguien. Una idea por nota. %%
- 

## Ejemplo
- 

## Se conecta con
%% Enlaza otras notas con [[ ]] y explica POR QUÉ se relacionan. Así funciona tu memoria. %%
- 
