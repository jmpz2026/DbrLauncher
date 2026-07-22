# Parches al upstream vendorizado (ZalithLauncher2)

Cambios propios sobre la fuente de ZalithLauncher2 (`UPSTREAM.txt` = commit base).
Mantener esta lista al día para poder re-aplicar tras sincronizar upstream.

## 1) `formatted="false"` en strings multi-sustitución (2026-07-22)
**Motivo:** AAPT2 de `build-tools;37.0.0` trata como ERROR los strings con múltiples `%`
no posicionales (`Multiple substitutions specified in non-positional format`). El upstream
no compilaba con build-tools 37 sin esto.

**Cambio:** añadido `formatted="false"` a estos dos strings en los 23 archivos de recursos
(`values/` y todos los `values-*/`):
- `terracotta_notification_desc` (`.../res/**/terracotta.xml`)
- `file_invalid_length` (`.../res/**/strings.xml`)

Inocuo en runtime (siguen usándose con `String.format` posicional en orden).

## 2) Rebrand DbrLauncherMobile + aviso legal (2026-07-22)
**Motivo:** Fase 2 — marca DBR y cumplimiento de los Términos Adicionales §7 de la GPL-3
de ZalithLauncher2 (renombrar, no usar "ZalithLauncher"/"ZL", mostrar "Unofficial Modified
Version" en arranque, conservar avisos de copyright).

- `ZalithLauncher/gradle.properties`: `launcher_name=DbrLauncherMobile`,
  `launcher_app_name=DbrLauncher Mobile`, `launcher_short_name=DBR`,
  `url_home=https://dragonblock.online`.
- `ZalithLauncher/build.gradle.kts`: `applicationId = "online.dragonblock.launchermobile"`,
  eliminado `applicationIdSuffix = ".v2"`. **namespace interno sigue** `com.movtery.zalithlauncher`
  (NO se refactoriza el paquete de código; evita romper R/BuildConfig).
- Aviso "Unofficial Modified Version" en la pantalla de arranque
  (`ui/screens/splash/SplashScreen.kt`, bajo el nombre del launcher) + string
  `unofficial_modified_version` en `values/strings.xml`.
- Icono adaptive → logo DBR: `drawable-nodpi/dbr_logo.png` (copia de `build/icon.png`),
  `mipmap-anydpi-v26/ic_launcher*.xml` foreground → `@drawable/dbr_logo`, fondo
  `ic_launcher_background=#101014`, quitado `monochrome` (era silueta ZL). Los webp legacy
  quedan sin usar (minSdk 26 usa siempre el adaptive). *Icono básico; refinar padding/monochrome después.*
- Avisos de copyright de upstream (cabeceras de archivos, LICENSE, README) **conservados**.
