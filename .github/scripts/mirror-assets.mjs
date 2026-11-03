// Copia cada archivo de los manifests como asset del release `assets-files`, con su sha1 por
// nombre. El launcher lo usa de mirror cuando raw.githubusercontent bloquea la IP del jugador
// (403): los assets de un release se sirven desde objects.githubusercontent.com, otra red.
//
// Por sha1 y no por ruta: los nombres de asset son planos y únicos, y lite/experimental tienen
// jars con el mismo nombre y distinto contenido. Además así los packs comparten copia.
//
// Sube los sha1 que falten y borra los que ya no cita ningún manifest. Lo corre la Action
// mirror-assets.yml en cada push a la rama assets; necesita `gh` con GH_TOKEN.
//
// Además sube parches delta `<sha1viejo>-<sha1nuevo>.dbrpatch` de los jars grandes que cambiaron
// respecto al commit anterior (ver make-patches.mjs): el launcher baja ~2-3 MB en vez de 47.

import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { PATCH_MIN_SIZE, applyPatch, makePatch, modKey, sha1 as sha1Of } from './make-patches.mjs'

const TAG = 'assets-files'
const MANIFESTS = ['manifest.json', 'manifest-lite.json', 'manifest-experimental.json']
const BRANCH_PREFIX = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/assets\//

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] })

/** Archivos de los manifests: [{ path, sha1, rel }], con rel = ruta dentro de la rama. */
function manifestFiles(read) {
  const out = []
  for (const name of MANIFESTS) {
    let text
    try {
      text = read(name)
    } catch {
      continue
    }
    const m = JSON.parse(text)
    for (const f of [...(m.files ?? []), ...(m.androidFiles ?? [])]) {
      if (!f.sha1 || !f.path || !BRANCH_PREFIX.test(f.url)) continue
      const rel = f.url.replace(BRANCH_PREFIX, '').split('/').map(decodeURIComponent).join('/')
      out.push({ path: f.path, sha1: f.sha1.toLowerCase(), rel })
    }
  }
  return out
}

const current = manifestFiles((name) => readFileSync(name, 'utf-8'))

// sha1 -> ruta local dentro de la rama
const wanted = new Map()
for (const f of current) wanted.set(f.sha1, f.rel)
console.log(`${wanted.size} archivos distintos en los manifests`)

try {
  gh('release', 'view', TAG, '--json', 'tagName')
} catch {
  // Prerelease y nunca "latest": electron-updater busca la actualización en /releases/latest,
  // así que este release no debe competir con los del launcher.
  gh(
    'release', 'create', TAG,
    '--target', 'assets',
    '--prerelease',
    '--latest=false',
    '--title', 'Mirror del modpack',
    '--notes', 'Copia automática de los archivos de la rama assets, nombrados por sha1. No es una versión del launcher.'
  )
}

const existing = new Set(
  gh('release', 'view', TAG, '--json', 'assets', '--jq', '.assets[].name').split('\n').filter(Boolean)
)

const tmp = join(tmpdir(), 'mirror-assets')
mkdirSync(tmp, { recursive: true })
let uploaded = 0
for (const [sha1, rel] of wanted) {
  if (existing.has(sha1)) continue
  if (!existsSync(rel)) {
    console.warn(`  falta en la rama: ${rel}`)
    continue
  }
  const buf = readFileSync(rel)
  // GitHub rechaza assets de 0 bytes (400 Bad Content-Length). Un archivo vacío no lo bloquea
  // nadie, así que no necesita mirror.
  if (buf.length === 0) continue
  const got = createHash('sha1').update(buf).digest('hex')
  if (got !== sha1) {
    console.warn(`  sha1 no coincide con el manifest, no se sube: ${rel}`)
    continue
  }
  const file = join(tmp, sha1)
  copyFileSync(rel, file)
  gh('release', 'upload', TAG, file, '--clobber')
  console.log(`  subido ${sha1}  ${rel}`)
  uploaded++
}

// Parches de los jars grandes contra su versión del commit anterior (necesita fetch-depth: 2).
const git = (...args) => execFileSync('git', args, { maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
const previous = manifestFiles((name) => git('show', `HEAD~1:${name}`).toString('utf-8'))
const keepPatches = new Set()
let patched = 0
for (const f of current) {
  if (!/\.jar$/i.test(f.path) || !existsSync(f.rel)) continue
  const newBuf = readFileSync(f.rel)
  if (newBuf.length < PATCH_MIN_SIZE || sha1Of(newBuf) !== f.sha1) continue
  const key = modKey(f.path)
  const olds = new Map() // sha1 viejo -> ruta en HEAD~1
  for (const o of previous) if (o.sha1 !== f.sha1 && modKey(o.path) === key) olds.set(o.sha1, o.rel)
  for (const [oldSha, oldRel] of olds) {
    const name = `${oldSha}-${f.sha1}.dbrpatch`
    // El mismo jar sale en varios manifests (full/lite/experimental): un parche por pareja.
    if (keepPatches.has(name)) continue
    keepPatches.add(name)
    if (existing.has(name)) continue
    let oldBuf
    try {
      oldBuf = git('show', `HEAD~1:${oldRel}`)
    } catch {
      // No está en el commit anterior con esa ruta: la copia del release (aún no podada).
      if (!existing.has(oldSha)) continue
      gh('release', 'download', TAG, '-p', oldSha, '-D', tmp, '--clobber')
      oldBuf = readFileSync(join(tmp, oldSha))
    }
    if (sha1Of(oldBuf) !== oldSha) continue
    const patch = makePatch(oldBuf, newBuf)
    if (!patch) {
      console.warn(`  no es un zip legible, sin parche: ${oldRel} -> ${f.rel}`)
      keepPatches.delete(name)
      continue
    }
    applyPatch(oldBuf, patch) // lanza si no reconstruye el jar nuevo
    if (patch.length > newBuf.length / 2) {
      console.log(`  parche demasiado grande (${patch.length} de ${newBuf.length}), no se sube: ${f.rel}`)
      keepPatches.delete(name)
      continue
    }
    const file = join(tmp, name)
    writeFileSync(file, patch)
    gh('release', 'upload', TAG, file, '--clobber')
    console.log(`  parche ${name}  ${oldRel} -> ${f.rel}  (${patch.length} de ${newBuf.length} bytes)`)
    patched++
  }
}

// Parches de pushes anteriores cuyo destino sigue en algún manifest: valen para quien aún tiene
// esa versión vieja.
for (const name of existing) {
  const m = /^[0-9a-f]{40}-([0-9a-f]{40})\.dbrpatch$/.exec(name)
  if (m && wanted.has(m[1])) keepPatches.add(name)
}

let removed = 0
for (const name of existing) {
  if (wanted.has(name) || keepPatches.has(name)) continue
  gh('release', 'delete-asset', TAG, name, '--yes')
  removed++
}

console.log(`Listo: ${uploaded} subidos, ${patched} parches, ${removed} borrados, ${wanted.size} en total`)
