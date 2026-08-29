import { http } from '@/shared/api/http'
import type { Device, DiscoveryResult, EnrollDeviceForm, SyncOutcome } from './types'

export const devicesApi = {
  /** Arreglo plano. El único filtro que acepta el servidor es la instalación. */
  list: (installationId: string | undefined, signal?: AbortSignal) =>
    http.get<Device[]>('/devices', { query: { installationId }, signal }),

  /**
   * Sonda una IP de la red local. Tarda segundos y puede agotar el tiempo:
   * la pantalla necesita estado de carga de verdad.
   */
  discover: (ip: string, installationId: string, signal?: AbortSignal) =>
    http.post<DiscoveryResult>('/devices/discover', { ip, installationId }, { signal }),

  enroll: (form: EnrollDeviceForm) => http.post<Device>('/devices', toEnrollDto(form)),

  /**
   * Le pregunta al reloj por sus checadas desde la marca de agua guardada.
   *
   * Las credenciales son del EQUIPO y viajan en cada llamada: no se guardan ni
   * aquí ni en el servidor. Devuelve `hasMore` cuando quedan eventos, porque un
   * equipo puede tener miles y leerlos todos de una dejaría la petición abierta
   * varios minutos.
   */
  sync: (deviceId: string, credentials: { username: string; password: string }) =>
    http.post<SyncOutcome>(`/devices/${deviceId}/sync`, credentials),
}

/**
 * Campo por campo. Los opcionales vacíos **no se mandan**: `forbidNonWhitelisted`
 * rechaza lo que sobra, y un `model: ""` tampoco es lo mismo que no tener modelo.
 */
function toEnrollDto(form: EnrollDeviceForm): Record<string, string> {
  const dto: Record<string, string> = {
    installationId: form.installationId,
    ip: form.ip.trim(),
    serialNumber: form.serialNumber.trim(),
    brand: form.brand.trim(),
    protocol: form.protocol.trim(),
    sharingMode: form.sharingMode,
  }

  const model = form.model.trim()
  if (model !== '') dto.model = model

  return dto
}
