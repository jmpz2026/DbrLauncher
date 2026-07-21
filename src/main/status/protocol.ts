// Codificación del Server List Ping de Minecraft 1.7+ (VarInt, String, framing de paquetes).

export function writeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let v = value >>> 0 // tratar como uint32
  do {
    let temp = v & 0x7f
    v >>>= 7
    if (v !== 0) temp |= 0x80
    bytes.push(temp)
  } while (v !== 0)
  return Buffer.from(bytes)
}

/** Lee un VarInt desde offset. Devuelve valor+bytes leídos, o null si el buffer está incompleto. */
export function readVarInt(buf: Buffer, offset: number): { value: number; size: number } | null {
  let value = 0
  let size = 0
  let byte: number
  do {
    if (offset + size >= buf.length) return null
    byte = buf[offset + size]
    value |= (byte & 0x7f) << (7 * size)
    size++
    if (size > 5) return null
  } while (byte & 0x80)
  return { value: value >>> 0, size }
}

export function writeString(str: string): Buffer {
  const data = Buffer.from(str, 'utf8')
  return Buffer.concat([writeVarInt(data.length), data])
}

export function writeUShort(n: number): Buffer {
  const b = Buffer.alloc(2)
  b.writeUInt16BE(n, 0)
  return b
}

/** Empaqueta datos con su prefijo de longitud VarInt. */
function framePacket(data: Buffer): Buffer {
  return Buffer.concat([writeVarInt(data.length), data])
}

/** Handshake (state=1) para pedir el estado. */
export function buildHandshake(host: string, port: number): Buffer {
  const data = Buffer.concat([
    writeVarInt(0x00), // packet id
    writeVarInt(4), // protocol version (irrelevante para status)
    writeString(host),
    writeUShort(port),
    writeVarInt(1) // next state = status
  ])
  return framePacket(data)
}

/** Status Request (paquete vacío). */
export function buildStatusRequest(): Buffer {
  return framePacket(writeVarInt(0x00))
}

/** Intenta parsear una Status Response completa del buffer. Null si aún está incompleta. */
export function tryParseStatus(buf: Buffer): unknown | null {
  const lenRes = readVarInt(buf, 0)
  if (!lenRes) return null
  const packetEnd = lenRes.size + lenRes.value
  if (buf.length < packetEnd) return null // paquete incompleto

  let off = lenRes.size
  const idRes = readVarInt(buf, off)
  if (!idRes) return null
  off += idRes.size
  const strLen = readVarInt(buf, off)
  if (!strLen) return null
  off += strLen.size
  if (buf.length < off + strLen.value) return null

  const json = buf.slice(off, off + strLen.value).toString('utf8')
  return JSON.parse(json)
}

/** Aplana un MOTD (string o chat component con text/extra) a texto plano. */
export function flattenMotd(desc: unknown): string {
  if (desc == null) return ''
  if (typeof desc === 'string') return desc
  if (typeof desc === 'object') {
    const d = desc as { text?: string; extra?: unknown[] }
    let out = d.text ?? ''
    if (Array.isArray(d.extra)) out += d.extra.map(flattenMotd).join('')
    return out
  }
  return String(desc)
}
