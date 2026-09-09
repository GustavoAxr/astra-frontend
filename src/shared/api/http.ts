import { ApiError } from './errors'
import { fetchJson, type FetchOptions, type QueryValue } from './fetch-json'
import { refreshSession, sessionGeneration } from './session'

export interface RequestOptions extends Omit<FetchOptions, 'method' | 'body'> {
  /**
   * Para `/auth/login`, `/auth/logout` y cualquier ruta donde un 401 sea la
   * respuesta legítima y no algo que reparar refrescando.
   */
  skipRefresh?: boolean
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
  const { skipRefresh = false, ...rest } = options
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

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, 'GET', undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, 'POST', body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, 'PATCH', body, options),
  /**
   * `PUT` para lo que se SUSTITUYE entero, no se retoca: la foto del
   * expediente. `PATCH` significaría que se puede mandar media foto.
   */
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, 'PUT', body, options),
  /**
   * `DELETE` con cuerpo opcional.
   *
   * Casi ninguno lo lleva, pero un borrado que exige teclear el nombre de lo
   * que se borra sí: ese nombre no puede ir en la URL —acabaría en los registros
   * de acceso de cualquier proxy— y el método correcto para borrar sigue siendo
   * DELETE. Los dos extremos son nuestros, así que el cuerpo llega entero.
   */
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, 'DELETE', body, options),
}

export type { QueryValue }
