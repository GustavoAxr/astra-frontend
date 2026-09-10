import { ApiError } from './errors'
import {
  claveDe,
  guardarEnCache,
  leerDeCache,
  promesaEnVuelo,
  registrarEnVuelo,
  vaciarCache,
} from './cache'
import { fetchJson, type FetchOptions, type QueryValue } from './fetch-json'
import { refreshSession, sessionGeneration } from './session'

export interface RequestOptions extends Omit<FetchOptions, 'method' | 'body'> {
  /**
   * Para `/auth/login`, `/auth/logout` y cualquier ruta donde un 401 sea la
   * respuesta legítima y no algo que reparar refrescando.
   */
  skipRefresh?: boolean

  /**
   * Cuánto vale esta respuesta sin volver a pedirla. **Solo GET, y solo para
   * catálogos.**
   *
   * Se pide en cada llamada y no hay valor por omisión, a propósito: cachear
   * por defecto convertiría cualquier endpoint nuevo en un candidato a servir
   * datos viejos sin que nadie lo decidiera. Ver `cache.ts`.
   */
  cacheTtlMs?: number
}

/**
 * Cliente público. Única puerta a la red: ningún componente llama a `fetch`.
 *
 * Regla del 401: **un** refresco y **un** reintento. Nunca dos. El reintento
 * llama a `fetchJson` directamente, así que no puede volver a entrar aquí:
 * la ausencia de bucle es estructural, no disciplina.
 */
async function request<T>(
  path: string,
  method: FetchOptions['method'],
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  /*
   * `_cacheTtlMs` se desestructura SOLO para quitarlo de `rest`: lo consume
   * `get`, y si se colara hasta `fetchJson` acabaría como un parámetro de más
   * en la petición. El guion bajo dice que se descarta a propósito.
   */
  const { skipRefresh = false, cacheTtlMs: _cacheTtlMs, ...rest } = options
  const generation = sessionGeneration()

  try {
    return await fetchJson<T>(path, { ...rest, method, body })
  } catch (error) {
    if (skipRefresh || !(error instanceof ApiError) || !error.isUnauthorized) throw error

    // Si la sesión ya se refrescó mientras esta petición estaba en vuelo, su
    // 401 es viejo: se reintenta sin pedir otro refresco. Es lo que evita la
    // ráfaga de refrescos que el backend interpretaría como reúso.
    if (sessionGeneration() === generation) {
      await refreshSession()
    }

    return await fetchJson<T>(path, { ...rest, method, body })
  }
}

/**
 * GET con caché opcional.
 *
 * Va aquí y no dentro de `request` porque `request` reintenta tras refrescar la
 * sesión: envolviendo desde fuera, el intento y el reintento son una sola
 * entrada de caché y una sola promesa compartida.
 */
function get<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { cacheTtlMs } = options
  if (cacheTtlMs === undefined || cacheTtlMs <= 0) {
    return request<T>(path, 'GET', undefined, options)
  }

  const clave = claveDe(path, options.query)

  const guardado = leerDeCache<T>(clave)
  if (guardado !== undefined) return Promise.resolve(guardado)

  /*
   * Solo se comparte la petición en vuelo cuando NADIE trae su propio
   * `AbortSignal`. Compartirla con señales distintas significaría que quien
   * cancele su búsqueda cancela también la del componente de al lado — un fallo
   * que aparecería una vez cada mil y sería imposible de reproducir.
   */
  if (options.signal === undefined) {
    const yaVaEnCamino = promesaEnVuelo<T>(clave)
    if (yaVaEnCamino !== undefined) return yaVaEnCamino
  }

  const promesa = request<T>(path, 'GET', undefined, options).then((valor) => {
    guardarEnCache(clave, valor, cacheTtlMs)
    return valor
  })

  return options.signal === undefined ? registrarEnVuelo(clave, promesa) : promesa
}

/**
 * Cualquier escritura tira la caché ENTERA.
 *
 * Es tosco y es lo que se quiere: la alternativa —que cada endpoint declare qué
 * invalida— funciona hasta que alguien añade uno y se le olvida, y entonces el
 * síntoma es «creé un departamento y no aparece». Aquí solo hay catálogos, así
 * que volver a pedirlos cuesta una llamada.
 *
 * Se vacía tras el ÉXITO. Una escritura que falló no cambió nada al otro lado,
 * y tirar la caché por un 400 solo regalaría viajes a Francia.
 */
async function escribir<T>(
  path: string,
  method: FetchOptions['method'],
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  const resultado = await request<T>(path, method, body, options)
  vaciarCache()
  return resultado
}

export const http = {
  get,
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    escribir<T>(path, 'POST', body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    escribir<T>(path, 'PATCH', body, options),
  /**
   * `PUT` para lo que se SUSTITUYE entero, no se retoca: la foto del
   * expediente. `PATCH` significaría que se puede mandar media foto.
   */
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    escribir<T>(path, 'PUT', body, options),
  /**
   * `DELETE` con cuerpo opcional.
   *
   * Casi ninguno lo lleva, pero un borrado que exige teclear el nombre de lo
   * que se borra sí: ese nombre no puede ir en la URL —acabaría en los registros
   * de acceso de cualquier proxy— y el método correcto para borrar sigue siendo
   * DELETE. Los dos extremos son nuestros, así que el cuerpo llega entero.
   */
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    escribir<T>(path, 'DELETE', body, options),
}

export type { QueryValue }
