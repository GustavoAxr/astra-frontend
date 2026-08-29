/**
 * Qué significa cada cosa que manda un reloj Hikvision por ISAPI.
 *
 * Vive aquí, junto al visor de evidencia, y NO en `src/domain`: es una ayuda de
 * diagnóstico para el dialecto de UNA marca, no vocabulario del sistema. Lo que
 * Astra concluye a partir de esto ya está traducido en `@/domain/punch` y
 * `@/domain/verification`, y eso sí es común a todos los fabricantes.
 *
 * Todo lo de aquí está verificado sobre 360 eventos reales del DS-K1T805MX,
 * salvo lo que se marque como no visto.
 */

/** Familia del evento. Es lo primero que hay que mirar: el mismo `minor` significa otra cosa en cada familia. */
export const FAMILIAS: Record<number, string> = {
  1: 'Alarma',
  2: 'Excepción del equipo',
  3: 'Operación del equipo',
  5: 'Control de acceso',
}

/**
 * Subtipo, indexado por `major:minor` justamente porque el número solo no basta.
 * Un 112 en la familia 3 es un inicio de sesión; en otra familia sería otra cosa.
 */
export const SUBTIPOS: Record<string, string> = {
  '3:112': 'Inicio de sesión en el administrador del reloj',
  '3:113': 'Cierre de sesión en el administrador del reloj',
  '5:21': 'Puerta abierta',
  '5:22': 'Puerta cerrada',
  '5:23': 'Puerta abierta de forma anormal',
  '5:24': 'Puerta cerrada de forma anormal',
  '5:25': 'Puerta forzada',
  '5:37': 'Apertura sin identificación',
  '5:151': 'Operación de puerta',
  /*
   * CONFIRMADO contra el equipo, y con el mejor experimento posible: la misma
   * persona, el mismo lector, y lo único que cambió fue su clasificación.
   *
   *   Jordy Manuel Can Uitz, antes de la lista:  4 marcajes con minor 181
   *   Jordy Manuel Can Uitz, ya en la lista:     2 marcajes con minor 6
   *
   * Y en todo 2026: 13,548 eventos con minor 181 —todos `normal`— frente a 3
   * con minor 6, los tres de la única persona de la lista que ha pasado.
   *
   * O sea que el reloj señala la lista de no autorizados por DOS vías
   * independientes: el campo `userType` y el propio código del evento. Sirve
   * para detectarla incluso en un firmware que no mande `userType`.
   */
  '5:6': 'Persona en la lista de no autorizados',
  '5:181': 'Autenticación correcta',
}

/** Qué es cada campo. Lo que no esté aquí se pinta igual, sin glosa inventada. */
export const CAMPOS: Record<string, string> = {
  major: 'Familia del evento.',
  minor: 'Subtipo dentro de la familia.',
  time: 'El instante que DECLARA el equipo, con su huso. La hora autoritativa es la del servidor al recibirlo.',
  serialNo: 'Número de secuencia del evento en el reloj. Si se salta, faltan eventos.',
  employeeNoString:
    'El número de la persona DENTRO del reloj. Con sus ceros a la izquierda: así está enrolada y así hay que buscarla.',
  employeeNo: 'El número de la persona dentro del reloj.',
  name: 'El nombre que el reloj tiene guardado. No identifica: lo escribió alguien a mano y puede estar mal.',
  userType: 'Cómo clasificaba el equipo a esa persona en ese instante.',
  currentVerifyMode:
    'Los métodos que ese lector ACEPTA. No dice cuál se usó, y por eso el marcaje sale como ambiguo.',
  cardType: 'Tipo de tarjeta configurado en el lector.',
  cardReaderNo: 'Cuál de los lectores del equipo atendió el evento.',
  doorNo: 'Qué puerta controla ese lector.',
  netUser: 'Con qué usuario entraron al administrador del reloj.',
  remoteHostAddr: 'Desde qué dirección IP entraron.',
  attendanceStatus:
    'Entrada o salida, cuando el equipo está configurado con modos de asistencia. Este no lo está y nunca lo manda.',
  picturesNumber: 'Cuántas fotos capturó. Es el conteo, no la imagen.',
  numOfFP: 'Cuántas huellas tiene registradas. El conteo, nunca la huella.',
  numOfFace: 'Cuántos rostros tiene registrados. El conteo, nunca el rostro.',
}

const entero = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim())
  return null
}

/**
 * La frase que describe el evento: «Control de acceso · Autenticación correcta».
 * Devuelve `null` cuando la carga no trae los dos números.
 */
export function describirEvento(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null
  const major = entero(raw.major)
  const minor = entero(raw.minor)
  if (major === null) return null

  const familia = FAMILIAS[major] ?? `Familia ${major}`
  if (minor === null) return familia

  const subtipo = SUBTIPOS[`${major}:${minor}`]
  // Un código que este catálogo no conoce se enseña como código, sin
  // inventarle significado: es lo que permite descubrir los que faltan.
  return `${familia} · ${subtipo ?? `subtipo ${minor}`}`
}

export function glosaDeCampo(clave: string): string | null {
  return CAMPOS[clave] ?? null
}
