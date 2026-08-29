import { env } from '@/shared/config/env'
import { ApiError, NetworkError, type ApiErrorBody } from './errors'

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export type QueryValue = string | number | boolean | null | undefined

export interface FetchOptions {
  method?: HttpMethod
  /** Ya construido campo por campo por un `toXxxDto()`. Nunca un objeto reactivo entero. */
  body?: unknown
  query?: Record<string, QueryValue>
  signal?: AbortSignal
}

/**
 * Capa cruda: una petición, una respuesta. **No sabe nada de refresco**.
 *
 * Esto es lo que hace imposible la recursión: `session.ts` refresca llamando
 * aquí, no al cliente con interceptor, así que un 401 durante el refresco no
 * puede disparar otro refresco.
 */
export async function fetchJson<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options

  let response: Response

  try {
    response = await fetch(buildUrl(path, query), {
      method,
      // Sin excepciones: la sesión son cookies httpOnly.
      // No hay Authorization ni nada en localStorage.
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (cause) {
    // Un aborto es una decisión nuestra, no un fallo de red.
    if (signal?.aborted) throw cause
    throw new NetworkError(cause)
  }

  if (!response.ok) throw await toApiError(response)

  return (await readBody(response)) as T
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${env.apiUrl}${path}`)

  for (const [key, value] of Object.entries(query ?? {})) {
    // Se descartan los vacíos: un `?legalEntityId=undefined` llegaría como la
    // cadena "undefined" y el backend lo rechazaría con 400.
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }

  return url.toString()
}

async function toApiError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get('x-request-id')
  const body = await readBody(response)

  return new ApiError(response.status, isErrorBody(body) ? body : {}, requestId)
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined

  const text = await response.text()
  if (text === '') return undefined

  try {
    return JSON.parse(text) as unknown
  } catch {
    // Una respuesta que no es JSON (una página de error de un proxy, por
    // ejemplo) no debe reventar el parseo: se pierde el cuerpo y ya.
    return undefined
  }
}

function isErrorBody(body: unknown): body is Partial<ApiErrorBody> {
  return typeof body === 'object' && body !== null
}
