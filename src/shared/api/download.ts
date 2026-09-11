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
  /**
   * Caché del navegador, para lo que NO se puede servir de ella.
   *
   * La foto del expediente llega con `private, max-age=300`: cinco minutos en
   * los que el navegador la da sin preguntar. Está bien para mirarla y muy mal
   * para editarla —quien acaba de cambiarla vería la vieja al reabrir el
   * formulario y creería que no se guardó—, así que esa llamada pide
   * `no-store`. Un reporte no lo necesita: cada uno tiene su URL.
   */
  cache?: RequestCache
}

export async function downloadFile(path: string, options: DownloadOptions = {}): Promise<void> {
  const response = await pedirConRefresco(path, options)

  if (!response.ok) throw await comoApiError(response)

  const blob = await response.blob()

  /*
   * Un archivo vacío se guarda igual de bien que uno bueno, y el fallo aparece
   * al abrirlo —lejos de aquí y sin nada que explique qué pasó—. Más vale un
   * error en la pantalla que pidió el reporte.
   */
  if (blob.size === 0) {
    throw new Error('El servidor devolvió un archivo vacío. Vuelve a intentarlo.')
  }

  guardar(blob, nombreDeArchivo(response, path))
}

/**
 * UN BINARIO DE LA API, EN MEMORIA. No se guarda en disco: es para enseñarlo
 * —hoy, la foto del expediente—.
 *
 * Pasa por aquí y no por un `<img src>` al backend por lo mismo que las
 * descargas: un enlace directo se salta el refresco y, con el token vencido, en
 * vez de la foto queda un hueco roto sin explicación ni `requestId`.
 *
 * **Un 404 lo decide quien llama.** Aquí sale como `ApiError` y ya: que una
 * persona no tenga foto no es un fallo que pintar, pero eso solo lo sabe la
 * pantalla que preguntó.
 */
export async function fetchBlob(path: string, options: DownloadOptions = {}): Promise<Blob> {
  const response = await pedirConRefresco(path, options)

  if (!response.ok) throw await comoApiError(response)

  return await response.blob()
}

/** La regla del 401 del resto del cliente: **un** refresco y **un** reintento. */
async function pedirConRefresco(path: string, options: DownloadOptions): Promise<Response> {
  const generation = sessionGeneration()

  const response = await pedir(path, options)
  if (response.status !== 401 || sessionGeneration() !== generation) return response

  await refreshSession()
  return await pedir(path, options)
}

async function pedir(path: string, options: DownloadOptions): Promise<Response> {
  try {
    return await fetch(construirUrl(path, options.query), {
      credentials: 'include',
      cache: options.cache,
      signal: options.signal,
    })
  } catch (cause) {
    if (options.signal?.aborted) throw cause
    throw new NetworkError(cause)
  }
}

function construirUrl(path: string, query?: Record<string, QueryValue>): string {
  /*
   * EL SEGUNDO ARGUMENTO NO SOBRA: `VITE_API_URL` puede ser relativa (`/api`,
   * servida por el mismo sitio a través del proxy) y `new URL('/api/…')` sin
   * base lanza «Invalid URL».
   *
   * Faltaba aquí, y el síntoma fue peor que el fallo: las descargas dejaron de
   * funcionar TODAS a la vez —reportes incluidos— sin un error en pantalla,
   * porque quien llamaba no capturaba el rechazo. Se arregló en `fetch-json.ts`
   * el día del proxy y este archivo se quedó atrás.
   */
  const url = new URL(`${env.apiUrl}${path}`, window.location.origin)
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
  if (conNombre?.[1]) return conNombre[1]

  /*
   * Sin la cabecera —CORS la esconde si el servidor no la expone— se arma un
   * nombre con la ruta Y LA EXTENSIÓN que toca. Antes se devolvía «attendance»
   * a secas y el sistema operativo le pegaba la extensión por el tipo de
   * contenido: el archivo acababa llamándose igual para todos los periodos.
   */
  const tipo = response.headers.get('content-type') ?? ''
  const extension = tipo.includes('spreadsheet') ? '.xlsx' : tipo.includes('pdf') ? '.pdf' : ''

  return `${path.split('/').pop() || 'descarga'}${extension}`
}

/**
 * Cuánto se espera antes de soltar el archivo de la memoria.
 *
 * NO SE REVOCA EN LA MISMA LÍNEA DEL CLIC, y esto era el fallo: `click()`
 * solo PIDE la descarga; el navegador lee el blob después, por su cuenta.
 * Revocando la URL justo detrás, esa lectura se queda a medias y el archivo se
 * guarda TRUNCADO. Con un PDF de veinte kilobytes casi nunca se nota; con un
 * Excel de cien, Excel abre y dice «encontramos un problema con el contenido».
 *
 * Un minuto es de sobra para cualquier guardado y sigue liberando la memoria:
 * lo que no se puede hacer es no revocar nunca, porque cada reporte se quedaría
 * entero en memoria hasta recargar la página.
 */
const ESPERA_ANTES_DE_SOLTAR_MS = 60_000

function guardar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.rel = 'noopener'
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()

  setTimeout(() => URL.revokeObjectURL(url), ESPERA_ANTES_DE_SOLTAR_MS)
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
