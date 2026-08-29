/**
 * Cómo se identificó la persona. **Regla 2 del proyecto.**
 *
 * El valor puede venir con el prefijo `MULTI:`, que significa que el equipo
 * registró que se usó UNO DE VARIOS métodos pero **no dejó constancia de cuál**.
 * Eso se muestra como ambigüedad; elegir uno sería afirmar algo que el aparato
 * nunca dijo.
 *
 * De dónde sale la ambigüedad, para que se entienda al leerla: el campo del
 * fabricante se llama `currentVerifyMode` y describe lo que ese lector
 * **acepta**, no lo que ocurrió. `cardOrPw` quiere decir «vale tarjeta o vale
 * contraseña», no «se usó la tarjeta».
 */
export interface VerificationMethod {
  /** Métodos posibles, en español. */
  options: string[]
  /** `true` cuando no consta cuál se usó. */
  ambiguous: boolean
  /** Texto corto, para la tabla. */
  label: string
  /** La explicación larga, para el visor de evidencia y los títulos. */
  detail: string
}

const NAMES: Record<string, string> = {
  FINGERPRINT: 'huella',
  // Abreviaturas que usan los fabricantes dentro de un `MULTI:`.
  FP: 'huella',
  FINGER: 'huella',
  CARDNO: 'tarjeta',
  CARD: 'tarjeta',
  FACE: 'rostro',
  PASSWORD: 'clave',
  PW: 'clave',
  PIN: 'PIN',
  PALM: 'palma',
  IRIS: 'iris',
  QR: 'código QR',
  VEIN: 'vena del dedo',
  MOBILE_GPS: 'teléfono con GPS',
  GPS_PORTAL_CAUTIVO: 'portal cautivo',
  SMS_GSM_LOCAL: 'mensaje de texto',
  WHATSAPP_OPT_IN: 'WhatsApp',
  MANUAL: 'captura manual',
}

const nombre = (code: string): string => NAMES[code.toUpperCase()] ?? code

/** Solo la primera letra de la frase va en mayúscula: es una frase, no un título. */
const capitalizar = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Separa `cardOrPw` en sus partes. El formato del fabricante mezcla mayúsculas
 * y minúsculas (`cardOrPw`, `fpOrCard`), así que se corta por «Or» y por los
 * separadores habituales.
 */
function split(raw: string): string[] {
  return raw
    .split(/Or|_OR_|\/|\||,/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

/** «huella, tarjeta o clave» — la lista como se dice en voz alta, para el detalle. */
function enumerar(options: string[]): string {
  if (options.length <= 1) return options[0] ?? ''
  return `${options.slice(0, -1).join(', ')} o ${options[options.length - 1]}`
}

/**
 * «Tarjeta/Clave» — la etiqueta corta de la tabla.
 *
 * La barra ES la ambigüedad: sigue enseñando LOS DOS métodos posibles, que es
 * lo que exige la regla 2. Lo que se acortó es la coletilla «no consta cuál»,
 * que se repetía idéntica en todas las filas; la frase completa sigue en el
 * título al pasar el ratón y en el visor de evidencia, donde se lee una vez y
 * con contexto en vez de ciento cuarenta veces sin él.
 */
function barras(options: string[]): string {
  return options.map(capitalizar).join('/')
}

export function parseVerificationMethod(raw: string | null): VerificationMethod {
  if (raw === null || raw.trim() === '') {
    return {
      options: [],
      ambiguous: false,
      label: 'No registrado',
      detail: 'El equipo no dejó constancia de cómo se identificó la persona.',
    }
  }

  if (!raw.toUpperCase().startsWith('MULTI:')) {
    const uno = nombre(raw)
    return {
      options: [uno],
      ambiguous: false,
      label: capitalizar(uno),
      detail: `El equipo dejó constancia de que se identificó con ${uno}.`,
    }
  }

  const options = split(raw.slice('MULTI:'.length)).map(nombre)
  const lista = enumerar(options)

  return {
    options,
    ambiguous: true,
    // «o» y no «y»: fue uno de ellos, no ambos. Y se dice que no consta.
    label: barras(options),
    detail:
      `Ese lector acepta ${lista}, y el equipo NO registró cuál de esos ` +
      'métodos se usó. El sistema no elige uno: afirmar «huella» cuando pudo ' +
      'ser una tarjeta es indefendible en una junta de conciliación.',
  }
}
