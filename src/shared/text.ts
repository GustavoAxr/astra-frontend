/**
 * Texto «en plano»: sin acentos, sin mayúsculas y con los espacios normales.
 *
 * Para COMPARAR nombres, nunca para guardarlos. «Gómez» y «GOMEZ» son la misma
 * persona mal capturada, y el reloj devuelve los nombres como puede: en
 * mayúsculas, sin acentos, con dobles espacios. Comparando el texto crudo, medio
 * padrón saldría divergente y la pantalla pediría corregir filas que ya están
 * bien.
 */
export const enPlano = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

/**
 * El nombre completo de una persona, como se escribe en México.
 *
 * Nombre, apellido paterno y apellido materno. El materno FALTA en muchos
 * expedientes —extranjeros, capturas a medias— así que se descarta lo vacío en
 * vez de dejar un espacio de más al final.
 *
 * Existe porque el mismo `[a, b, c].filter(Boolean).join(' ')` estaba escrito
 * suelto en varias pantallas, y en una de ellas se me quedó a medias: la lista
 * de pasar lista enseñaba «Ángel Eduardo Gómez» a alguien que en el expediente
 * es «Ángel Eduardo Gómez Ramírez». Un nombre recortado en una lista donde se
 * marca quién estuvo presente no es un detalle de maquetación: dos hermanos con
 * el mismo paterno se vuelven la misma fila.
 */
export const nombreCompleto = (persona: {
  firstName: string
  lastName: string
  secondLastName?: string | null
}): string =>
  [persona.firstName, persona.lastName, persona.secondLastName]
    .filter((parte): parte is string => Boolean(parte))
    .join(' ')
