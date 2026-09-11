import { http } from '@/shared/api/http'
import type { ReconcilePreview, ReconcileResult } from './types'

export const reconciliationApi = {
  /**
   * YA NO PIDE LAS CREDENCIALES DEL RELOJ.
   *
   * La propuesta sale de la bandeja de marcajes sin dueño —el agente manda con
   * cada checada el nombre que el equipo tiene guardado—, no de preguntarle al
   * aparato. Por eso funciona con la API en otro servidor, que es donde antes
   * daba un 500, y por eso la contraseña de administrador del reloj deja de
   * viajar al servidor para una lectura que ya no ocurre.
   */
  preview: (deviceId: string, signal?: AbortSignal) =>
    http.post<ReconcilePreview>(
      `/devices/${deviceId}/reconcile/preview`,
      undefined,
      { signal },
    ),

  apply: (deviceId: string, mappings: { externalUserId: string; employeeId: string }[]) =>
    http.post<ReconcileResult>(`/devices/${deviceId}/reconcile/apply`, { mappings }),
}
