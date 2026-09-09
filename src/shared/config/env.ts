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

/**
 * Una variable que puede no estar. Devuelve `undefined` en vez de reventar.
 *
 * Se separa de `required` a propósito: si una función sola decidiera por su
 * cuenta cuáles son obligatorias, la lista viviría en su cuerpo y no en la
 * llamada, y añadir una variable nueva sería adivinar a qué grupo va.
 */
function optional(name: keyof ImportMetaEnv): string | undefined {
  const value = import.meta.env[name]

  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export const env = {
  /** Sin barra final, para poder concatenar rutas sin dobles barras. */
  apiUrl: required('VITE_API_URL').replace(/\/+$/, ''),

  /**
   * Ficha pública de Mapbox. Sin ella el editor de geocercas usa Esri, que no
   * pide credencial. NO ES UN SECRETO —viaja en cada petición de un cuadro del
   * mapa y cualquiera la ve en el inspector—; lo que la protege es la lista de
   * dominios que se configura en la cuenta de Mapbox, no esconderla aquí.
   */
  mapboxToken: optional('VITE_MAPBOX_TOKEN'),
} as const
