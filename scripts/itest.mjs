// Corre un test de scripts/ (sync-itest, java-itest, ...) dentro de Electron, porque la capa
// HTTP del main usa `net` de Electron y no funciona con node a secas.
//   node scripts/itest.mjs sync-itest      (o: npm run itest -- sync-itest)
// Empaqueta el test con esbuild (ya viene con electron-vite) y lo arranca cuando la app está
// lista. Termina al imprimir 'TODO OK' (pasa) o con process.exit/app.exit/excepción (falla).
import { build } from 'esbuild'
import { spawnSync } from 'child_process'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const name = (process.argv[2] ?? '').replace(/\.ts$/, '')
const entry = join(root, 'scripts', `${name}.ts`)
if (!name || !existsSync(entry)) {
  console.error('Uso: node scripts/itest.mjs <sync-itest|java-itest|...>')
  process.exit(2)
}
// En out/ como el comando documentado en i18n-test.ts: algunos tests leen ../src por __dirname.
const outDir = join(root, 'out')
mkdirSync(outDir, { recursive: true })
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  outfile: join(outDir, `${name}.js`),
  logLevel: 'warning'
})
const main = join(outDir, `itest-main-${name}.js`)
writeFileSync(
  main,
  `const { app } = require('electron')
const fail = (e) => {
  console.error(e)
  app.exit(1)
}
process.on('uncaughtException', fail)
process.on('unhandledRejection', fail)
app.on('window-all-closed', () => {})
app.whenReady().then(() => {
  // Todos los tests acaban imprimiendo 'TODO OK' si pasan, y salen con código != 0 si no.
  // No vale esperar a que Node quede inactivo: las peticiones de net de Electron no cuentan
  // como handles y el runner se salía a mitad de una descarga dando el test por bueno.
  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk, ...rest) => {
    const r = write(chunk, ...rest)
    if (String(chunk).includes('TODO OK')) setTimeout(() => app.exit(process.exitCode ?? 0), 200)
    return r
  }
  setTimeout(() => fail(new Error('itest: más de 10 min sin terminar')), 600_000).unref()
  require('./${name}.js')
})
`
)
const electron = createRequire(import.meta.url)('electron')
// Si el entorno trae ELECTRON_RUN_AS_NODE (aunque esté vacío) Electron arranca como node sin `app`.
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const r = spawnSync(electron, [main], { stdio: 'inherit', env })
process.exit(r.status ?? 1)
