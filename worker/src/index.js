// Worker that serves the modpack mirror from the R2 bucket `dbr-assets`.
//
// The GitHub Action (.github/scripts/mirror-assets.mjs) uploads:
//   f/<sha1>                     every manifest file, named by content (immutable)
//   p/<sha1old>-<sha1new>.dbrpatch delta patches for big jars (immutable)
//   m/<name>.json                 manifests, forge json and news (short cache)
// Anything else is a 404. Only GET and HEAD. Range is supported because the
// launcher resumes large downloads from a .part file.

const KEY = /^(f\/[0-9a-f]{40}|p\/[0-9a-f]{40}-[0-9a-f]{40}\.dbrpatch|m\/[A-Za-z0-9._-]+\.json)$/

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
    }

    const key = decodeURIComponent(new URL(request.url).pathname.slice(1))
    if (!KEY.test(key)) return new Response('Not found', { status: 404 })

    const immutable = !key.startsWith('m/')
    const object =
      request.method === 'HEAD'
        ? await env.BUCKET.head(key)
        : await env.BUCKET.get(key, { range: request.headers, onlyIf: request.headers })
    if (!object) return new Response('Not found', { status: 404 })

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('ETag', object.httpEtag)
    headers.set('Accept-Ranges', 'bytes')
    headers.set(
      'Cache-Control',
      immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=60'
    )
    if (key.startsWith('m/')) headers.set('Content-Type', 'application/json; charset=utf-8')
    else headers.set('Content-Type', 'application/octet-stream')

    if (request.method === 'HEAD') {
      headers.set('Content-Length', String(object.size))
      return new Response(null, { status: 200, headers })
    }

    // onlyIf failed (If-None-Match / If-Modified-Since matched): object has no body.
    if (!('body' in object) || object.body === undefined) {
      return new Response(null, { status: 304, headers })
    }

    const range = object.range
    if (range && request.headers.has('Range')) {
      const offset = range.offset ?? (range.suffix !== undefined ? object.size - range.suffix : 0)
      const length = range.length ?? object.size - offset
      if (offset >= object.size) {
        headers.set('Content-Range', `bytes */${object.size}`)
        return new Response(null, { status: 416, headers })
      }
      headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`)
      headers.set('Content-Length', String(length))
      return new Response(object.body, { status: 206, headers })
    }

    headers.set('Content-Length', String(object.size))
    return new Response(object.body, { status: 200, headers })
  }
}
