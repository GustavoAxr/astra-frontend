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
   * Cambia un reloj ya dado de alta. Hoy solo si abre puerta.
   *
   * Se elegía al enrolarlo y no había vuelta atrás: quien se equivocaba tenía
   * que borrar el equipo y volver a darlo de alta, perdiendo su marca de
   * lectura de checadas.
   */
  update: (
    deviceId: string,
    changes: {
      opensDoor?: boolean
      phonePunchOpensDoor?: boolean
      /** `null` lo deja sin agente; omitirlo no toca la asignación. */
      edgeAgentId?: string | null
    },
  ) =>
    http.patch<Device>(`/devices/${deviceId}`, changes),

  /**
   * Le pregunta al reloj por sus checadas desde la marca de agua guardada.
   *
   * Las credenciales son del EQUIPO y viajan en cada llamada: no se guardan ni
   * aquí ni en el servidor. Devuelve `hasMore` cuando quedan eventos, porque un
   * equipo puede tener miles y leerlos todos de una dejaría la petición abierta
   * varios minutos.
   */
  /**
   * Leer las checadas del reloj.
   *
   * `desde` IGNORA la marca de agua y relee a partir de esa fecha. Es como se
   * recuperan checadas borradas de la base: el reloj las sigue teniendo, pero
   * por omisión solo entrega lo posterior a la última lectura. Releer no
   * duplica —la clave de cada checada es determinista—.
   */
  /**
   * ¿Sirven estas credenciales para este reloj? No lee ni escribe: pregunta.
   *
   * Está para poner la comprobación DELANTE de algo que sí escribe. El alta de
   * personal la usa así: si la contraseña del equipo está mal, no se crea ni el
   * expediente, y no queda medio empleado que borrar a mano.
   */
  check: (deviceId: string, username: string, password: string, signal?: AbortSignal) =>
    http.post<{ ok: true; detalle: string }>(
      `/devices/${deviceId}/check`,
      { username, password },
      { signal },
    ),

  sync: (deviceId: string, input: { username: string; password: string; desde?: string }) =>
    http.post<SyncOutcome>(`/devices/${deviceId}/sync`, {
      username: input.username,
      password: input.password,
      // Campo por campo: `forbidNonWhitelisted` está activo y uno de más da 400.
      ...(input.desde === undefined ? {} : { desde: input.desde }),
    }),
}

/**
 * Campo por campo. Los opcionales vacíos **no se mandan**: `forbidNonWhitelisted`
 * rechaza lo que sobra, y un `model: ""` tampoco es lo mismo que no tener modelo.
 */
function toEnrollDto(form: EnrollDeviceForm): Record<string, unknown> {
  const dto: Record<string, unknown> = {
    installationId: form.installationId,
    ip: form.ip.trim(),
    serialNumber: form.serialNumber.trim(),
    brand: form.brand.trim(),
    protocol: form.protocol.trim(),
    sharingMode: form.sharingMode,
    opensDoor: form.opensDoor,
  }

  const model = form.model.trim()
  if (model !== '') dto.model = model

  /*
   * El agente SOLO se manda si se eligió uno. `forbidNonWhitelisted` no lo
   * rechazaría —el campo existe en el DTO— pero mandar `''` sí: espera un UUID
   * o nada.
   */
  if (form.edgeAgentId !== '') dto.edgeAgentId = form.edgeAgentId

  return dto
}
