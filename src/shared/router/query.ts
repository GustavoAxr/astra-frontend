import type { LocationQuery } from 'vue-router'

export type QueryChanges = Record<string, string | number | undefined | null>

/**
 * Mezcla cambios sobre la consulta actual y **borra** los que quedan vacíos.
 *
 * Los filtros se escriben con `router.replace`, no con `push`: teclear en un
 * buscador generaría una entrada de historial por pulsación y el botón atrás
 * dejaría de servir para salir de la pantalla. El precio es que atrás tampoco
 * deshace un filtro — se recarga y se comparte, pero no se deshace.
 *
 * Borrar en vez de poner cadena vacía no es cosmético: `?search=` viajaría como
 * un filtro de texto vacío, y `?page=1` ensucia la URL de la primera página,
 * que es la que la gente comparte.
 */
export function mergeQuery(current: LocationQuery, changes: QueryChanges): LocationQuery {
  const next: LocationQuery = { ...current }

  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === null || value === '') {
      delete next[key]
    } else {
      next[key] = String(value)
    }
  }

  return next
}
