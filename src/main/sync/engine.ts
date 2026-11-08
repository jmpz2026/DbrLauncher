import { pool, safeJoin } from '../util'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { ManifestFile, SyncProgress, SyncSummary } from '../../shared/sync'
import { flushHashCache, sha1FileCached } from './hash'
import { fetchManifest } from './manifest'
import { ensureFile, partFor } from '../net'
import { CONFIG } from '../../shared/config'
import { aplicarLang, langActual } from './lang'
import { PATCH_MIN_SIZE, modKey, tryPatch } from './patch'

export interface SyncOptions {
  gameDir: string // dónde viven los mods/configs
  managedFile: string // índice JSON de archivos gestionados
  manifestUrl: string
  // Re-aplicar los archivos de siembra (`once`) aunque ya existan. Se usa al cambiar de
  // variante del modpack, cuando el jugador acepta la config recomendada de la nueva.
  reseed?: boolean
  // Idioma de Minecraft (es_ES, en_US, pt_BR) para la primera siembra de options.txt: el
  // elegido en el launcher o el del sistema. Sin él, no se toca el lang: del archivo.
  langInicial?: string
  /** Cancela la sync. Lo bajado a medias queda en `.part` y la próxima sync sigue desde ahí. */
  signal?: AbortSignal
}

type OnProgress = (p: SyncProgress) => void

// Nº de descargas/verificaciones simultáneas. Igual criterio que installAssets:
// en serie son decenas de archivos uno a uno = lentísimo en el primer install.
const CONCURRENCY = 8

function loadManaged(managedFile: string): string[] {
  try {
    const j = JSON.parse(readFileSync(managedFile, 'utf-8')) as { files?: unknown }
    return Array.isArray(j.files) ? (j.files as string[]) : []
  } catch {
    return []
  }
}

function saveManaged(managedFile: string, files: string[]): void {
  writeFileSync(managedFile, JSON.stringify({ files }), 'utf-8')
}

export { safeJoin }

/** Sincroniza los archivos locales con el manifest. Reporta progreso por callback. */
export async function runSync(opts: SyncOptions, onProgress: OnProgress): Promise<SyncSummary> {
  const { gameDir, managedFile, manifestUrl, reseed = false, langInicial, signal } = opts
  const manifest = await fetchManifest(manifestUrl)
  mkdirSync(gameDir, { recursive: true })

  // 1) Comprobar qué archivos hay que descargar (faltan o SHA1 distinto).
  // El sha1 en disco se calcula en paralelo: es I/O + CPU, en serie tarda en modpacks grandes.
  // Los `once` (siembra) no se comparan por hash: se bajan solo si faltan, para no pisar la
  // configuración que el jugador haya tocado. Con `reseed` sí se vuelven a aplicar.
  const checkTotal = manifest.files.length
  const needed: boolean[] = new Array(checkTotal).fill(false)
  let checked = 0
  await pool(manifest.files, CONCURRENCY, async (f, i) => {
    signal?.throwIfAborted()
    const dest = safeJoin(gameDir, f.path)
    let needs = true
    if (existsSync(dest)) {
      needs = f.once
        ? reseed
        : f.sha1
          ? (await sha1FileCached(dest)) !== f.sha1.toLowerCase()
          : false
    }
    needed[i] = needs
    onProgress({ phase: 'check', file: f.path, done: ++checked, total: checkTotal })
  })
  const toDownload: ManifestFile[] = manifest.files.filter((_, i) => needed[i])
  // options.txt se re-siembra al cambiar de variante: se guarda antes el idioma del jugador.
  const opciones = toDownload.find((f) => f.once && f.path === 'options.txt')
  const langPrevio = opciones ? langActual(safeJoin(gameDir, opciones.path)) : null

  // 2) Determinar archivos obsoletos: gestionados antes pero ya no en el manifest.
  // Los `once` no entran nunca en el índice de gestionados: así jamás se borran del equipo
  // (son del jugador), ni siquiera si desaparecen del manifest.
  const managedPaths = manifest.files.filter((f) => !f.once).map((f) => f.path)
  // En Windows el disco no distingue mayúsculas: un renombrado que solo cambia la caja
  // ('Foo.jar' -> 'foo.jar') apunta al mismo archivo, y borrar el «viejo» borraba el mod.
  const norm = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p)
  const wantedPaths = new Set(manifest.files.map((f) => norm(f.path)))
  const toDelete = loadManaged(managedFile).filter((p) => !wantedPaths.has(norm(p)))

  const total = toDownload.length + toDelete.length
  let done = 0

  // Temporales de syncs anteriores que ya no sirven (otra versión del archivo, parches a
  // medias). Los de lo que hay que bajar ahora se quedan: la descarga sigue donde quedó.
  const keepParts = new Set(toDownload.filter((f) => f.sha1).map((f) => partFor(safeJoin(gameDir, f.path), f.sha1!)))
  for (const dir of new Set(manifest.files.map((f) => dirname(safeJoin(gameDir, f.path))))) {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const n of names) {
      const full = join(dir, n)
      if ((n.endsWith('.part') || n.endsWith('.patched')) && !keepParts.has(full)) rmSync(full, { force: true })
    }
  }

  // 3) Descargar en paralelo (pool acotado). `done` es un contador compartido: como JS es
  // monohilo entre awaits, el ++ no compite; solo la barra ve el orden de finalización.
  // La barra va por bytes (con el `size` del manifest) y el texto nombra el archivo que lleva
  // más tiempo bajando: con solo archivos terminados, un jar lento en un POP frío del CDN
  // dejaba la barra quieta y el nombre de un config de 1 KB que ya había acabado.
  const knownSizes = toDownload.every((f) => typeof f.size === 'number')
  let bytesTotal = knownSizes ? toDownload.reduce((s, f) => s + (f.size ?? 0), 0) : 0
  const received = new Map<string, number>() // bytes por archivo; un reintento lo devuelve a 0
  const expected = new Map<string, number>() // lo que se espera bajar de cada archivo
  /** Un archivo pasa a bajar `bytes` (el parche en vez del jar, o al revés). */
  const expect = (path: string, bytes: number): void => {
    if (!knownSizes) return
    bytesTotal += bytes - (expected.get(path) ?? 0)
    expected.set(path, bytes)
  }
  for (const f of toDownload) expected.set(f.path, f.size ?? 0)
  const inFlight = new Set<string>() // orden de inserción = orden de arranque
  let lastEmit = 0
  const emit = (force = false): void => {
    const now = Date.now()
    if (!force && now - lastEmit < 100) return // no inundar el IPC con cada chunk
    lastEmit = now
    let bytesDone = 0
    for (const n of received.values()) bytesDone += n
    const current = inFlight.values().next().value ?? ''
    onProgress({
      phase: 'download',
      file: current,
      done,
      total,
      inFlight: Math.max(0, inFlight.size - 1),
      bytesDone: Math.min(bytesDone, bytesTotal),
      bytesTotal
    })
  }
  await pool(toDownload, CONCURRENCY, async (f) => {
    inFlight.add(f.path)
    emit(true)
    try {
      const dest = safeJoin(gameDir, f.path)
      // Jar grande con su versión anterior en el disco: basta un parche de ~3 MB en vez de 47.
      // Candidatos: el mismo archivo (cambió el contenido) o el obsoleto del mismo mod (cambió
      // el nombre); los obsoletos se borran después, así que aún están.
      if (f.sha1 && (f.size ?? 0) >= PATCH_MIN_SIZE && /\.jar$/i.test(f.path)) {
        const key = modKey(f.path)
        const candidates = [dest, ...toDelete.filter((p) => modKey(p) === key).map((p) => safeJoin(gameDir, p))]
        const patched = await tryPatch(dest, f.sha1.toLowerCase(), candidates, (n, t) => {
          if (t > 0) expect(f.path, t)
          received.set(f.path, n)
          emit()
        }, signal)
        if (patched) {
          received.set(f.path, expected.get(f.path) ?? 0)
          return
        }
        expect(f.path, f.size ?? 0)
        received.set(f.path, 0)
      }
      // El release de assets guarda cada archivo con su sha1 por nombre: si raw bloquea la IP
      // del jugador, se baja de ahí. Un sha1 aún sin subir da 404 y se pasa al siguiente mirror.
      const mirrors = f.sha1 ? [CONFIG.assetMirrorBase + f.sha1.toLowerCase()] : []
      await ensureFile(
        dest,
        f.url,
        f.sha1,
        (n) => {
          received.set(f.path, n)
          emit()
        },
        mirrors,
        { size: f.size, signal }
      )
      received.set(f.path, f.size ?? 0)
    } finally {
      inFlight.delete(f.path)
      done++
      emit(true)
    }
  })

  if (opciones && langInicial !== undefined) {
    aplicarLang(safeJoin(gameDir, opciones.path), langPrevio, langInicial)
  }

  // 4) Borrar obsoletos. Si uno no se puede borrar (en Windows, un jar abierto por un juego
  // que sigue corriendo) se queda en el índice para reintentarlo en la próxima sync. Antes el
  // fallo se tragaba y el archivo salía del índice: quedaba huérfano para siempre, y un mod
  // viejo junto al nuevo (o sin sus dependencias, tras cambiar de variante) tumba el arranque.
  const pending: string[] = []
  for (const p of toDelete) {
    onProgress({ phase: 'delete', file: p, done, total })
    const dest = safeJoin(gameDir, p)
    try {
      rmSync(dest)
    } catch {
      if (existsSync(dest)) pending.push(p)
    }
    done++
  }

  saveManaged(managedFile, [...managedPaths, ...pending])
  flushHashCache()
  if (pending.length) {
    // Lanzar con el mod viejo todavía en la carpeta rompe el arranque: mejor parar aquí.
    throw new Error(
      `No se pudo borrar ${pending.join(', ')}. Cierra Minecraft si sigue abierto y vuelve a intentarlo.`
    )
  }
  onProgress({ phase: 'done', file: '', done: total, total })
  return { updated: toDownload.length, removed: toDelete.length, version: manifest.version }
}
