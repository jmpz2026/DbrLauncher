// Pone un jar nuevo en uno o varios canales del modpack y actualiza su entrada del manifest.
//
// Es la forma de cambiar un mod sin regenerar todo con actualizar.bat. Los scripts de despliegue
// (_deploy/*) lo llaman en vez de editar el texto del manifest: el sha1 y el size salen del
// archivo copiado (crypto, sin sha1sum) y el JSON se escribe con JSON.stringify. Así no se
// repite el "\7490..." del 2026-11-13.
//
// Uso:
//   node tools/poner-jar.mjs <canales> <jar> [--nuevo]
//     <canales>  full, lite, experimental o varios separados por coma (full,lite,experimental)
//     <jar>      ruta al jar nuevo, p. ej. ../DbrServerPack/build/libs/DbrServerPack-5.9.2.jar
//     --nuevo    el mod no estaba en el canal: añade la entrada en vez de fallar
//
// Por canal: busca en `files` la entrada mods/* del mismo mod (mismo nombre sin versión, ver
// modKey), copia el jar a <canal>/mods/, borra el jar viejo si tenía otro nombre y cambia path,
// url, sha1 y size de la entrada. El resto del manifest queda igual (mismo orden que
// gen-manifest.mjs). Al final valida con check-manifests.mjs.
// No hace commit ni push: eso queda para quien lo llama.

import { createHash } from 'crypto'
import { copyFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { modKey } from '../.github/scripts/make-patches.mjs'
import { checkManifests, relFromUrl } from './check-manifests.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CANALES = {
  full: { manifest: 'manifest.json', dir: '' },
  lite: { manifest: 'manifest-lite.json', dir: 'lite' },
  experimental: { manifest: 'manifest-experimental.json', dir: 'experimental' }
}
const BASE_URL = 'https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/'

function fail(msg) {
  console.error(`ERROR: ${msg}`)
  process.exit(1)
}

const args = process.argv.slice(2)
const nuevo = args.includes('--nuevo')
const [canalesArg, jarArg] = args.filter((a) => a !== '--nuevo')
if (!canalesArg || !jarArg) fail('uso: node tools/poner-jar.mjs <full|lite|experimental[,...]> <jar> [--nuevo]')

const canales = canalesArg.split(',').map((c) => c.trim()).filter(Boolean)
for (const c of canales) if (!CANALES[c]) fail(`canal desconocido: ${c} (full, lite, experimental)`)

const jar = resolve(jarArg)
if (!existsSync(jar) || !/\.jar$/i.test(jar)) fail(`no existe el jar: ${jar}`)
const nombre = basename(jar)
const buf = readFileSync(jar)
const sha1 = createHash('sha1').update(buf).digest('hex')
const size = statSync(jar).size
const path = `mods/${nombre}`
const key = modKey(path)
console.log(`${nombre}  sha1 ${sha1}  ${size} bytes`)

// Primero se revisan todos los canales; no se toca nada si alguno no cuadra.
const planes = []
for (const c of canales) {
  const { manifest, dir } = CANALES[c]
  const file = join(ROOT, manifest)
  let m
  try {
    m = JSON.parse(readFileSync(file, 'utf-8'))
  } catch (e) {
    fail(`${manifest} no se puede leer como JSON (${e.message}). Arréglalo o regenera con actualizar.bat.`)
  }
  const hits = m.files.filter((f) => f.path.startsWith('mods/') && modKey(f.path) === key)
  if (hits.length > 1) fail(`${manifest}: varias entradas para ${key}: ${hits.map((h) => h.path).join(', ')}`)
  if (hits.length === 0 && !nuevo) fail(`${manifest}: no tiene ${key}. Si es un mod nuevo, usa --nuevo.`)
  planes.push({ c, manifest, dir, file, m, entry: hits[0] })
}

for (const { c, manifest, dir, file, m, entry } of planes) {
  const destRel = (dir ? `${dir}/` : '') + path
  const dest = join(ROOT, destRel)
  if (resolve(dest) !== jar) copyFileSync(jar, dest)
  const url = BASE_URL + destRel.split('/').map(encodeURIComponent).join('/')

  if (entry) {
    const oldRel = relFromUrl(entry.url)
    if (oldRel && oldRel !== destRel && existsSync(join(ROOT, oldRel))) rmSync(join(ROOT, oldRel))
    const antes = `${entry.path} ${entry.sha1.slice(0, 12)}`
    entry.path = path
    entry.sha1 = sha1
    entry.size = size
    entry.url = url
    console.log(`  ${c}: ${antes} -> ${path} ${sha1.slice(0, 12)}`)
  } else {
    m.files.push({ path, sha1, size, url })
    console.log(`  ${c}: añadido ${path}`)
  }
  m.files.sort((a, b) => a.path.localeCompare(b.path)) // mismo orden que gen-manifest.mjs
  writeFileSync(file, JSON.stringify(m, null, 2), 'utf-8')
}

const problems = checkManifests(ROOT)
if (problems.length) {
  console.error('Los manifests no pasan la validación después del cambio:')
  for (const p of problems) console.error(`  ${p}`)
  console.error('Revisa `git diff` y deshaz con `git restore .` si hace falta.')
  process.exit(1)
}
console.log('Manifests OK. Revisa `git diff --stat` y commitea.')
