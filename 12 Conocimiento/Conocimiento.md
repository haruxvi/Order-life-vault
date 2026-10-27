---
cssclasses:
  - raiz-panel
banner: "[[banner-conocimiento.svg]]"
banner-y: 50
content-start: 200
banner-height: 300
banner-fade: -75
banner-radius: 25
---
# Conocimiento
Una idea por nota, conectada a un **mapa** (MOC) o a una asignatura. Los enlaces valen más que las carpetas: si una nota no se conecta con nada, no la vas a volver a encontrar.

```raiz-botones
Preguntar al vault | comando: raiz:ask-vault | icono: search
Panel de conexiones | comando: raiz:open-connections | icono: link | estilo: secundario
Indexar para la IA | comando: raiz:index-vault | icono: sparkles | estilo: secundario
```
[[Repaso|🃏 Repaso]] · [[Etiquetas|🏷️ Etiquetas]] · [[Bandeja|📥 Bandeja]]

```dataviewjs
if (window.raiz) await window.raiz.charts.knowledgeHome(dv, this.container); else dv.paragraph("Cargando Raíz…");
```
