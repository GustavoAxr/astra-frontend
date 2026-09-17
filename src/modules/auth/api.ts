import { http } from '@/shared/api/http'
import type { AuthSession, ChangePasswordDto, ChangePasswordResult, LoginDto, Me } from './types'

/**
 * `login` y `logout` van con `skipRefresh`: un 401 ahí es la respuesta
 * legítima (credenciales malas), no algo que se arregle refrescando.
 *
 * `refresh` no vive aquí a propósito: lo gobierna `shared/api/session.ts`,
 * que es quien tiene el single-flight.
 */
export const authApi = {
  login: (dto: LoginDto) =>
    http.post<AuthSession>('/auth/login', toLoginDto(dto), { skipRefresh: true }),

  logout: () => http.post<void>('/auth/logout', undefined, { skipRefresh: true }),

  me: () => http.get<Me>('/auth/me'),

  /**
   * Cambiar la propia contraseña. Sin `skipRefresh`: aquí un 401 sí significa
   * lo de siempre —el token de acceso caducó con el formulario abierto— y
   * refrescar es lo correcto. La contraseña actual mal tecleada NO es un 401,
   * es un 400 con el motivo escrito.
   *
   * El servidor responde borrando las cookies. Quien llame a esto tiene que dar
   * la sesión por terminada; de eso se encarga el store.
   */
  changePassword: (dto: ChangePasswordDto) =>
    http.post<ChangePasswordResult>('/auth/change-password', toChangePasswordDto(dto)),
}

/**
 * Campo por campo. `forbidNonWhitelisted` está activo en el backend: un campo
 * de más devuelve 400, no se ignora. Nada de mandar el objeto del formulario.
 */
function toLoginDto(form: LoginDto): LoginDto {
  return {
    email: form.email.trim(),
    password: form.password,
  }
}

/**
 * Igual que arriba, y aquí importa además lo que NO se manda: el formulario
 * tiene un tercer campo —repetir la nueva— que es solo de la pantalla. Mandarlo
 * sería un 400.
 *
 * Las contraseñas no se recortan: un espacio al final es parte de la
 * contraseña, y quitarlo aquí haría fallar una que el servidor guardó con él.
 */
function toChangePasswordDto(form: ChangePasswordDto): ChangePasswordDto {
  return {
    actual: form.actual,
    nueva: form.nueva,
  }
}
