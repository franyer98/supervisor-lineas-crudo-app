# Supervisor de Líneas de Crudo (offline)

PWA para inspección de troncales/subtroncales, registro de fugas y anomalías con GPS, y reportes históricos. Funciona 100% sin conexión: todos los datos se guardan en el propio celular (IndexedDB), no hay backend.

## Probar en el celular (sin publicar nada)
1. Descarga el ZIP y descomprímelo en tu PC.
2. Súbelo a un repo de GitHub (igual que tus otros proyectos) y activa GitHub Pages, o simplemente ábrelo con una extensión tipo "Live Server".
3. Entra desde el navegador del celular a la URL. Toca el menú del navegador → **"Añadir a pantalla de inicio" / "Instalar app"**. Desde ahí se abre a pantalla completa como una app nativa.
4. La primera vez necesitas señal para que se descarguen los archivos y los tiles del mapa que visites. Después de eso, todo — formularios, fotos, GPS, historial — funciona sin internet.

## Notas importantes
- **Mapa offline**: los tiles (imagen del mapa) se guardan automáticamente en el celular a medida que los visitas con señal (zoom/paneo). Zonas nunca visitadas en línea aparecerán en blanco, pero los tramos, coordenadas y eventos siempre están disponibles offline aunque el mapa no cargue.
- **Fotos**: se comprimen automáticamente antes de guardarse para no llenar el almacenamiento del celular.
- **Exportar historial**: desde la pestaña "Historial" puedes descargar un CSV con todo lo registrado (abrible en Excel).
- **Respaldo de datos**: los datos viven en el navegador del celular. Si cambias de celular o borras datos del navegador, se pierden. Para un respaldo real conviene, más adelante, sincronizar contra un backend (como hiciste con Reporte Cuadrillas) — este proyecto está listo para agregar esa capa después sin rehacer el frontend.

## Empaquetar como APK (opcional, más adelante)
Esta misma PWA se puede convertir en un `.apk` instalable sin reescribir código, usando **PWABuilder** (pwabuilder.com): subes la URL publicada y genera el paquete Android listo para Play Store o instalación directa.

## Estructura
```
index.html      → vistas (Inicio, Tramos, Mapa, Historial) y formularios
css/styles.css  → identidad visual industrial
js/db.js        → capa de almacenamiento offline (IndexedDB)
js/app.js       → lógica de la app
manifest.json   → metadatos de instalación PWA
sw.js           → service worker (caché offline de app y mapa)
icons/          → íconos de la app
```
