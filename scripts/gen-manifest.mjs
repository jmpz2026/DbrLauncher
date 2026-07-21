// Generador de manifest.json para la sync del modpack.
// Escanea carpetas (mods/config/…), calcula sha1+tamaño y arma {path,url,sha1,size}.
//
// Uso:
//   node scripts/gen-manifest.mjs --dir ./modpack --base https://.../ --version 1.0.0 \
//        [--forge 10.13.4.1614] [--include mods,config,scripts] [--out manifest.json]
//
// El `--base` es la URL donde estarán alojados los archivos preservando la ruta
// (recomendado: raw.githubusercontent.com/OWNER/REPO/BRANCH/, o un host estático/CDN).

import { createHash } from 'crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join, relative, sep } from 'path'
import { pathToFileURL } from 'url'

function walk(root, base, out) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue // saltar dotfiles (.DS_Store, etc.)
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      walk(full, base, out)
    } else if (entry.isFile()) {
      const buf = readFileSync(full)
      out.push({
        path: relative(base, full).split(sep).join('/'),
        sha1: createHash('sha1').update(buf).digest('hex'),
        size: statSync(full).size
      })
    }
  }
}

/** Construye el objeto manifest. `base` es la URL raíz donde viven los archivos. */
export function buildManifest({
  dir,
  base,
  version = '1.0.0',
  minecraft = '1.7.10',
  forge,
  include = ['mods', 'config']
}) {
  const files = []
  for (const sub of include) {
    const root = join(dir, sub)
    if (existsSync(root)) walk(root, dir, files)
  }
  files.sort((a, b) => a.path.localeCompare(b.path))

  const baseUrl = base.endsWith('/') ? base : base + '/'
  for (const f of files) {
    f.url = baseUrl + f.path.split('/').map(encodeURIComponent).join('/')
  }

  return { version, minecraft, ...(forge ? { forge } : {}), files }
}

// ---- CLI ----
function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    if (key) args[key] = argv[i + 1]
  }
  return args
}

function main() {
  const a = parseArgs(process.argv.slice(2))
  if (!a.dir || !a.base) {
    console.error('Faltan --dir y --base. Ej:')
    console.error('  node scripts/gen-manifest.mjs --dir ./modpack --base https://host/ --version 1.0.0')
    process.exit(1)
  }
  const manifest = buildManifest({
    dir: a.dir,
    base: a.base,
    version: a.version,
    minecraft: a.minecraft,
    forge: a.forge,
    include: a.include ? a.include.split(',') : undefined
  })
  const out = a.out ?? 'manifest.json'
  writeFileSync(out, JSON.stringify(manifest, null, 2), 'utf-8')
  const totalMb = (manifest.files.reduce((s, f) => s + f.size, 0) / 1e6).toFixed(1)
  console.log(`✅ ${out}: ${manifest.files.length} archivos, ${totalMb} MB (v${manifest.version})`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
