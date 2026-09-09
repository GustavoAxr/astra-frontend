import { http } from '@/shared/api/http'
import type { CorreoEnBandeja, EstadoDeCorreo } from './types'

export const outboxApi = {
  list: (status: EstadoDeCorreo | undefined, signal?: AbortSignal) =>
    http.get<CorreoEnBandeja[]>('/outbox', {
      query: status ? { status } : undefined,
      signal,
    }),

  /** Vuelve a ponerlo en cola. Solo tiene sentido con los dados por perdidos. */
  reintentar: (id: string) => http.post<{ encolado: boolean }>(`/outbox/${id}/retry`),
}
