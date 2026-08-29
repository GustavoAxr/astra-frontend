/**
 * Único punto de lectura de `import.meta.env`.
 *
 * Falla al arrancar si falta una variable, en vez de dejar que la app monte
 * y reviente después con un fetch a "undefined/auth/me".
 */
function required(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name]

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Falta la variable de entorno ${name}. Copia .env.example a .env y rellénala.`)
  }

  return value.trim()
}

export const env = {
  /** Sin barra final, para poder concatenar rutas sin dobles barras. */
  apiUrl: required('VITE_API_URL').replace(/\/+$/, ''),
} as const
