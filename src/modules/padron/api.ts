import { http } from '@/shared/api/http'
import type { EstadoDelPadron, Orden, SyncResult } from './types'

export const padronApi = {
  /**
   * Credenciales **del reloj**, como en la conciliación: van en el cuerpo, no
   * se guardan en el navegador y se olvidan al salir de la pantalla.
   */
  state: (deviceId: string, username: string, password: string, signal?: AbortSignal) =>
    http.post<EstadoDelPadron>(
      `/devices/${deviceId}/padron/divergences`,
      { username, password },
      { signal },
    ),

  /**
   * Encola; NO escribe. Manda el estado completo de cada persona —nombre,
   * vigencia, bloqueo— porque el equipo sustituye el registro entero en cada
   * escritura: una orden parcial dejaría en blanco el acceso de alguien.
   */
  sync: (deviceId: string, username: string, password: string, externalUserIds: string[]) =>
    http.post<SyncResult>(`/devices/${deviceId}/padron/sync`, {
      username,
      password,
      externalUserIds,
    }),

  commands: (deviceId: string, signal?: AbortSignal) =>
    http.get<Orden[]>(`/device-commands?deviceId=${deviceId}`, { signal }),
}
