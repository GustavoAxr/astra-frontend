import { http } from '@/shared/api/http'

/**
 * SOPORTE QUE ATIENDE A VARIOS CLIENTES CON UNA SOLA CUENTA.
 *
 * `clientes()` contesta **lista vacía** a quien no es operador de plataforma, y
 * eso es lo que decide si el selector se pinta. No hace falta preguntar «¿soy
 * operador?» por separado: quien no lo es recibe una lista vacía y para él esta
 * función simplemente no existe.
 */
export interface ClienteDeLaPlataforma {
  tenantId: string
  nombre: string
  legalEntities: number
}

export const soporteApi = {
  clientes: (signal?: AbortSignal) =>
    http.get<ClienteDeLaPlataforma[]>('/support/tenants', { signal }),

  /** Entra a un cliente. Deja fila en la bitácora ANTES de conceder el acceso. */
  entrar: (tenantId: string) =>
    http.post<{ tenantId: string }>('/support/act-as', { tenantId }),

  salir: () => http.post<{ ok: boolean }>('/support/exit'),

  /**
   * Da de alta un cliente entero. Devuelve la contraseña provisional UNA vez.
   *
   * El servidor la genera y solo guarda su hash, así que **no hay forma de
   * volver a consultarla**. Si se pierde, se cambia; no se recupera.
   */
  crearCliente: (cuerpo: {
    nombre: string
    slug: string
    businessName: string
    taxId: string
    timezone: string
    adminEmail: string
    adminFullName: string
  }) =>
    http.post<{
      tenantId: string
      legalEntityId: string
      userId: string
      claveProvisional: string
    }>('/support/tenants', cuerpo),
}
