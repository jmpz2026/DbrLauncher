// Valida los manifests del modpack antes de que lleguen a los jugadores.
//
// raw.githubusercontent sirve la rama `assets` al instante: un manifest roto rompe la sync de
// todo el mundo antes de que la Action diga nada. Por eso este chequeo corre en el pre-commit
// (tools/hooks/pre-commit), en actualizar.bat antes del commit, en tools/poner-jar.mjs y como
// primer paso de mirror-assets.yml.
//
// Comprueba, en cada manifest*.json que exista:
//   - que sea JSON válido y que `files` (y `androidFiles` si está) sean arrays;
//   - que cada entrada tenga path, url https, sha1 de 40 hex en minúscula y size entero >= 0;
//   - que no haya path repetido dentro de un mismo array;
//   - si la url apunta a la rama assets: que el archivo exista y su tamaño y sha1 reales
//     coincidan con el manifest (sha1 con crypto, igual en Windows que en Linux).
//
// Uso: node tools/check-manifests.mjs [carpeta]   (por defecto, la raíz del repo)
// Sale con 1 y una línea por problema si algo está mal.

import { createHash } from 'crypto'
import { existsSync, readFileSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

export const MANIFESTS = ['manifest.json', 'manifest-lite.json', 'manifest-experimental.json']
export const BRANCH_PREFIX = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/assets\//
const SHA1 = /^[0-9a-f]{40}$/

/** Ruta dentro de la rama a partir de la url de una entrada, o null si no apunta a la rama. */
export function relFromUrl(url) {
  if (!BRANCH_PREFIX.test(url)) return null
  return url.replace(BRANCH_PREFIX, '').split('/').map(decodeURIComponent).join('/')
}

/** Devuelve la lista de problemas (vacía si todo está bien). */
export function checkManifests(root) {
  const problems = []
  const hashes = new Map() // rel -> sha1 real, para no hashear dos veces el mismo jar
  for (const name of MANIFESTS) {
    const file = join(root, name)
    if (!existsSync(file)) continue
    let m
    try {
      m = JSON.parse(readFileSync(file, 'utf-8'))
    } catch (e) {
      problems.push(`${name}: no es JSON válido (${e.message})`)
      continue
    }
    if (!Array.isArray(m.files)) {
      problems.push(`${name}: falta el array "files"`)
      continue
    }
    for (const key of ['files', 'androidFiles']) {
      if (m[key] === undefined) continue
      if (!Array.isArray(m[key])) {
        problems.push(`${name}: "${key}" no es un array`)
        continue
      }
      const seen = new Set()
      m[key].forEach((f, i) => {
        const where = `${name} ${key}[${i}] ${f?.path ?? '(sin path)'}`
        if (!f || typeof f.path !== 'string' || !f.path) return problems.push(`${where}: falta path`)
        if (seen.has(f.path)) problems.push(`${where}: path repetido`)
        seen.add(f.path)
        if (typeof f.url !== 'string' || !f.url.startsWith('https://')) problems.push(`${where}: url no es https`)
        if (typeof f.sha1 !== 'string' || !SHA1.test(f.sha1)) {
          problems.push(`${where}: sha1 mal formado ${JSON.stringify(f.sha1)}`)
          return
        }
        if (!Number.isInteger(f.size) || f.size < 0) problems.push(`${where}: size no es un entero`)
        const rel = typeof f.url === 'string' ? relFromUrl(f.url) : null
        if (rel === null) return
        const local = join(root, rel)
        if (!existsSync(local)) return problems.push(`${where}: no existe ${rel}`)
        const size = statSync(local).size
        if (size !== f.size) problems.push(`${where}: size ${f.size} en el manifest, ${size} en ${rel}`)
        let real = hashes.get(rel)
        if (!real) {
          real = createHash('sha1').update(readFileSync(local)).digest('hex')
          hashes.set(rel, real)
        }
        if (real !== f.sha1) problems.push(`${where}: sha1 ${f.sha1} en el manifest, ${real} en ${rel}`)
      })
    }
  }
  return problems
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
  const problems = checkManifests(root)
  if (problems.length) {
    console.error(`Manifests con problemas (${problems.length}):`)
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log('Manifests OK')
}
