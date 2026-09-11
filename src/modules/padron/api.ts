import { http } from '@/shared/api/http'
import type { EstadoDelPadron, Orden, SyncResult } from './types'

export const padronApi = {
  /**
   * YA NO PIDE LA CLAVE DEL RELOJ.
   *
   * Compara contra la última FOTO del padrón, que trae el agente. El servidor
   * no ve el equipo —está en otra red y no debe tener forma de entrar— así que
   * preguntárselo por HTTP solo funcionaba con las dos cosas en la misma LAN.
   */
  state: (deviceId: string, signal?: AbortSignal) =>
    http.post<EstadoDelPadron>(
      `/devices/${deviceId}/padron/divergences`,
      undefined,
      { signal },
    ),

  /**
   * Pide una lectura nueva. **Vuelve en el acto, sin esperar al reloj.**
   *
   * El agente la recoge en su próximo latido —con la conexión sostenida, casi
   * inmediato—, lee el equipo y entrega. La pantalla se entera al volver a
   * consultar: si `readAt` avanzó, la foto es nueva.
   */
  refresh: (deviceId: string) =>
    http.post<{ pedida: true }>(`/devices/${deviceId}/padron/refresh`),

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
