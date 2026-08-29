import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, SessionLostError } from '@/shared/api/errors'
import { killSession, markSessionStarted, onSessionLost } from '@/shared/api/session'
import { authApi } from './api'
import type { AuthUser, LoginDto, Me, Role } from './types'
import { canDo, type Action } from './permissions'

export const useAuthStore = defineStore('auth', () => {
  /** Lo grande, de `/auth/me`: trae los conteos. */
  const me = ref<Me | null>(null)
  /** Lo chico, de `login`/`refresh`: trae `mustChangePassword`. */
  const user = ref<AuthUser | null>(null)

  /** Una sola llamada de arranque, compartida por todos los guards. */
  let bootstrap: Promise<void> | null = null

  /** Lo que impidió saber si hay sesión: red caída, 500. Nunca un 401. */
  const bootstrapError = ref<Error | null>(null)

  const isAuthenticated = computed(() => me.value !== null)
  const roles = computed<Role[]>(() => me.value?.roles ?? user.value?.roles ?? [])

  /** Regla 1 del selector: solo si el usuario alcanza más de una razón social. */
  /**
   * Solo para decidir qué se enseña. Nunca para decidir si una llamada se hace:
   * eso lo resuelven el servidor y RLS.
   */
  function can(action: Action): boolean {
    return canDo(action, roles.value)
  }

  const showsLegalEntityPicker = computed(() => (me.value?.legalEntities ?? 0) > 1)

  /**
   * Aviso, **no bloqueo**. Hoy no hay ruta para cambiar la contraseña y todos
   * los usuarios sembrados traen `true`: tratarlo como bloqueo dejaría fuera a
   * todo el mundo. Cuando exista la ruta, esto se convierte en bloqueo.
   */
  const hasProvisionalPassword = computed(() => user.value?.mustChangePassword === true)

  function clear(): void {
    me.value = null
    user.value = null
    bootstrap = null
  }

  /**
   * ¿Este error significa «no hay sesión»?
   *
   * Dos formas distintas para el mismo hecho:
   * - `401` en `/auth/me` sin cookie que refrescar.
   * - `SessionLostError` cuando sí se intentó refrescar y el refresco tampoco
   *   valió. En el arranque eso **no es un fallo**: es un visitante anónimo.
   *
   * El intento de refresco no sobra: es lo que recupera al usuario que vuelve
   * a los 15 minutos con el access caducado y el refresh todavía bueno.
   */
  function meansNoSession(error: unknown): boolean {
    if (error instanceof SessionLostError) return true
    return error instanceof ApiError && error.isUnauthorized
  }

  async function login(dto: LoginDto): Promise<void> {
    const session = await authApi.login(dto)
    bootstrapError.value = null
    markSessionStarted()
    user.value = session.user
    bootstrap = null
    await ensureLoaded()
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } finally {
      // Aunque el servidor falle, en el navegador la sesión se da por terminada.
      killSession()
      clear()
    }
  }

  /**
   * Arranque: `/auth/me` una sola vez aunque lo pidan cuatro guards a la vez.
   * Un 401 aquí significa «no hay sesión», que es una respuesta válida y no un
   * error que haya que enseñar.
   */
  function ensureLoaded(): Promise<void> {
    bootstrap ??= authApi
      .me()
      .then((loaded) => {
        me.value = loaded
      })
      .catch((error: unknown) => {
        if (meansNoSession(error)) {
          me.value = null
          bootstrapError.value = null
          return
        }

        // Red caída o 500: no sabemos si hay sesión. No se cachea la respuesta
        // —el siguiente intento debe volver a preguntar— y se guarda el motivo
        // para que la pantalla de entrar lo pueda pintar.
        bootstrap = null
        bootstrapError.value = error instanceof Error ? error : new Error(String(error))
      })

    return bootstrap
  }

  // Si el refresco falló en cualquier punto de la app, el store se vacía solo.
  onSessionLost(clear)

  return {
    me,
    user,
    bootstrapError,
    isAuthenticated,
    roles,
    can,
    showsLegalEntityPicker,
    hasProvisionalPassword,
    login,
    logout,
    ensureLoaded,
    clear,
  }
})
