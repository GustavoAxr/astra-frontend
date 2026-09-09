import { http } from '@/shared/api/http'
import type { RolDisponible, TipoDeAlcance, UsuarioDeAstra } from './types'

export interface AltaDeUsuario {
  employeeId?: string
  email: string
  fullName: string
  roleCode: string
  scopeType: TipoDeAlcance
  scopeId?: string
}

export const usersApi = {
  roles: (signal?: AbortSignal) =>
    http.get<RolDisponible[]>('/users/roles', { signal }),

  list: (signal?: AbortSignal) =>
    http.get<UsuarioDeAstra[]>('/users', { signal }),

  /**
   * Devuelve la contraseña provisional UNA vez.
   *
   * No se guarda en claro en ningún sitio, así que si la pantalla la pierde no
   * hay dónde volver a mirarla: hay que dar de alta otra vez o restablecerla.
   */
  crear: (alta: AltaDeUsuario) =>
    http.post<{ id: string; claveProvisional: string }>('/users', alta),

  conceder: (
    userId: string,
    grant: { roleCode: string; scopeType: TipoDeAlcance; scopeId?: string },
  ) => http.post<UsuarioDeAstra[]>(`/users/${userId}/grants`, grant),

  revocar: (grantId: string) => http.delete<void>(`/users/grants/${grantId}`),

  activar: (userId: string, isActive: boolean) =>
    http.patch<UsuarioDeAstra[]>(`/users/${userId}`, { isActive }),
}
