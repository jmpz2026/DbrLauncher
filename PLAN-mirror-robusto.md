# Plan: mirror de assets robusto (DBR-ASSETS, rama `assets`)

## Contexto

Las Actions `Mirror de assets` de los commits `ed741fe` y `5c90c66` (2026-11-13 00:26) fallaron.

- **Causa directa:** `ed741fe` dejó `"sha1": "\7490ff42..."` en `manifest-experimental.json`. Esa barra invertida es la que pone `sha1sum` de Git Bash cuando la ruta lleva `\`. El JSON quedó inválido.
- **Por qué el arreglo también falló:** `mirror-assets.mjs:100` lee los manifests de `HEAD~1` para hacer los parches delta, y `JSON.parse` (línea 37) no está dentro del `try`. Un manifest roto en el commit anterior tumba también el commit que lo arregla.
- **Efecto oculto:** el paso R2 corre solo si el paso del release sale bien. R2 es la fuente principal del launcher. Desde `7a099ba`, R2 sirve manifests viejos, así que el arreglo de la manga 5.9.1 no llegó a los jugadores por R2.
- **Causa raíz del proceso:** los scripts de despliegue (`_deploy/*/desplegar.py`, `subir.py`) y las ediciones a mano parchean el texto del manifest con replace, sin pasar por `gen-manifest.mjs` y sin validar. Nada impide commitear ni pushear un manifest roto. Además, raw.githubusercontent sirve la rama al instante, así que un manifest roto llega a los jugadores antes de que la Action diga nada.
- **Fallo secundario de los parches:** se calculan solo contra `HEAD~1`. Si un push trae varios commits, o si un run falla, se pierden los parches de esa transición. El jugador baja el jar entero, que pesa unos 47 MB.

## Cambios

### 1. Validador compartido `tools/check-manifests.mjs` (nuevo)
- Para cada `manifest*.json` existente:
  - el JSON parsea;
  - `files`/`androidFiles` es un array;
  - cada entrada tiene `path`, `url`, `sha1` que cumple `/^[0-9a-f]{40}$/` y `size` entero;
  - no hay `path` duplicados.
- Si la URL apunta a la rama, el archivo local existe y su `size`/sha1 real coinciden. El sha1 se calcula con `crypto`, así que funciona igual en Windows y en Linux.
- Sale con código 1 y un mensaje claro: manifest, path y qué está mal.
- Lo usan los 4 sitios siguientes.

### 2. `.github/scripts/mirror-assets.mjs`
- `manifestFiles`: si el `JSON.parse` de un manifest **anterior** falla, avisa y lo salta (sin parches para ese manifest). Si falla el **actual**, el error se mantiene.
- Base de los parches: `BASE_SHA` (= `github.event.before`) en lugar de `HEAD~1`. Si no existe, si es todo ceros o si no está en el clon, usa `HEAD~1`. Así un push de varios commits genera parches contra lo que tenían los jugadores.

### 3. `.github/workflows/mirror-assets.yml`
- Paso nuevo al inicio: `node tools/check-manifests.mjs`. Falla temprano con un mensaje legible.
- `fetch-depth: 0`, o suficiente para alcanzar `event.before`. Se pasa `BASE_SHA: ${{ github.event.before }}`.
- Paso R2 con `if: ${{ !cancelled() }}`: aunque falle el release, R2 recibe los manifests buenos. Los archivos los sube del checkout y, si faltan parches, solo se pierde el delta. Hay que verificarlo leyendo `mirror-r2.mjs` antes de cambiarlo.

### 4. Pre-commit local `tools/hooks/pre-commit` (nuevo)
- Corre `check-manifests.mjs` si el commit toca un `manifest*.json` o un jar.
- Se activa con `git config core.hooksPath tools/hooks`. `actualizar.bat` lo configura solo en cada corrida.

### 5. `actualizar.bat`
- `git -C "%REPO%" fetch origin main` antes de sacar `gen-manifest.mjs`. Hoy usa el `main` local, que puede estar viejo. Si no hay red, solo avisa.
- Comprueba que la rama actual sea `assets` y hace `git pull --rebase` antes de generar, para evitar un push rechazado.
- `node tools\check-manifests.mjs` después de generar y antes del commit.
- Revisa `errorlevel` del `git commit`.
- `git add` de forma explícita (pendiente de tu decisión).
- Al final, `gh run watch` del mirror (pendiente de tu decisión).

### 6. Una sola forma de cambiar un jar (pendiente de tu decisión)
- `tools/poner-jar.mjs <canal> <jar>`:
  - copia el jar a `mods/`, `lite/mods/` o `experimental/mods/`;
  - borra el anterior del mismo mod;
  - recalcula sha1/size;
  - reescribe con `JSON.stringify`;
  - valida.
- Los `_deploy/*.py` futuros lo llaman en vez de hacer replace de texto. Actualizar la skill o la doc de deploy que genera esos scripts (por ubicar).

### 7. Recuperación inmediata
- El push del arreglo dispara el mirror. Su base es `5c90c66`, que es válido. Así se resincronizan el release y R2 con la manga 5.9.1.

## Archivos
- `tools/check-manifests.mjs` (nuevo)
- `tools/hooks/pre-commit` (nuevo)
- `tools/poner-jar.mjs` (nuevo, opcional)
- `.github/scripts/mirror-assets.mjs`
- `.github/workflows/mirror-assets.yml`
- `actualizar.bat`
- Fuera del repo: la plantilla o skill de `_deploy`

## Verificación
1. `node tools/check-manifests.mjs` sobre los manifests actuales: pasa.
2. Copia temporal con `"\7490..."`: falla y nombra el archivo y el path.
3. `git show ed741fe:manifest-experimental.json` pasado al `manifestFiles` nuevo: avisa y no lanza.
4. Commit de prueba con un manifest roto: el pre-commit lo bloquea. Después, deshacer.
5. Push a `assets`: la Action pasa los 3 pasos. `gh release view assets-files` muestra el sha1 `7490ff42...`. El manifest de R2 (`m/manifest-experimental.json`) trae 5.9.1.

## Decisiones del usuario (2026-11-13)
- Para cambiar un jar se usa `tools/poner-jar.mjs`. Los deploys lo llaman y no hacen replace de texto.
- `actualizar.bat` usa `git add` con rutas explícitas: `manifest*.json`, `forge-1.7.10.json`, `news.json`, `mods`, `config`, `resourcepacks`, `lite`, `experimental`, `android`, `options*.txt`, `CREDITOS.txt`, `LICENCIAS`.
- `actualizar.bat` espera la Action con `gh run watch --exit-status` después del push.

## Primer paso al aprobar
Copiar este plan a `DBR-ASSETS/PLAN-mirror-robusto.md` y crear `DBR-ASSETS/CLAUDE.md` con un puntero a ese archivo. Después, implementar en el orden de las secciones 1 a 6 y luego el push (sección 7). El push queda pendiente de tu OK.

## Bitácora
- 2026-11-13: diagnóstico hecho y plan escrito. Decisiones tomadas: poner-jar, add explícito y watch.
- 2026-11-13: secciones 1-6 hechas y probadas localmente:
  - check-manifests detecta el `\7490` y un size distinto;
  - la base de parches en modo lenient lee `ed741fe` sin lanzar;
  - el pre-commit bloquea un manifest roto;
  - poner-jar con el mismo jar deja el manifest byte a byte igual, y con versión nueva renombra y borra el jar viejo;
  - las partes de actualizar.bat corren en cmd, y el archivo pasó a CRLF.
  - Cambio sobre el plan: no se usa `fetch-depth: 0` (el repo pesa unos 363 MB). Un paso aparte trae solo `github.event.before` con depth 1.
  - Siguiente paso: commit y push a `assets` (pendiente del OK). Después, ver que la Action pase los 4 pasos y que R2 sirva la 5.9.1.
