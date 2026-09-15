/**
 * LO QUE ESTÁ APAGADO A PROPÓSITO.
 *
 * Un interruptor, no un borrado. Lo que se apaga aquí sigue escrito —pantallas,
 * campos, textos— y vuelve entero el día que se encienda; borrarlo obligaría a
 * escribirlo otra vez, y lo que se escribe otra vez sale distinto.
 *
 * Va todo contra la MISMA constante para que encender sea un cambio de una
 * línea y no una búsqueda por el repositorio.
 */

/**
 * WHATSAPP, APAGADO.
 *
 * No hay cuenta de WhatsApp Business dada de alta, así que todo lo que dependa
 * de mandar un mensaje no funciona: el código para dar de alta un teléfono
 * saldría del servidor hacia ninguna parte, y la persona se quedaría mirando
 * una pantalla que le pide un código que no va a llegar. Es peor que no
 * ofrecerlo — parece que funciona.
 *
 * MIENTRAS TANTO, EL ALTA VA POR CORREO: «Habilitar chequeo remoto» en el
 * expediente manda un enlace que ya trae el código dentro, y ese camino no
 * toca WhatsApp en ningún punto. Por eso apagar esto no deja a nadie sin poder
 * checar a distancia; solo deja UN camino en vez de dos.
 *
 * Lo que esconde:
 *   · el campo del número y el consentimiento, en el alta y en la edición;
 *   · los dos renglones de WhatsApp en la ficha de Datos;
 *   · el estado «WhatsApp confirmado» y el enlace común de la empresa, que solo
 *     sirve para el camino del código;
 *   · el formulario público de «mándame el código a mi número de empleado».
 *
 * Lo que NO toca: `verification.ts`, donde `WHATSAPP_OPT_IN` es un método de
 * verificación que reporta un reloj, y no tiene nada que ver con esto.
 */
export const WHATSAPP_ACTIVO = false
