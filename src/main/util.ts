import { join, normalize, sep } from 'path'

/** Une base + ruta relativa impidiendo path traversal (`..`, rutas absolutas). */
export function safeJoin(base: string, rel: string): string {
  const target = normalize(join(base, rel))
  const root = normalize(base.endsWith(sep) ? base : base + sep)
  if (!target.startsWith(root)) throw new Error(`Ruta insegura: ${rel}`)
  return target
}

/** Corre `task` sobre `items` con un pool acotado de workers. Preserva el orden de entrada. */
export async function pool<T>(
  items: T[],
  limit: number,
  task: (item: T, i: number) => Promise<void>
): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      await task(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}
