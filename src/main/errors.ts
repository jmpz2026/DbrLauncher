/**
 * Mensaje legible de un error, incluyendo la cadena de `cause`. Sin esto, los errores de red
 * llegaban a la UI como un escueto "fetch failed" y no había forma de saber qué falló en el
 * PC del jugador.
 */
export function errMsg(err: unknown): string {
  const parts: string[] = []
  let cur: unknown = err
  for (let depth = 0; cur != null && depth < 4; depth++) {
    const e = cur as { message?: unknown; code?: unknown; cause?: unknown }
    const msg = typeof e.message === 'string' ? e.message : String(cur)
    const code = typeof e.code === 'string' ? e.code : ''
    const line = code && !msg.includes(code) ? `${msg} [${code}]` : msg
    if (line && !parts.includes(line)) parts.push(line)
    cur = e.cause
  }
  return parts.join(' · ') || 'Error desconocido'
}
