import type { Installation } from './types'

/**
 * Qué operación toca al enviar el formulario de una base.
 *
 * Vive aparte porque la decisión ya se equivocó una vez: `submit()` preguntaba
 * `if (props.installation)`, y al DUPLICAR esa propiedad también viene llena
 * —es el molde—, así que el formulario editaba el original en vez de crear la
 * copia. El código nuevo se perdía (el PATCH no acepta `code`) y la latitud
 * nueva se le aplicaba a la base de origen.
 *
 * Duplicar es un alta. Lo único que aporta el molde son los valores iniciales.
 */
export type InstallationPlan =
  { op: 'update'; id: string } | { op: 'create'; legalEntityId: string }

export function installationPlan(input: {
  installation: Installation | null | undefined
  clone: boolean
  contextEntityId: string
  targetEntityId: string
}): InstallationPlan {
  if (input.clone) return { op: 'create', legalEntityId: input.targetEntityId }
  if (input.installation) return { op: 'update', id: input.installation.id }
  return { op: 'create', legalEntityId: input.contextEntityId }
}
