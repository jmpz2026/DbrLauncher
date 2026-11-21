// Mods de terceros servidos desde su origen oficial (DBR-77 / DBR-140).
//
// Los jars listados en origenes-oficiales.json NO se suben a esta rama: el launcher los baja
// de CurseForge o del release oficial de GitHub. El generador de manifests solo ve lo que hay
// en las carpetas, así que este script, que actualizar.bat corre después de generar, agrega
// (o corrige) su entrada en cada manifest con la url oficial y el MISMO sha1 y size de siempre.
// El launcher sigue verificando el sha1 de cada descarga.
//
// Uso:
//   node tools/aplicar-origenes.mjs              aplica a manifest*.json que existan
//   node tools/aplicar-origenes.mjs --verificar  además descarga cada url y compara sha1/size
//                                                (lo corre la Action verificar-origenes)
import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const MANIFESTS = ['manifest.json', 'manifest-lite.json', 'manifest-experimental.json']
const CARPETAS = { 'manifest.json': '', 'manifest-lite.json': 'lite/', 'manifest-experimental.json': 'experimental/' }
const { mods } = JSON.parse(readFileSync('origenes-oficiales.json', 'utf-8'))
let errores = 0

for (const name of MANIFESTS) {
  if (!existsSync(name)) continue
  const m = JSON.parse(readFileSync(name, 'utf-8'))
  let cambios = 0
  for (const o of mods) {
    const path = `mods/${o.archivo}`
    if (existsSync(join(CARPETAS[name] + 'mods', o.archivo))) {
      console.log(`ERROR ${name}: ${CARPETAS[name]}${path} existe en la rama; debe bajarse de ${o.fuente}, bórralo`)
      errores++
    }
    const entrada = { path, sha1: o.sha1, size: o.size, url: o.url }
    const i = m.files.findIndex((f) => f.path === path)
    if (i >= 0) {
      if (m.files[i].sha1 !== o.sha1) {
        console.log(`ERROR ${name}: ${path} tiene otro sha1 (${m.files[i].sha1}); actualiza origenes-oficiales.json`)
        errores++
        continue
      }
      if (m.files[i].url !== o.url || m.files[i].size !== o.size) {
        m.files[i] = { ...m.files[i], ...entrada }
        cambios++
      }
    } else {
      m.files.push(entrada)
      cambios++
    }
  }
  if (cambios) writeFileSync(name, JSON.stringify(m, null, 2) + '\n')
  console.log(`${name}: ${cambios} entradas con origen oficial actualizadas`)
}

if (process.argv.includes('--verificar')) {
  for (const o of mods) {
    try {
      const r = await fetch(o.url, { redirect: 'follow' })
      const buf = Buffer.from(await r.arrayBuffer())
      const sha1 = createHash('sha1').update(buf).digest('hex')
      const ok = r.ok && sha1 === o.sha1 && buf.length === o.size
      console.log(`${ok ? 'ok   ' : 'ERROR'} ${o.archivo} <- ${o.fuente} (${r.status}, ${sha1.slice(0, 8)}, ${buf.length} B)`)
      if (!ok) errores++
    } catch (e) {
      console.log(`ERROR ${o.archivo}: ${e.message}`)
      errores++
    }
  }
}
process.exit(errores ? 1 : 0)
