/**
 * La opción «ninguno» de un desplegable.
 *
 * POR QUÉ NO SE USA LA CADENA VACÍA
 * `USelectMenu` monta por debajo el Combobox de Reka UI, y ese **lanza una
 * excepción** si un elemento trae `value: ''`:
 *
 *   «A <ComboboxItem /> must have a value prop that is not an empty string.
 *    This is because the Combobox value can be set to an empty string to clear
 *    the selection and show the placeholder.»
 *
 * O sea: la cadena vacía está reservada para «no hay nada seleccionado», así
 * que no puede ser además el valor de una opción llamada «Sin departamento».
 *
 * CÓMO SE MANIFIESTA, QUE ES LO PEOR DE ESTO
 * El desplegable se pinta bien y enseña su etiqueta, así que parece correcto.
 * Solo revienta AL ABRIRLO, y dentro de un diálogo el fallo se lleva por
 * delante al diálogo entero: se cierra solo, se vuelve a abrir y deja de
 * responder. Nada de eso apunta a un desplegable.
 *
 * El valor lleva guiones a los dos lados para que no pueda chocar con un id
 * real, que siempre es un UUID o un código del catálogo.
 */
export const NINGUNO = '--ninguno--'

/** Del desplegable al valor que viaja: «ninguno» es no mandar nada. */
export const sinNinguno = (valor: string): string => (valor === NINGUNO ? '' : valor)

/** Del valor guardado al desplegable: vacío o nulo es «ninguno». */
export const conNinguno = (valor: string | null | undefined): string => valor || NINGUNO
