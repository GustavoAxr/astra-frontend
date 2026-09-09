/**
 * EL NÚMERO DE WHATSAPP, EN EL FORMATO QUE PIDE EL SERVIDOR.
 *
 * El servidor guarda E.164 —`+` y de diez a quince dígitos— y hace bien: sin
 * la clave del país, un número no se puede marcar desde fuera ni sirve para
 * WhatsApp, que es para lo que está. Pero nadie escribe su teléfono así: se
 * escribe «938 111 0001», con espacios o guiones y sin lada de país.
 *
 * El resultado se ENSEÑA en el formulario antes de guardar. Convertir el número
 * de alguien a callar es lo que no se puede hacer: si el arreglo es correcto,
 * se ve; y si se equivocó de país, también.
 */

/** México. Es de donde son las empresas de este sistema. */
const LADA_POR_OMISION = '52'

/**
 * A E.164, o vacío si no hay nada que convertir.
 *
 * Los casos que se ven de verdad en un alta:
 *  · `9381110001`      → `+529381110001`  (diez dígitos, lo normal)
 *  · `938 111 00 01`   → `+529381110001`  (con espacios)
 *  · `044 938 1110001` → `+529381110001`  (el viejo prefijo de celular)
 *  · `+52 938 111 0001`→ `+529381110001`  (ya traía lada)
 *  · `529381110001`    → `+529381110001`  (lada sin el más)
 *
 * Lo que NO se inventa: un número que no encaje en ninguno de esos se devuelve
 * tal cual y el formulario avisa. Adivinar la lada de un número de siete
 * dígitos sería mandarle un mensaje a un desconocido.
 */
export function aE164(entrada: string): string {
  const limpio = entrada.trim()
  if (limpio === '') return ''

  const traiaMas = limpio.startsWith('+')
  let digitos = limpio.replace(/\D/g, '')
  if (digitos === '') return limpio

  // `044` y `045` eran los prefijos para marcar a un celular en México. Ya no
  // existen, pero siguen apareciendo en las agendas de las que se copia.
  if (!traiaMas && (digitos.startsWith('044') || digitos.startsWith('045'))) {
    digitos = digitos.slice(3)
  }

  // `01` era el prefijo de larga distancia nacional, con la misma historia.
  if (!traiaMas && digitos.length === 12 && digitos.startsWith('01')) {
    digitos = digitos.slice(2)
  }

  if (traiaMas) return `+${digitos}`
  if (digitos.length === 10) return `+${LADA_POR_OMISION}${digitos}`
  if (digitos.length >= 11 && digitos.length <= 15) return `+${digitos}`

  // Demasiado corto para saber qué es: se devuelve como vino.
  return limpio
}

export const E164 = /^\+\d{10,15}$/
