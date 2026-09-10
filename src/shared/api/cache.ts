import type { QueryValue } from './fetch-json'

/**
 * CACHÉ CON CADUCIDAD PARA LOS CATÁLOGOS.
 *
 * POR QUÉ EXISTE
 * La API vive en Francia y cada llamada cuesta 235 ms de ida y vuelta, medidos.
 * Una pantalla que pide departamentos, puestos y turnos se pasa tres cuartos de
 * segundo esperando datos que no cambian de un mes para otro.
 *
 * QUÉ ENTRA AQUÍ Y QUÉ NO
 * Solo catálogos, y se elige uno a uno en la llamada —nunca por omisión—. Un
 * marcaje que entró hace treinta segundos y no aparece porque estaba cacheado
 * es peor que esperar: la persona concluye que Astra perdió su checada. Los
 * datos de movimiento no se cachean nunca, y que haya que pedirlo explícitamente
 * es lo que impide que alguien lo active «para que vaya más rápido».
 *
 * VIVE EN MEMORIA Y NO EN `localStorage`, a propósito. Un catálogo de personal
 * escrito en el disco de un equipo compartido sobrevive al cierre de sesión, y
 * eso convierte una mejora de velocidad en una fuga. Al recargar se vuelve a
 * pedir, que cuesta una vez lo que ya costaba siempre.
 */

interface Entrada {
  expiraEn: number
  valor: unknown
}

const guardado = new Map<string, Entrada>()

/**
 * Peticiones idénticas que están EN VUELO ahora mismo.
 *
 * Es la mitad menos obvia y a menudo la que más se nota: cuando una pantalla
 * monta tres componentes que piden el mismo catálogo a la vez, sin esto salen
 * tres peticiones —la caché aún está vacía, ninguna ha vuelto— y se pagan tres
 * viajes a Francia para el mismo dato.
 */
const enVuelo = new Map<string, Promise<unknown>>()

/**
 * LA CLAVE INCLUYE LA CONSULTA, Y ESTO NO ES UN DETALLE.
 *
 * `/departments?legalEntityId=A` y `/departments?legalEntityId=B` son dos
 * respuestas distintas de dos empresas distintas. Con la ruta sola por clave,
 * la segunda empresa vería el catálogo de la primera: una fuga entre razones
 * sociales causada por una caché. Los parámetros se ordenan para que el mismo
 * juego de valores dé siempre la misma clave.
 */
export function claveDe(path: string, query?: Record<string, QueryValue>): string {
  if (query === undefined) return path

  const partes = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${String(v)}`)
    .sort()

  return partes.length === 0 ? path : `${path}?${partes.join('&')}`
}

export function leerDeCache<T>(clave: string): T | undefined {
  const entrada = guardado.get(clave)
  if (entrada === undefined) return undefined

  if (entrada.expiraEn <= Date.now()) {
    guardado.delete(clave)
    return undefined
  }

  /*
   * Se devuelve una COPIA. Si se devolviera la misma referencia, un componente
   * que ordene la lista o le añada un elemento estaría modificando lo que ve
   * la siguiente pantalla, y el fallo aparecería lejos de su causa.
   */
  return estructuraCopiada(entrada.valor) as T
}

export function guardarEnCache(clave: string, valor: unknown, ttlMs: number): void {
  guardado.set(clave, { valor: estructuraCopiada(valor), expiraEn: Date.now() + ttlMs })
}

export function promesaEnVuelo<T>(clave: string): Promise<T> | undefined {
  return enVuelo.get(clave) as Promise<T> | undefined
}

export function registrarEnVuelo<T>(clave: string, promesa: Promise<T>): Promise<T> {
  enVuelo.set(clave, promesa)

  /*
   * `finally` y no `then`: también hay que soltar la clave si falló, o un corte
   * de red la dejaría ocupada por una promesa rechazada para siempre.
   *
   * Y el `catch` vacío del final NO se puede quitar. `finally` devuelve una
   * promesa NUEVA que hereda el rechazo, y esa no la espera nadie: sin el
   * catch, cada petición cacheada que falle suelta un «unhandled rejection» en
   * la consola. Quien llamó sigue recibiendo el error por `promesa`, que es la
   * que se devuelve; aquí solo se silencia la rama de limpieza.
   */
  promesa.finally(() => enVuelo.delete(clave)).catch(() => {})

  return promesa
}

/**
 * VACIAR ENTERO, Y ES DELIBERADO QUE SEA TAN BRUTO.
 *
 * Se llama tras CUALQUIER escritura y al entrar o salir de la sesión. La
 * alternativa —invalidar solo lo que esa escritura tocó— exige que quien añada
 * un endpoint nuevo se acuerde de declarar qué invalida, y el día que se le
 * olvide el síntoma será «creé un departamento y no aparece», que se lee como
 * que Astra está roto.
 *
 * Se puede permitir ser bruto porque aquí solo hay catálogos: volver a pedirlos
 * cuesta una llamada, no una consulta pesada.
 */
export function vaciarCache(): void {
  guardado.clear()
  enVuelo.clear()
}

/** `structuredClone` donde exista; una copia por JSON donde no. */
function estructuraCopiada(valor: unknown): unknown {
  if (typeof structuredClone === 'function') return structuredClone(valor)
  return JSON.parse(JSON.stringify(valor)) as unknown
}

/**
 * CINCO MINUTOS PARA UN CATÁLOGO.
 *
 * No sale de ninguna medición: sale de que cualquier escritura ya vacía la
 * caché entera, así que este número solo gobierna el caso en que el catálogo
 * lo cambió OTRA PERSONA, en otra pestaña o en otro equipo. Cinco minutos es
 * lo que se tarda en notar que falta un departamento y darle a recargar; más
 * alto empieza a costar explicaciones, y más bajo no ahorra nada en una sesión
 * de trabajo normal.
 */
export const TTL_CATALOGO = 5 * 60 * 1000
