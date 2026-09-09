/**
 * CURP Y RFC ARMADOS DESDE EL NOMBRE.
 *
 * LO QUE ESTO ES: un borrador que ahorra teclear. LO QUE NO ES: la CURP de
 * nadie. La oficial es la del documento, y hay tres motivos por los que la
 * calculada puede no coincidir:
 *
 *  · La homoclave y el dígito de homonimia los asigna RENAPO, no un algoritmo.
 *  · Los nombres compuestos se separan de formas que solo sabe el acta.
 *  · La regla de la palabra inconveniente puede haberse aplicado o no.
 *
 * Por eso todo lo que sale de aquí ENTRA EN UN CAMPO EDITABLE y la pantalla
 * dice que es una sugerencia. Guardar una CURP inventada como si fuera la buena
 * es peor que dejar el campo vacío: el vacío se ve, el error no.
 */

/**
 * Partículas que NO cuentan como apellido. Es la lista del instructivo de
 * RENAPO: «DE LA CRUZ» es «CRUZ», y sin esto todos los «De la» compartirían
 * las mismas cuatro letras.
 */
const PARTICULAS = new Set([
  'DA', 'DAS', 'DE', 'DEL', 'DER', 'DI', 'DIE', 'DD', 'EL', 'LA', 'LOS',
  'LAS', 'LE', 'LES', 'MAC', 'MC', 'VAN', 'VON', 'Y',
])

/**
 * Nombres que se saltan cuando hay otro detrás. «María Guadalupe» es
 * «Guadalupe»: si no, media población femenina compartiría la M.
 */
const NOMBRES_QUE_SE_SALTAN = new Set(['MARIA', 'MA', 'MA.', 'M.', 'JOSE', 'J', 'J.'])

/**
 * Las cuatro letras que RENAPO no deja formar. Cuando salen, la SEGUNDA se
 * sustituye por X: CACA queda CXCA. Es la regla de verdad —no se cambian las
 * cuatro— y es exactamente el caso que hay que cubrir, porque nadie quiere que
 * su clave oficial empiece así.
 */
const INCONVENIENTES = new Set([
  'BACA', 'BAKA', 'BUEI', 'BUEY', 'CACA', 'CACO', 'CAGA', 'CAGO', 'CAKA',
  'CAKO', 'COGE', 'COGI', 'COJA', 'COJE', 'COJI', 'COJO', 'COLA', 'CULO',
  'FALO', 'FETO', 'GETA', 'GUEI', 'GUEY', 'JETA', 'JOTO', 'KACA', 'KACO',
  'KAGA', 'KAGO', 'KAKA', 'KAKO', 'KOGE', 'KOGI', 'KOJA', 'KOJE', 'KOJI',
  'KOJO', 'KOLA', 'KULO', 'LILO', 'LOCA', 'LOCO', 'LOKA', 'LOKO', 'MAME',
  'MAMO', 'MEAS', 'MEON', 'MIAR', 'MION', 'MOCO', 'MOKO', 'MULA', 'MULO',
  'NACA', 'NACO', 'PEDA', 'PEDO', 'PENE', 'PIPI', 'PITO', 'POPO', 'PUTA',
  'PUTO', 'QULO', 'RATA', 'ROBA', 'ROBE', 'ROBO', 'RUIN', 'SENO', 'TETA',
  'VACA', 'VAGA', 'VAGO', 'VAKA', 'VUEI', 'VUEY', 'WUEI', 'WUEY',
])

const VOCALES = 'AEIOU'

/** Las 32 entidades más «NE», que es como se codifica nacer fuera del país. */
export const ENTIDADES: { value: string; label: string }[] = [
  { value: 'AS', label: 'Aguascalientes' },
  { value: 'BC', label: 'Baja California' },
  { value: 'BS', label: 'Baja California Sur' },
  { value: 'CC', label: 'Campeche' },
  { value: 'CL', label: 'Coahuila' },
  { value: 'CM', label: 'Colima' },
  { value: 'CS', label: 'Chiapas' },
  { value: 'CH', label: 'Chihuahua' },
  { value: 'DF', label: 'Ciudad de México' },
  { value: 'DG', label: 'Durango' },
  { value: 'GT', label: 'Guanajuato' },
  { value: 'GR', label: 'Guerrero' },
  { value: 'HG', label: 'Hidalgo' },
  { value: 'JC', label: 'Jalisco' },
  { value: 'MC', label: 'México' },
  { value: 'MN', label: 'Michoacán' },
  { value: 'MS', label: 'Morelos' },
  { value: 'NT', label: 'Nayarit' },
  { value: 'NL', label: 'Nuevo León' },
  { value: 'OC', label: 'Oaxaca' },
  { value: 'PL', label: 'Puebla' },
  { value: 'QT', label: 'Querétaro' },
  { value: 'QR', label: 'Quintana Roo' },
  { value: 'SP', label: 'San Luis Potosí' },
  { value: 'SL', label: 'Sinaloa' },
  { value: 'SR', label: 'Sonora' },
  { value: 'TC', label: 'Tabasco' },
  { value: 'TS', label: 'Tamaulipas' },
  { value: 'TL', label: 'Tlaxcala' },
  { value: 'VZ', label: 'Veracruz' },
  { value: 'YN', label: 'Yucatán' },
  { value: 'ZS', label: 'Zacatecas' },
  { value: 'NE', label: 'Nacido en el extranjero' },
]

/**
 * Mayúsculas sin acentos. La Ñ SE CONSERVA como carácter propio: en el RFC es
 * válida, y perderla aquí convertiría a los Muñoz en Munoz.
 */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    // Se recompone la Ñ, que en NFD es N + tilde y se perdería con el resto.
    .replace(/Ñ/g, 'Ñ')
    .replace(/ñ/g, 'Ñ')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-ZÑ ]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** El apellido de verdad: sin «DE LA» delante. */
function palabraDeApellido(apellido: string): string {
  const partes = normalizar(apellido).split(' ').filter(Boolean)
  const utiles = partes.filter((p) => !PARTICULAS.has(p))
  return (utiles[0] ?? partes[0] ?? '').trim()
}

/** El nombre con el que se cuenta: «María Guadalupe» → «GUADALUPE». */
function palabraDeNombre(nombre: string): string {
  const partes = normalizar(nombre).split(' ').filter(Boolean)
  if (partes.length > 1 && NOMBRES_QUE_SE_SALTAN.has(partes[0] ?? '')) {
    return partes[1] ?? ''
  }
  return partes[0] ?? ''
}

/** Primera vocal DESPUÉS de la inicial. Sin ella, X. */
function vocalInterna(palabra: string): string {
  for (const c of palabra.slice(1)) if (VOCALES.includes(c)) return c
  return 'X'
}

/** Primera consonante después de la inicial. La Ñ cuenta como X. */
function consonanteInterna(palabra: string): string {
  for (const c of palabra.slice(1)) {
    if (c === 'Ñ') return 'X'
    if (!VOCALES.includes(c)) return c
  }
  return 'X'
}

/** `1990-03-12` → `900312`. Vacío si la fecha no está completa. */
function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  return m ? `${(m[1] ?? '').slice(2)}${m[2] ?? ''}${m[3] ?? ''}` : ''
}

export interface DatosDeIdentidad {
  firstName: string
  lastName: string
  secondLastName: string
  birthDate: string
}

/**
 * Las diez primeras posiciones del CURP: cuatro letras y la fecha.
 *
 * Es lo único que sale del nombre y la fecha. Lo que falta —sexo, entidad,
 * consonantes internas y homoclave— necesita datos que este formulario no
 * tiene; `curpHasta16` los añade cuando se eligen.
 */
export function raizCurp(d: DatosDeIdentidad): string {
  const paterno = palabraDeApellido(d.lastName)
  const materno = palabraDeApellido(d.secondLastName)
  const nombre = palabraDeNombre(d.firstName)
  const fecha = fechaCorta(d.birthDate)

  if (!paterno || !nombre) return ''

  // La Ñ no cabe en las cuatro primeras posiciones del CURP: va como X.
  const inicial = (p: string): string => (p[0] === 'Ñ' ? 'X' : (p[0] ?? 'X'))

  let letras =
    inicial(paterno) +
    vocalInterna(paterno) +
    (materno ? inicial(materno) : 'X') +
    inicial(nombre)

  // La regla de la palabra inconveniente: se cambia la SEGUNDA letra.
  if (INCONVENIENTES.has(letras)) letras = `${letras[0]}X${letras.slice(2)}`

  return letras + fecha
}

/**
 * El CURP hasta la posición 16. Las dos últimas —homoclave y dígito— no salen
 * de aquí: la 17 la asigna RENAPO para distinguir homónimos.
 */
export function curpHasta16(
  d: DatosDeIdentidad,
  sexo: 'H' | 'M' | '',
  entidad: string,
): string {
  const raiz = raizCurp(d)
  if (raiz.length !== 10 || sexo === '' || entidad === '') return raiz

  return (
    raiz +
    sexo +
    entidad +
    consonanteInterna(palabraDeApellido(d.lastName)) +
    (palabraDeApellido(d.secondLastName)
      ? consonanteInterna(palabraDeApellido(d.secondLastName))
      : 'X') +
    consonanteInterna(palabraDeNombre(d.firstName))
  )
}

const ALFABETO_CURP = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'

/**
 * El dígito verificador, la posición 18.
 *
 * ESTE SÍ SE CALCULA, y es exacto: sale de las otras diecisiete con una suma
 * ponderada pública. Así que en cuanto alguien teclea la posición 17 —la única
 * que hay que copiar del documento— el CURP se completa solo.
 */
export function digitoVerificadorCurp(diecisiete: string): string {
  if (diecisiete.length !== 17) return ''

  let suma = 0
  for (let i = 0; i < 17; i += 1) {
    const valor = ALFABETO_CURP.indexOf(diecisiete[i] ?? '')
    if (valor < 0) return ''
    suma += valor * (18 - i)
  }
  return String((10 - (suma % 10)) % 10)
}

export const CURP_OFICIAL = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/

/**
 * El RFC de una persona física, SIN HOMOCLAVE: diez posiciones.
 *
 * La homoclave son los tres últimos y los pone el SAT. Se pueden calcular con
 * su algoritmo, pero ante dos personas que coincidirían el SAT desempata a su
 * manera, así que un RFC calculado entero sería a veces el de otra persona.
 * Diez ciertas valen más que trece a medio adivinar.
 *
 * REGLA DE LOS APELLIDOS CORTOS: si el paterno tiene menos de tres letras
 * —«LI», «AL»— no hay vocal interna que tomar, y el SAT manda usar la inicial
 * de cada apellido y las DOS primeras del nombre.
 */
export function rfcSinHomoclave(d: DatosDeIdentidad): string {
  const paterno = palabraDeApellido(d.lastName)
  const materno = palabraDeApellido(d.secondLastName)
  const nombre = palabraDeNombre(d.firstName)
  const fecha = fechaCorta(d.birthDate)

  if (!paterno || !nombre || !fecha) return ''

  if (paterno.length < 3) {
    const letras = `${paterno[0]}${materno ? materno[0] : 'X'}${nombre.slice(0, 2)}`
    return (letras.padEnd(4, 'X') + fecha).slice(0, 10)
  }

  let letras = `${paterno[0]}${vocalInterna(paterno)}${materno ? materno[0] : 'X'}${nombre[0]}`
  if (INCONVENIENTES.has(letras)) letras = `${letras[0]}X${letras.slice(2)}`

  return letras + fecha
}

export const RFC_OFICIAL = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/
