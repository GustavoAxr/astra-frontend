import type { NavigationGuardWithThis } from 'vue-router'
import { useAuthStore } from '@/modules/auth/store'
import { primeraPantalla } from '@/app/navigation'

/**
 * El guard de la aplicación: **¿hay sesión?** y **¿esta pantalla es para ti?**
 *
 * POR QUÉ AHORA SÍ MIRA ROLES —antes no, y estaba mal—
 * Esconder una entrada del menú no impedía nada: bastaba con teclear la URL, y
 * un gerente acababa en la plantilla entera. Sigue sin ser control de acceso
 * —los datos los protegen el servidor y RLS— pero una pantalla que no le sirve
 * y que además hace llamadas que le responden 403 no debe abrirse.
 *
 * NO ES UNA SEGUNDA VERDAD porque no inventa una tabla propia: cada ruta lleva
 * la MISMA constante que usa el menú. Si el backend cambia sus `@Roles`, el
 * peor síntoma posible sigue siendo una pantalla de más o de menos.
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
    /*
     * Ya dentro, la pantalla de ENTRAR no tiene sentido y se devuelve a la
     * suya. Las demás públicas sí: la checada de contingencia la abre quien
     * pasa por la puerta, y echar de ahí a un supervisor porque resulta que
     * tiene sesión sería impedirle checar en su propia planta.
     */
    if (to.name === 'login' && auth.isAuthenticated) {
      return { name: primeraPantalla(auth.roles) }
    }
    return true
  }

  if (!auth.isAuthenticated) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }

  const permitidos = to.meta.roles
  if (permitidos && !permitidos.some((rol) => auth.roles.includes(rol))) {
    // A su primera pantalla, no a un error: llegar aquí casi siempre es un
    // enlace viejo o una URL heredada de otra sesión, no un intento de nada.
    return { name: primeraPantalla(auth.roles) }
  }

  return true
}
