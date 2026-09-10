import { vaciarCache } from './cache'
import { fetchJson } from './fetch-json'
import { SessionLostError } from './errors'

/**
 * Estado de sesión compartido por todas las peticiones.
 *
 * El backend guarda **linaje de tokens de refresco** y detecta el reúso: dos
 * refrescos concurrentes con el mismo token revocan la familia entera de
 * sesiones del usuario. Es decir, la implementación ingenua —cada 401 dispara
 * su propio refresco— no es "poco eficiente": tira la sesión sola en cuanto una
 * pantalla lanza dos peticiones a la vez.
 *
 * De ahí las tres piezas de este archivo:
 *
 * 1. `refreshSession()` en *single-flight*: N fallos esperan UNA promesa.
 * 2. `generation`: si la sesión ya se refrescó mientras la petición estaba en
 *    vuelo, se reintenta sin refrescar otra vez.
 * 3. `sessionDead`: cortacircuitos. Si el refresco falla, nadie más lo intenta.
 */

let refreshing: Promise<void> | null = null
let sessionDead = false
let generation = 0

const listeners = new Set<() => void>()

/** Marca de tiempo lógica: sube en cada refresco exitoso y en cada login. */
export function sessionGeneration(): number {
  return generation
}

export function isSessionDead(): boolean {
  return sessionDead
}

/** Tras un login correcto: la sesión vuelve a existir y el cortacircuitos se rearma. */
export function markSessionStarted(): void {
  sessionDead = false
  refreshing = null
  generation += 1
  /*
   * LA CACHÉ DE CATÁLOGOS SE TIRA AL ENTRAR Y AL SALIR.
   *
   * Sin esto, quien entre después en el mismo navegador arrancaría viendo los
   * catálogos de quien estuvo antes —los departamentos de otra empresa, la
   * lista de puestos de otro cliente— hasta que caducaran solos. Una caché que
   * sobrevive al cambio de usuario deja de ser una caché y pasa a ser una fuga.
   */
  vaciarCache()
}

/** Se avisa a quien escuche (el store de auth, el router) de que hay que volver a entrar. */
export function onSessionLost(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function killSession(): void {
  sessionDead = true
  refreshing = null
  vaciarCache()
  for (const listener of listeners) listener()
}

/**
 * Un solo `POST /auth/refresh` en vuelo, pase lo que pase.
 *
 * Cuerpo vacío: el token de refresco va en una cookie acotada a `/auth`.
 * Se llama con `fetchJson` —la capa cruda— para que un 401 aquí no pueda
 * disparar otro refresco.
 */
export function refreshSession(): Promise<void> {
  if (sessionDead) return Promise.reject(new SessionLostError())
  if (refreshing) return refreshing

  refreshing = fetchJson<unknown>('/auth/refresh', { method: 'POST' })
    .then(() => {
      generation += 1
    })
    .catch((cause: unknown) => {
      // Da igual por qué falló: sin refresco no hay sesión que salvar.
      killSession()
      throw new SessionLostError(cause)
    })
    .finally(() => {
      refreshing = null
    })

  return refreshing
}
