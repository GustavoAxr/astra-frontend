/**
 * Envoltura de las listas paginadas. **Hoy solo `GET /employees` la usa.**
 *
 * `/installations`, `/devices`, `/agents`, `/unmatched-punches` y
 * `/devices/sync-state` devuelven arreglo plano: son listas cortas por
 * naturaleza. No las envuelvas «por consistencia» — sería inventar contrato.
 */
export interface Paginated<T> {
  data: T[]
  /** Conteo completo tras filtros y RLS: sirve para calcular páginas directo. */
  total: number
  /** Empieza en 1. */
  page: number
  /** Por omisión 25, tope 100. Pedir más devuelve 400. */
  limit: number
}

export const PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
