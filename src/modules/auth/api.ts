import { http } from '@/shared/api/http'
import type { AuthSession, LoginDto, Me } from './types'

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
