import net from 'net'
import { promises as dns } from 'dns'
import type { ServerStatus } from '../../shared/status'
import { buildHandshake, buildStatusRequest, flattenMotd, tryParseStatus } from './protocol'

interface RawStatus {
  version?: { name?: string }
  players?: { online?: number; max?: number }
  description?: unknown
}

/** Resuelve un registro SRV `_minecraft._tcp.<host>` si existe; si no, usa host:port directo. */
async function resolveTarget(host: string, port: number): Promise<{ host: string; port: number }> {
  try {
    const recs = await dns.resolveSrv(`_minecraft._tcp.${host}`)
    if (recs.length > 0) return { host: recs[0].name, port: recs[0].port }
  } catch {
    /* sin SRV: directo */
  }
  return { host, port }
}

/** Hace Server List Ping a un servidor de Minecraft 1.7+. Nunca rechaza: devuelve online:false. */
export async function pingServer(
  host: string,
  port: number,
  timeoutMs = 5000
): Promise<ServerStatus> {
  const target = await resolveTarget(host, port)
  return new Promise((resolve) => {
    const socket = net.connect(target.port, target.host)
    const started = Date.now()
    let buf = Buffer.alloc(0)
    let settled = false

    const done = (s: ServerStatus): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(s)
    }

    socket.setTimeout(timeoutMs)
    socket.on('timeout', () => done({ online: false, error: 'Tiempo de espera agotado' }))
    socket.on('error', (e) => done({ online: false, error: e.message }))
    socket.on('connect', () => {
      socket.write(buildHandshake(host, port))
      socket.write(buildStatusRequest())
    })
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      let parsed: RawStatus | null = null
      try {
        parsed = tryParseStatus(buf) as RawStatus | null
      } catch {
        done({ online: false, error: 'Respuesta inválida del servidor' })
        return
      }
      if (parsed) {
        done({
          online: true,
          players: parsed.players?.online,
          max: parsed.players?.max,
          version: parsed.version?.name,
          motd: flattenMotd(parsed.description),
          latencyMs: Date.now() - started
        })
      }
    })
  })
}
