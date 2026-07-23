// Node 16 (runtime de Electron 22) no declara `fetch` ni los tipos web asociados como
// globales. En index.ts los inyectamos en runtime desde undici; aquí damos a TypeScript los
// tipos correspondientes para que los call-sites (`fetch(...)`, la Response que devuelve, etc.)
// compilen bajo @types/node 16. Ver el polyfill en src/main/index.ts.
import type {
  fetch as _fetch,
  Headers as _Headers,
  Request as _Request,
  Response as _Response,
  FormData as _FormData
} from 'undici'

declare global {
  const fetch: typeof _fetch
  const Headers: typeof _Headers
  const Request: typeof _Request
  const Response: typeof _Response
  const FormData: typeof _FormData

  type Headers = _Headers
  type Request = _Request
  type Response = _Response
  type FormData = _FormData
}
