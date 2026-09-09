import { http } from '@/shared/api/http'
import type { DeviceSyncState } from './types'

export const healthApi = {
  /**
   * Registra a quien no puede checar con su teléfono.
   *
   * Vive en este cliente y no en uno de contingencia porque la pantalla que lo
   * usa es la de salud de relojes: es la respuesta a lo que ahí se lee.
   */
  pasarLista: (installationId: string, employeeIds: string[]) =>
    http.post<{ registradas: number; repetidas: number }>('/contingency/roll-call', {
      installationId,
      employeeIds,
    }),

  syncState: (signal?: AbortSignal) =>
    http.get<DeviceSyncState[]>('/devices/sync-state', { signal }),
}
