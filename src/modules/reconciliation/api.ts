import { http } from '@/shared/api/http'
import type { ReconcilePreview, ReconcileResult } from './types'

export const reconciliationApi = {
  /**
   * Credenciales **del reloj**, no del usuario. No se guardan en el navegador
   * ni viajan en la URL: van en el cuerpo y se olvidan al salir de la pantalla.
   */
  preview: (deviceId: string, username: string, password: string, signal?: AbortSignal) =>
    http.post<ReconcilePreview>(
      `/devices/${deviceId}/reconcile/preview`,
      { username, password },
      { signal },
    ),

  apply: (deviceId: string, mappings: { externalUserId: string; employeeId: string }[]) =>
    http.post<ReconcileResult>(`/devices/${deviceId}/reconcile/apply`, { mappings }),
}
