/**
 * Qué hacer al entrar en una lista que filtra por razón social, según lo que
 * traiga la URL y lo que recordara el selector de la barra superior.
 *
 * Está aparte del componente porque es la parte con reglas —y la que ya se
 * rompió una vez— y así se puede ejecutar sin montar nada.
 */
export type FilterReconciliation =
  /** La URL manda: es lo que alguien compartió o recargó. */
  | { action: 'adopt'; legalEntityId: string }
  /** La URL no dice nada pero el selector recordaba: se escribe en la URL. */
  | { action: 'push'; legalEntityId: string }
  /** Ni una cosa ni la otra: todas las empresas. */
  | { action: 'none' }

export function reconcileLegalEntityFilter(
  fromUrl: string | undefined,
  remembered: string | null,
): FilterReconciliation {
  if (fromUrl !== undefined) return { action: 'adopt', legalEntityId: fromUrl }
  if (remembered !== null) return { action: 'push', legalEntityId: remembered }
  return { action: 'none' }
}
