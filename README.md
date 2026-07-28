# Supervisor de Líneas — App Android (Capacitor)

Versión empacada como app nativa Android de [supervisor-lineas-crudo](https://github.com/franyer98/supervisor-lineas-crudo), con **grabación de recorrido GPS en segundo plano real** (funciona con la pantalla bloqueada), usando `@capacitor-community/background-geolocation`.

## Descargar el APK
No necesitas instalar nada en tu PC. Cada vez que se sube código a `main`, GitHub Actions compila el APK automáticamente:

1. Ve a la pestaña **Actions** de este repo.
2. Entra a la ejecución más reciente de "Build APK" (ícono verde ✔ = compiló bien).
3. Baja hasta **Artifacts** y descarga `supervisor-lineas-debug-apk`.
4. Descomprime el `.zip`, obtén el `app-debug.apk`, pásalo a tu celular e instálalo (Android pedirá permitir "instalar apps de origen desconocido" la primera vez).

## ¿Por qué APK de depuración (debug) y no "release"?
El APK de debug se instala y funciona igual de bien para uso personal/de campo. Un APK "release" firmado es el paso siguiente solo si algún día quieres publicarlo en Google Play.

## Estructura
```
www/                        → copia de la app web (misma fuente que GitHub Pages)
android/                    → proyecto Android generado por Capacitor
capacitor.config.json       → configuración de la app nativa
.github/workflows/build-apk.yml → compila el APK en la nube en cada push
```

## Actualizar la app
1. Edita los archivos dentro de `www/` (o copia ahí los cambios hechos en el repo `supervisor-lineas-crudo`).
2. `npm install` (solo la primera vez) y `npx cap sync android`.
3. `git add -A && git commit -m "..." && git push`.
4. Espera 3-5 minutos y descarga el nuevo APK desde Actions.

## Permisos que pide la app
- Ubicación precisa (todo el tiempo) — necesaria para grabar el recorrido con la pantalla bloqueada.
- Notificaciones — Android exige mostrar un aviso persistente mientras el GPS corre en segundo plano; es un requisito del sistema, no se puede ocultar.
