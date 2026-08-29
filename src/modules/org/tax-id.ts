/**
 * Validación de forma del RFC, **solo para dar el error antes del viaje**.
 *
 * La autoridad sigue siendo el servidor: aquí se comprueba la forma y se manda
 * lo que la persona escribió; el servidor lo normaliza a mayúsculas y decide.
 * Duplicar la regla completa en el cliente crearía dos verdades.
 */
const MORAL = /^[A-ZÑ&]{3}\d{6}[A-Z\d]{3}$/i // 12: persona moral
const FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z\d]{3}$/i // 13: persona física

export function taxIdError(value: string): string | undefined {
  const clean = value.trim()
  if (clean === '') return 'El RFC es obligatorio.'

  if (clean.length !== 12 && clean.length !== 13) {
    return `El RFC tiene ${clean.length} caracteres: 12 para persona moral, 13 para física.`
  }

  if (!MORAL.test(clean) && !FISICA.test(clean)) {
    return 'La forma del RFC no es válida.'
  }

  return undefined
}
