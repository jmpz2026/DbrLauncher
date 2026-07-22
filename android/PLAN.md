# DbrLauncherMobile — Plan (fork de ZalithLauncher2)

Puerto Android del launcher de escritorio DbrLauncher. Rama: `android-zalith`.

## Decisiones cerradas
| Tema | Elección |
|---|---|
| Nombre del fork | **DbrLauncherMobile** |
| Base | **ZalithLauncher2** (Kotlin + Jetpack Compose, motor PojavLauncher, Android 8+) |
| Auto-update del launcher | **Sideload APK + self-updater** propio (con gate obligatorio) |
| Cuentas | **Microsoft premium + offline/pirata** |
| Layout en el repo | **Hard fork vendorizado** en `android/` |

## ⚠️ Restricción legal (bloqueante)
ZalithLauncher2 = **GPL-3.0 + cláusula extra**. El fork DEBE:
1. Renombrarse (hecho: "DbrLauncherMobile", no "Zalith").
2. Mostrar aviso **"Unofficial Modified Version"** dentro de la app.
3. Publicar el código del fork bajo **GPL-3** (repo público).
4. Conservar créditos/licencia de ZalithLauncher y PojavLauncher.

Consecuencia: el APK Android será open-source obligatoriamente.

## Qué se reusa vs. qué se reescribe
- ✅ **DBR-ASSETS 100% reusado**: `manifest.json`, `news.json`, `forge-1.7.10.json`, hosting de mods/config. Mismo formato y host.
- 🔁 **Reescrito en Kotlin**: sync engine, self-updater, news, server ping.
- 🎨 **Reskin en Compose**: branding DBR sobre las pantallas de ZL2.
- ❌ **No se reusa**: Electron, electron-updater, descarga de JRE (ZL2 ya trae Java 8/17/21), instalador Forge de escritorio.

## Mapeo feature escritorio → Android
| Feature actual (escritorio) | En Android | Esfuerzo |
|---|---|---|
| Sync mods obligatorio (manifest + SHA1 + borrar obsoletos) | Portar `runSync` a Kotlin, correr antes de lanzar | Alto — núcleo |
| Auto-update del launcher (forzado) | Self-updater APK (version.json → Releases → PackageInstaller) | Medio |
| JRE 8 auto-descarga | ZL2 ya trae Java 8 → solo seleccionar | Bajo |
| Forge 1.7.10 install | Crear instancia MC 1.7.10 + Forge 10.13.4.1614 auto | Medio |
| Auth MS + offline | Reusar de ZL2, reskin | Bajo |
| Settings RAM/res/JVM | Reusar de ZL2 (por instancia) | Bajo |
| Renderer switch (max compat) | ZL2 ya multi-renderer → añadir presets + UX DBR | Medio |
| News feed | Portar fetch `news.json` a pantalla Compose | Bajo |
| Server status ping | Portar SLP ping (dragonblock.online:25625) a Kotlin | Bajo |
| Branding/Discord | Rebrand Compose + link | Bajo |
| Controles táctiles (nuevo) | Layout de control por defecto para 1.7.10 | Medio |

## Fases

**Fase 0 — Entorno**
- Android SDK + NDK + JDK17 (Gradle). Verificar que `gradlew` corre.
- `android/README-DEV.md` con requisitos de build.

**Fase 1 — Vendorizar + build baseline**
- Clonar ZalithLauncher2 en `android/` (hard fork, sin `.git` interno).
- Compilar APK debug **sin cambios** → confirmar toolchain.
- `android/UPSTREAM.txt` con el commit/tag base para sincronizaciones manuales.

**Fase 2 — Rebrand + cumplimiento legal**
- Renombrar app/paquete (propuesta: `online.dragonblock.launchermobile`), icono (reusar `build/icon.png`), splash, tema Compose DBR.
- Pantalla/aviso "Unofficial Modified Version" + créditos ZL2/Pojav + GPL-3.
- Link Discord.

**Fase 3 — Instancia DBR automática**
- Primer arranque: crear instancia fija **MC 1.7.10 + Forge 10.13.4.1614**, runtime **Java 8**, renderer default **Holy GL4ES**.
- Ocultar selector de versiones; el usuario solo ve "DBR". Una instancia gestionada.

**Fase 4 — Sync de mods obligatorio (núcleo)**
- Port de `runSync` a Kotlin: fetch `manifest.json`, comparar SHA-1 (`MessageDigest`), descargar faltantes/cambiados (OkHttp), borrar obsoletos, índice `managed.json` en el dir de la instancia. `safeJoin` anti path-traversal.
- **Gate obligatorio**: si el sync falla, bloquear "Jugar" con error. Barra de progreso Compose.
- Evaluar si `manifest.json` sirve para móvil o hace falta `manifest-android.json` (coremods 1.7.10 que glitcheen en GL4ES). Empezar con el mismo.

**Fase 5 — Self-updater del launcher**
- Nuevo `version.json` en DBR-ASSETS: `{versionCode, versionName, apkUrl, mandatory, changelog}`.
- Al arrancar: fetch → si `versionCode` remoto > local y `mandatory` → pantalla bloqueante, baja APK a caché, lanza PackageInstaller. No-mandatory → banner opcional.
- Permiso `REQUEST_INSTALL_PACKAGES` + guía "permitir instalar apps de esta fuente". (Android exige confirmación del usuario; gate obligatorio pero no 100% silencioso.)

**Fase 6 — Renderers / máxima compatibilidad**
- Selector "Motor de render" en Home con presets:
  - *Máx compatibilidad* → Holy GL4ES (default 1.7.10).
  - *Rendimiento* → Vulkan Zink.
  - Sugerencia por GPU (Adreno/Mali/Exynos).
- Auto-detectar vendor GPU al primer arranque y proponer default.
- Hint "¿pantalla negra? prueba otro motor". Opción plugin **MobileGlues** + drivers **AdrenoTools** (Turnip) para Adreno 7xx.
- Backends de ZL2 (Krypton/GL4ES/Zink/VirGL/Freedreno/Panfrost) accesibles en Ajustes avanzados.

**Fase 7 — News + estado del server**
- Pantalla News: fetch `news.json` (reuso directo).
- Ping SLP a `dragonblock.online:25625` en Kotlin → online/jugadores en Home.

**Fase 8 — Settings, auth y controles**
- Defaults DBR: RAM auto según dispositivo (~2-3GB), resolución, args JVM G1GC.
- Reusar login MS (device code) + offline de ZL2, reskin.
- Layout de controles táctiles por defecto para DBC/1.7.10 (mouse virtual + teclas clave).

**Fase 9 — CI + releases**
- GitHub Actions: build APK (Gradle+NDK), firma con keystore (secrets), publicar en Releases por tag `android-vX.Y.Z`, actualizar `version.json`. Espejo del flujo de release por tag actual.

**Fase 10 — QA multi-dispositivo**
- Matriz Adreno / Mali / Exynos + gama baja/alta. Verificar arranque, sync, cada renderer, RAM baja.

## Riesgos / expectativas
- **1.7.10 + DBC/JRMCore** usa render immediate-mode → GL4ES cubre casi todo, algún efecto puede glitchear. Por eso el switch de renderer es central.
- **RAM móvil**: ~2-3GB; gama baja puede crashear (Error Code 1). Documentar mínimo.
- **Self-update**: Android nunca instala 100% silencioso; el usuario confirma. Obligatorio = bloquear hasta aceptar.
- **Mantenimiento upstream**: hard fork = sincronizar ZL2 a mano (`UPSTREAM.txt`).

## Orden de arranque
Fases 0-1 (entorno + APK baseline sin cambios) → luego 2→4 (rebrand + sync obligatorio) = MVP jugable con updates de mods forzados.
