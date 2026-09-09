import { http } from '@/shared/api/http'

/**
 * LAS CUENTAS DE TELEGRAM QUE PUEDEN PREGUNTARLE A ASTRA.
 *
 * Vive en el módulo de usuarios y no en uno propio, y esa decisión es la del
 * negocio: **un chat ligado ES una concesión de acceso**, igual que un rol. En
 * una pantalla aparte habría dos sitios donde se reparte acceso, y uno de los
 * dos se quedaría viejo el primer mes.
 */
export interface VinculoDelAsistente {
  id: string
  userId: string
  userName: string
  userEmail: string
  channel: 'TELEGRAM' | 'WHATSAPP'
  /**
   * Con quién habla Astra. **`null` mientras el alta está a medias**: un bot de
   * Telegram no puede escribir primero, así que hasta que la persona no toca el
   * enlace no se sabe quién es.
   */
  externalId: string | null
  /** `@usuario`, para reconocerlo en la lista. */
  displayName: string | null
  /** `null` = el enlace todavía no se ha tocado. No contesta nada. */
  verifiedAt: string | null
  revokedAt: string | null
}

export interface AltaAbierta {
  id: string
  /** El secreto va DENTRO. Quien lo tenga se liga: se trata como una llave. */
  enlace: string
  venceEn: string
  /** Si salió el correo. `false` también cuando no se pidió. */
  correoEncolado: boolean
  correoA: string | null
}

export const asistenteApi = {
  list: (signal?: AbortSignal) =>
    http.get<VinculoDelAsistente[]>('/assistant/links', { signal }),

  /**
   * Abre un alta y MANDA EL ENLACE AL CORREO de esa cuenta.
   *
   * El correo es la vía por omisión, no un extra: el enlace sale al buzón
   * registrado de la persona y a ningún otro sitio, sin que nadie tenga que
   * copiarlo ni pegarlo en otro chat.
   *
   * Se devuelve igualmente para enseñarlo aquí —como QR o para copiar—, porque
   * si el correo falla el alta ya existe y hay que poder entregarla a mano.
   * `porCorreo: false` es para eso: dárselo en persona sin llenarle el buzón.
   */
  crear: (userId: string, porCorreo = true) =>
    http.post<AltaAbierta>('/assistant/links', { userId, porCorreo }),

  revocar: (id: string) => http.delete<{ revocado: boolean }>(`/assistant/links/${id}`),
}
