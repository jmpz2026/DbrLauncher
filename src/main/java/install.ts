import { spawn } from 'child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import type { JavaProgress } from '../../shared/java'
import { adoptiumUrl, type JrePlatform } from './platform'
import { extractZip } from './zip'

type OnProgress = (p: JavaProgress) => void

/** Descarga el archivo del JRE con progreso por bytes. */
export async function downloadArchive(
  pl: JrePlatform,
  destFile: string,
  onProgress: OnProgress
): Promise<void> {
  const res = await fetch(adoptiumUrl(pl), { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Descarga de Java falló (${res.status}).`)
  const total = Number(res.headers.get('content-length') ?? 0)

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (total > 0) onProgress({ phase: 'download', percent: Math.round((received / total) * 100) })
  }
  writeFileSync(destFile, Buffer.concat(chunks))
}

/**
 * Extrae el archivo a destDir.
 * - .tar.gz/.tgz (JRE de mac/linux) → `tar` del sistema (siempre presente en unix).
 * - .zip/.jar (JRE de Windows y natives de todas las plataformas) → extractor Node puro,
 *   para NO depender del `tar.exe` del SO, ausente en Windows anteriores a 10 build 1803.
 * `exclude` acepta patrones tipo manifest ('META-INF/') que se omiten de la extracción.
 */
export function extractArchive(
  archiveFile: string,
  destDir: string,
  exclude: string[] = []
): Promise<void> {
  mkdirSync(destDir, { recursive: true })
  const lower = archiveFile.toLowerCase()
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    return extractTarGz(archiveFile, destDir, exclude)
  }
  extractZip(archiveFile, destDir, exclude)
  return Promise.resolve()
}

/** Extrae .tar.gz con el `tar` del sistema. Solo mac/linux (unix siempre trae tar). */
function extractTarGz(archiveFile: string, destDir: string, exclude: string[]): Promise<void> {
  const excludeArgs = exclude.flatMap((e) => ['--exclude', e.endsWith('/') ? `${e}*` : e])
  return new Promise((resolve, reject) => {
    const p = spawn('tar', ['-xf', archiveFile, '-C', destDir, ...excludeArgs])
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('error', (e) => reject(new Error(`No se pudo ejecutar tar: ${e.message}`)))
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`Fallo al extraer (tar ${code}): ${err}`))
    )
  })
}

/** Busca el ejecutable java dentro de una carpeta bin/ (BFS con profundidad limitada). */
export function locateJava(root: string): string | null {
  const exe = process.platform === 'win32' ? 'java.exe' : 'java'
  const queue: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }]
  while (queue.length) {
    const { dir, depth } = queue.shift()!
    if (depth > 6) continue
    let entries: import('fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) queue.push({ dir: full, depth: depth + 1 })
      else if (e.isFile() && e.name === exe && basename(dir) === 'bin') return full
    }
  }
  return null
}

/** Ejecuta `java -version` y confirma que es Java 8. Devuelve la versión detectada. */
export function verifyJava(javaPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(javaPath, ['-version'])
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d)) // java -version escribe en stderr
    p.on('error', (e) => reject(new Error(`No se pudo ejecutar java: ${e.message}`)))
    p.on('close', () => {
      if (!/(^|[^\d])1\.8\./.test(out)) {
        reject(new Error(`El runtime descargado no es Java 8: ${out.split('\n')[0]}`))
        return
      }
      const m = out.match(/version "([^"]+)"/)
      resolve(m ? m[1] : '1.8')
    })
  })
}

/** Descarga + extrae + localiza + verifica el JRE 8 en destDir. Núcleo puro (sin electron). */
export async function installJava(
  destDir: string,
  pl: JrePlatform,
  onProgress: OnProgress
): Promise<{ javaPath: string; version: string }> {
  mkdirSync(destDir, { recursive: true })
  const archive = join(destDir, `jre8.${pl.ext}`)

  onProgress({ phase: 'download', percent: 0 })
  await downloadArchive(pl, archive, onProgress)

  onProgress({ phase: 'extract' })
  const extractDir = join(destDir, 'extracted')
  rmSync(extractDir, { recursive: true, force: true })
  await extractArchive(archive, extractDir)

  const javaPath = locateJava(extractDir)
  if (!javaPath) throw new Error('No se encontró el ejecutable java tras extraer el JRE.')

  onProgress({ phase: 'verify' })
  const version = await verifyJava(javaPath)

  if (existsSync(archive)) rmSync(archive, { force: true })
  return { javaPath, version }
}
