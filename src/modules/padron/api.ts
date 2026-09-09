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

  /**
   * Retira a esas personas del equipo. El único verbo que destruye: con la
   * persona se van sus huellas, que en este aparato solo se dan de alta con el
   * dedo delante. Encola igual que `sync`; escribe el agente.
   */
  remove: (deviceId: string, username: string, password: string, externalUserIds: string[]) =>
    http.post<SyncResult>(`/devices/${deviceId}/padron/remove`, {
      username,
      password,
      externalUserIds,
    }),

  /**
   * Da de alta a alguien EN EL RELOJ: le asigna número, lo vincula y encola su
   * alta. Le pregunta al equipo qué números tiene, así que **necesita el reloj
   * encendido**: es la única operación del padrón que no se puede encolar a
   * ciegas, porque reutilizar un número le pondría a esa persona el nombre de
   * otra.
   */
  enroll: (
    deviceId: string,
    username: string,
    password: string,
    body: {
      employeeId: string
      externalUserId?: string
      conClave?: boolean
      claveLongitud?: number
    },
  ) =>
    http.post<{ externalUserId: string; pin: string | null }>(
      `/devices/${deviceId}/padron/enroll`,
      { username, password, ...body },
    ),

  commands: (deviceId: string, signal?: AbortSignal) =>
    http.get<Orden[]>(`/device-commands?deviceId=${deviceId}`, { signal }),
}
