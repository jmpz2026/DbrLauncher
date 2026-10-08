// Copia cada archivo de los manifests como asset del release `assets-files`, con su sha1 por
// nombre. El launcher lo usa de mirror cuando raw.githubusercontent bloquea la IP del jugador
// (403): los assets de un release se sirven desde objects.githubusercontent.com, otra red.
//
// Por sha1 y no por ruta: los nombres de asset son planos y únicos, y lite/experimental tienen
// jars con el mismo nombre y distinto contenido. Además así los packs comparten copia.
//
// Sube los sha1 que falten y borra los que ya no cita ningún manifest. Lo corre la Action
// mirror-assets.yml en cada push a la rama assets; necesita `gh` con GH_TOKEN.

import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const TAG = 'assets-files'
const MANIFESTS = ['manifest.json', 'manifest-lite.json', 'manifest-experimental.json']
const BRANCH_PREFIX = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/assets\//

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] })

// sha1 -> ruta local dentro de la rama
const wanted = new Map()
for (const name of MANIFESTS) {
  if (!existsSync(name)) continue
  const m = JSON.parse(readFileSync(name, 'utf-8'))
  for (const f of [...(m.files ?? []), ...(m.androidFiles ?? [])]) {
    if (!f.sha1 || !BRANCH_PREFIX.test(f.url)) continue
    const rel = f.url.replace(BRANCH_PREFIX, '').split('/').map(decodeURIComponent).join('/')
    wanted.set(f.sha1.toLowerCase(), rel)
  }
}
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

let removed = 0
for (const name of existing) {
  if (wanted.has(name)) continue
  gh('release', 'delete-asset', TAG, name, '--yes')
  removed++
}

console.log(`Listo: ${uploaded} subidos, ${removed} borrados, ${wanted.size} en total`)
