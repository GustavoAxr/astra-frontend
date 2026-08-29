import type { NavigationGuardWithThis } from 'vue-router'
import { useAuthStore } from '@/modules/auth/store'

/**
 * Único guard de la aplicación. Pregunta una sola cosa: **¿hay sesión?**
 *
 * No mira roles. El permiso lo aplican el servidor y RLS; comprobarlo también
 * aquí crearía una segunda verdad que tarde o temprano se contradice con la
 * primera. Los roles solo se usan para ocultar ítems del menú.
 */
export const requireSession: NavigationGuardWithThis<undefined> = async (to) => {
  const auth = useAuthStore()

  // `/auth/me` sale UNA vez aunque varias navegaciones lo pidan a la vez.
  //
  // `ensureLoaded` no lanza: un 401, o un refresco que tampoco valió, son la
  // forma normal de decir «no hay sesión». Lo demás lo deja en
  // `auth.bootstrapError` para que la pantalla de entrar lo pinte. El guard no
  // debe ser nunca el sitio donde muere un error: una navegación rota deja al
  // usuario mirando una pantalla en blanco sin explicación.
  await auth.ensureLoaded()

  if (to.meta.public === true) {
    // Ya dentro, la pantalla de entrar no tiene sentido.
    return auth.isAuthenticated ? { name: 'organization' } : true
  }

  if (!auth.isAuthenticated) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }

  return true
}
