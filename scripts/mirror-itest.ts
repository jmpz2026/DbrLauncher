// Test de integración del mirror R2 y del manejo de bloqueos (403/429).
//   npm run itest -- mirror-itest
// Partes 1-3 usan un servidor local. Parte 4 va contra el mirror real (Worker + R2) y raw.
import { createServer } from 'http'
import { createHash } from 'crypto'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { httpRequest } from '../src/main/http'
import { downloadError, ensureFile } from '../src/main/net'
import { fetchSignedMeta, verifySignature } from '../src/main/meta'
import { fetchManifest } from '../src/main/sync/manifest'
import { CONFIG } from '../src/shared/config'

const sha1 = (b: Buffer | string): string => createHash('sha1').update(b).digest('hex')

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg)
  console.log('  ok -', msg)
}

async function main(): Promise<void> {
  const hits: Record<string, number> = {}
  const server = createServer((req, res) => {
    const url = req.url ?? ''
    hits[url] = (hits[url] ?? 0) + 1
    if (url === '/ok') return void res.end('contenido')
    if (url === '/403') {
      res.statusCode = 403
      return void res.end('blocked')
    }
    if (url === '/429') {
      res.statusCode = 429
      res.setHeader('Retry-After', '0')
      return void res.end('slow down')
    }
    // Bloqueado la primera vuelta, libre después: como el límite de GitHub que pasa en minutos.
    if (url === '/flaky403') {
      if (hits[url] <= 1) {
        res.statusCode = 403
        return void res.end('blocked')
      }
      return void res.end('contenido')
    }
    res.statusCode = 404
    res.end('nope')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const dir = mkdtempSync(join(tmpdir(), 'dbr-mirror-'))

  try {
    console.log('1) orden de fuentes:')
    let r = await httpRequest(base + '/missing', { mirrors: [base + '/ok'], retries: 0 })
    assert(r.ok && r.body.toString() === 'contenido', '404 en la primera fuente pasa a la siguiente')
    r = await httpRequest(base + '/403', { mirrors: [base + '/ok'], retries: 0 })
    assert(r.ok, '403 en la primera fuente pasa a la siguiente')
    r = await httpRequest(base + '/missing', { mirrors: [base + '/missing2'], retries: 0 })
    assert(r.status === 404 && !r.blocked, 'todo 404: devuelve 404 y no es bloqueo')

    console.log('2) bloqueo 403/429 en todas las fuentes:')
    let waited = 0
    r = await httpRequest(base + '/403', {
      mirrors: [base + '/429'],
      retries: 0,
      blockedWaitMs: 200,
      onBlocked: () => waited++
    })
    assert(waited === 1, 'espera una sola vez antes de la última vuelta')
    assert(!r.ok && r.blocked === true, 'resultado marcado como bloqueo')
    assert(r.attempts?.length === 2, 'detalle con el status de cada fuente')
    const e = downloadError(r, base + '/403')
    assert(/127\.0\.0\.1:\d+: 403/.test(e.message) && /429/.test(e.message), `mensaje con detalle: ${e.message}`)

    waited = 0
    r = await httpRequest(base + '/flaky403', { retries: 0, blockedWaitMs: 200, onBlocked: () => waited++ })
    assert(r.ok && waited === 1, 'bloqueo pasajero: la segunda vuelta baja el archivo')

    waited = 0
    r = await httpRequest(base + '/403', { retries: 0, blockedWaitMs: 0, onBlocked: () => waited++ })
    assert(waited === 0 && r.status === 403, 'blockedWaitMs 0 no espera')

    console.log('3) firma:')
    const signed = await fetchSignedMeta('manifest.json')
    assert(!!signed, 'manifest.json del mirror R2 con firma válida')
    const sigRes = await httpRequest(CONFIG.metaBase + 'manifest.json.sig')
    const tampered = Buffer.concat([signed!, Buffer.from(' ')])
    assert(!verifySignature(tampered, sigRes.body.toString()), 'un byte de más invalida la firma')
    assert(!verifySignature(signed!, 'basura'), 'firma basura no valida')

    console.log('4) mirror real:')
    const m = await fetchManifest(CONFIG.manifestUrlLite)
    assert(m.files.length > 0, `manifest lite: ${m.files.length} archivos`)
    const jar = m.files.find((f) => /DbrServerPack/.test(f.path) && f.size && f.size > 1024 * 1024)
    assert(!!jar, `jar grande en el manifest: ${jar?.path}`)
    const dest = join(dir, 'pack.jar')
    const t0 = Date.now()
    await ensureFile(dest, CONFIG.assetBases[0] + jar!.sha1, jar!.sha1, undefined, [jar!.url], {
      size: jar!.size
    })
    assert(sha1(readFileSync(dest)) === jar!.sha1, `jar desde R2 con sha1 correcto (${Date.now() - t0} ms)`)

    console.log('\nTODO OK ✅')
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
