# DbrLauncherMobile — Guía de build (dev)

Fork de ZalithLauncher2 (ver `UPSTREAM.txt`). Fuente vendorizada en `android/ZalithLauncher2/`.

## Toolchain requerido
- **JDK 17+** para correr Gradle. En esta máquina se usa `C:\Program Files\Java\jdk-21.0.10` (JDK 21 sirve; AGP 9.2 acepta 17+).
- **Android SDK** en `C:\Android\sdk` (fuera del repo, sin espacios). Paquetes:
  - `platforms;android-37.0`, `build-tools;37.0.0`, `platform-tools`, `ndk;25.2.9519653`
- Gradle 9.4.1 (lo baja el wrapper), AGP 9.2.0.

## ⚠️ Gotcha crítico: espacios en la ruta
El repo vive en `C:\Users\Junior\Documents\Java Projects\DbrLauncher` — **tiene un espacio** ("Java Projects").
`ndk-build` NO soporta espacios en `APP_BUILD_SCRIPT` y el build nativo falla
(`Your APP_BUILD_SCRIPT points to an unknown file`). AGP canonicaliza cualquier junction
de vuelta a su ruta real, así que un junction *hacia* la ruta con espacios no ayuda.

**Solución (invertida):** la fuente real vive en `C:\dev\dbr-android` (sin espacios) y
`android/ZalithLauncher2` es un **junction** hacia allí. Git rastrea los archivos a través
del junction como contenido normal. **Se buildea desde `C:\dev\dbr-android`.**

Recrear el junction si se pierde (PowerShell):
```powershell
New-Item -ItemType Junction -Path 'C:\Users\Junior\Documents\Java Projects\DbrLauncher\android\ZalithLauncher2' -Target 'C:\dev\dbr-android'
```

## Build
```bash
cd /c/dev/dbr-android
export JAVA_HOME="/c/Program Files/Java/jdk-21.0.10"
export ANDROID_HOME=C:/Android/sdk
# Debug APK (una sola ABI para ir rápido; usa 'all' para todas)
./gradlew ZalithLauncher:assembleDebug -Darch=arm64 --no-daemon
```
Salida: `ZalithLauncher/build/outputs/apk/debug/*-<abi>.apk`.
El APK debug se firma solo con `zalith_launcher_debug.jks` (password por defecto en
`ZalithLauncher/gradle.properties`), no necesita secrets. OAuth/CurseForge quedan vacíos
(solo warnings) hasta configurarlos.

ABIs válidas para `-Darch`: `all`, `arm`, `arm64`, `x86`, `x86_64`.

## local.properties
`android/ZalithLauncher2/local.properties` (gitignored) apunta al SDK con forward slashes:
```
sdk.dir=C:/Android/sdk
```
(Ojo: NO usar backslashes escapados a mano; `.properties` los colapsa y rompe la ruta del NDK.)
