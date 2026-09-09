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
   * Abre un alta y devuelve el enlace.
   *
   * `porCorreo` además se lo manda a su buzón. El enlace se devuelve en los dos
   * casos: el correo es una comodidad, no la vía — si el buzón falla, quien
   * administra lo copia o lo enseña como QR igual.
   */
  crear: (userId: string, porCorreo = false) =>
    http.post<AltaAbierta>('/assistant/links', { userId, porCorreo }),

  revocar: (id: string) => http.delete<{ revocado: boolean }>(`/assistant/links/${id}`),
}
