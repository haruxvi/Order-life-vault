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

`BUTTON[raiz-ask, raiz-conn, raiz-index]` · [[Repaso|🃏 Repaso]] · [[Etiquetas|🏷️ Etiquetas]] · [[Bandeja|📥 Bandeja]]
```meta-bind-button
id: raiz-ask
label: "Preguntar al vault"
icon: search
style: primary
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:ask-vault
```
```meta-bind-button
id: raiz-conn
label: "Panel de conexiones"
icon: link
style: default
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:open-connections
```
```meta-bind-button
id: raiz-index
label: "Indexar para la IA"
icon: sparkles
style: default
class: raiz-btn
hidden: true
actions:
  - type: command
    command: raiz:index-vault
```

```dataviewjs
if (window.raiz) await window.raiz.charts.knowledgeHome(dv, this.container); else dv.paragraph("Cargando Raíz…");
```
