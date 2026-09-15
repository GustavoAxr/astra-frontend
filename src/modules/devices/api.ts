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
  ) => http.patch<Device>(`/devices/${deviceId}`, changes),

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
  /*
   * AQUÍ VIVÍA `check`, y lo usaba el alta de personal para comprobar la
   * contraseña del reloj antes de crear nada. Se quitó porque NO PUEDE
   * funcionar: abre una conexión desde el SERVIDOR hacia la dirección del
   * equipo, que es de red local, y el servidor está en otro país. Diez
   * segundos de espera y un «fetch failed» que abortaba el alta entera.
   *
   * Desde que existe el agente no hay nada que comprobar por delante: el alta
   * en el reloj se encola y la aplica quien sí ve el equipo. El endpoint sigue
   * existiendo en el servidor para quien lo tenga en la misma red, pero desde
   * esta aplicación no se llama.
   */

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
