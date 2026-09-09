export type EstadoDeCorreo = 'pending' | 'sending' | 'sent' | 'failed'

export interface CorreoEnBandeja {
  id: string
  legalEntityId: string
  toEmail: string
  toName: string | null
  subject: string
  bodyText: string
  bodyHtml: string
  kind: string
  status: EstadoDeCorreo
  attempts: number
  lastError: string | null
  nextAttemptAt: string
  sentAt: string | null
  createdAt: string
}

/**
 * Qué significa cada estado **para quien lo lee**, no para la base de datos.
 *
 * «pending» no le dice nada a nadie; «esperando turno» sí. Y `accion` es lo que
 * separa un panel de un adorno: decir que un correo falló sin decir qué hacer
 * con eso deja igual de perdido a quien lo lee.
 */
export const ESTADO: Record<
  EstadoDeCorreo,
  { label: string; color: 'success' | 'warning' | 'error' | 'neutral'; accion: string }
> = {
  pending: {
    label: 'Esperando turno',
    color: 'neutral',
    accion: 'Sale en la siguiente vuelta, o cuando venza su espera si ya falló antes.',
  },
  sending: {
    label: 'Saliendo',
    color: 'neutral',
    accion: 'Se está mandando ahora mismo.',
  },
  sent: {
    label: 'Entregado',
    color: 'success',
    accion: 'El servidor de correo lo aceptó. Que la persona lo abra ya no depende de Astra.',
  },
  failed: {
    label: 'Se dio por perdido',
    color: 'error',
    accion:
      'Se intentó seis veces en una hora y no salió. Revisa el motivo: si era pasajero, reenvíalo; si el correo está mal escrito, corrígelo en el expediente y vuelve a mandarlo desde ahí.',
  },
}

export const TIPO: Record<string, string> = {
  alta: 'Alta de personal',
}
