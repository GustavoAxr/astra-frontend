import { http } from '@/shared/api/http'

/**
 * CHECAR SIN RELOJ, desde el teléfono de quien está en la puerta.
 *
 * Vive en `org` y no en un módulo propio porque **es una propiedad de la base**,
 * como su domicilio o su área: cada instalación tiene su cartel y vale siempre.
 * Un módulo aparte pedía una pantalla aparte, y esa pantalla obligaba a que
 * alguien «abriera la contingencia» antes de que nadie pudiera checar — un
 * trámite en el peor momento posible.
 *
 * Las tres llamadas van con `skipRefresh` porque no hay sesión que refrescar:
 * sin eso, un 401 dispararía un intento de refresco que también fallaría, y la
 * persona vería un error de sesión en una pantalla que nunca pidió sesión.
 */
export interface BaseVistaDesdeElTelefono {
  installationName: string
  /** Si es `false`, esa base acepta desde cualquier parte: falta dibujar su área. */
  tieneArea: boolean
}

export interface PermisoParaChecar {
  nombreCorto: string
  nonce: string
  expiresAt: string
}

export const checarSinReloj = {
  mirar: (entityId: string, installationId: string, signal?: AbortSignal) =>
    http.get<BaseVistaDesdeElTelefono>(`/contingency/${entityId}/${installationId}`, {
      skipRefresh: true,
      signal,
    }),

  identificar: (entityId: string, installationId: string, employeeCode: string) =>
    http.post<PermisoParaChecar>(
      `/contingency/${entityId}/${installationId}/identify`,
      { employeeCode },
      { skipRefresh: true },
    ),

  checar: (
    entityId: string,
    installationId: string,
    cuerpo: { nonce: string; lat: number; lng: number; accuracyMeters?: number },
  ) =>
    http.post<{ cuando: string }>(
      `/contingency/${entityId}/${installationId}/punch`,
      cuerpo,
      { skipRefresh: true },
    ),
}
