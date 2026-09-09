export interface CatalogoFaltante {
  catalogo: string
  /** Qué hay que hacer para llenarlo, dicho como se lo diría una persona. */
  comoSeLlena: string
}

export interface ErrorDeFila {
  /** El número que se ve en Excel, para poder ir a buscarla. */
  fila: number
  columna: string
  detalle: string
}

export interface RevisionDeCarga {
  listas: number
  errores: ErrorDeFila[]
  muestra: { fila: number; nombre: string; correo: string; base: string }[]
}

export interface ResultadoDeCarga {
  altas: number
  errores: ErrorDeFila[]
}

export interface ResultadoDeCatalogo {
  altas: number
  /** Las que ya existían. No es un error: se saltan. */
  repetidas: number
  errores: ErrorDeFila[]
}

export const NOMBRE_DEL_CATALOGO: Record<string, string> = {
  bases: 'Bases',
  turnos: 'Turnos',
  departamentos: 'Departamentos',
  puestos: 'Puestos',
}

export interface RevisionDeTurnos {
  listos: number
  errores: ErrorDeFila[]
  muestra: { clave: string; nombre: string; dias: number; descansos: number }[]
}

export interface ResultadoDeTurnos {
  altas: number
  errores: ErrorDeFila[]
}
