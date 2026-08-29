import { env } from '@/shared/config/env'
import { ApiError, NetworkError, type ApiErrorBody } from './errors'
import type { QueryValue } from './fetch-json'
import { refreshSession, sessionGeneration } from './session'

/**
 * Descargar un archivo que genera la API.
 *
 * POR QUÉ NO UN `<a href>` NI UN `window.open`
 * La sesión son cookies, así que un enlace directo al backend SÍ llevaría la
 * cookie y parecería más simple. Pero se saltaría el refresco: con el token de
 * acceso vencido, en vez de un archivo aparecería una pestaña con un JSON de
 * error, sin `requestId` visible y sin forma de reintentar. Pasando por aquí un
 * 401 se refresca solo —una vez, con la misma regla del resto del cliente— y un
 * error se pinta con `ApiErrorAlert` como en cualquier otra pantalla.
 *
 * Y ADEMÁS: un enlace no puede avisar de que está tardando. Un reporte de un
 * mes tarda segundos, y sin un botón que se ponga a cargar la gente lo pulsa
 * tres veces.
 */
export interface DownloadOptions {
  query?: Record<string, QueryValue>
  signal?: AbortSignal
}

export async function downloadFile(path: string, options: DownloadOptions = {}): Promise<void> {
  const generation = sessionGeneration()

  let response = await pedir(path, options)

  if (response.status === 401 && sessionGeneration() === generation) {
    await refreshSession()
    response = await pedir(path, options)
  }

  if (!response.ok) throw await comoApiError(response)

  const blob = await response.blob()
  guardar(blob, nombreDeArchivo(response, path))
}

async function pedir(path: string, options: DownloadOptions): Promise<Response> {
  try {
    return await fetch(construirUrl(path, options.query), {
      credentials: 'include',
      signal: options.signal,
    })
  } catch (cause) {
    if (options.signal?.aborted) throw cause
    throw new NetworkError(cause)
  }
}

function construirUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${env.apiUrl}${path}`)
  for (const [clave, valor] of Object.entries(query ?? {})) {
    if (valor === undefined || valor === null || valor === '') continue
    url.searchParams.set(clave, String(valor))
  }
  return url.toString()
}

/**
 * El nombre lo manda el servidor en `Content-Disposition`. Es el que sabe qué
 * periodo y qué alcance salieron de verdad; construirlo aquí a partir de lo que
 * la pantalla creía haber pedido es como acaban tres archivos distintos
 * llamados igual en la carpeta de descargas.
 */
function nombreDeArchivo(response: Response, path: string): string {
  const cabecera = response.headers.get('content-disposition') ?? ''
  const conNombre = /filename="?([^"]+)"?/i.exec(cabecera)
  return conNombre?.[1] ?? path.split('/').pop() ?? 'descarga'
}

function guardar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Sin revocar, cada descarga deja el archivo entero retenido en memoria.
  URL.revokeObjectURL(url)
}

async function comoApiError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get('x-request-id')

  // El cuerpo de un error SÍ es JSON aunque la petición pidiera un binario.
  let cuerpo: Partial<ApiErrorBody> = {}
  try {
    const texto = await response.text()
    if (texto) cuerpo = JSON.parse(texto) as Partial<ApiErrorBody>
  } catch {
    // Un proxy puede devolver HTML. Se pierde el detalle y queda el código.
  }

  return new ApiError(response.status, cuerpo, requestId)
}
