import { http } from '@/shared/api/http'

/**
 * CHECAR DESDE CASA, para quien tiene ese contrato.
 *
 * Módulo propio y no dentro de `org` —donde vive el cartel de la contingencia—
 * porque aquí NO hay base: la persona no está en ninguna instalación, y la
 * pantalla no cuelga de una. Lo único que la ata a la empresa es el enlace.
 *
 * Las tres llamadas van con `skipRefresh` por lo mismo que las del cartel: no
 * hay sesión que refrescar, y un 401 disparando un refresco solo conseguiría
 * enseñar un error de sesión a quien nunca pidió una.
 */

export interface CodigoPedido {
  nonce: string
  /** «…4821». Lo justo para reconocer el número sin enseñarlo. */
  enviadoA: string
  nombre: string
}

export interface TelefonoDadoDeAlta {
  token: string
  venceEl: string
}

export interface ChecadaRemota {
  cuando: string
  nombre: string
  /** Si salió el acuse al correo. `false` = no tiene correo en el expediente. */
  comprobante: boolean
}

export interface TelefonoRemoto {
  id: string
  employeeId: string
  employeeName: string
  label: string | null
  verifiedAt: string
  lastUsedAt: string | null
  expiresAt: string
  revokedAt: string | null
}

export const remotoApi = {
  pedirCodigo: (entityId: string, employeeCode: string) =>
    http.post<CodigoPedido>(
      `/remote/${entityId}/code`,
      { employeeCode },
      { skipRefresh: true },
    ),

  darDeAltaTelefono: (
    entityId: string,
    cuerpo: { nonce: string; codigo: string; etiqueta?: string },
  ) =>
    http.post<TelefonoDadoDeAlta>(`/remote/${entityId}/device`, cuerpo, {
      skipRefresh: true,
    }),

  checar: (
    entityId: string,
    cuerpo: { token: string; lat: number; lng: number; accuracyMeters?: number },
  ) =>
    http.post<ChecadaRemota>(`/remote/${entityId}/punch`, cuerpo, {
      skipRefresh: true,
    }),

  /* ---- Y lo que se ve desde Astra, con sesión ----------------------- */

  telefonos: (employeeId?: string, signal?: AbortSignal) =>
    http.get<TelefonoRemoto[]>('/remote/devices', {
      query: { employeeId },
      signal,
    }),

  revocar: (id: string) => http.delete<{ revocado: boolean }>(`/remote/devices/${id}`),
}
