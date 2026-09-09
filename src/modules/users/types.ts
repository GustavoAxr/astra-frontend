export type TipoDeAlcance = 'HOLDING' | 'LEGAL_ENTITY' | 'INSTALLATION'

export interface RolDisponible {
  id: string
  code: string
  name: string
}

export interface ConcesionDeUsuario {
  grantId: string
  roleCode: string
  roleName: string
  scopeType: TipoDeAlcance
  scopeId: string | null
  /** Ya resuelto por el servidor: el nombre de la empresa o la instalación. */
  scopeName: string | null
  grantedAt: string
}

export interface UsuarioDeAstra {
  id: string
  email: string
  fullName: string
  isActive: boolean
  mustChangePassword: boolean
  employeeId: string | null
  employeeCode: string | null
  createdAt: string
  concesiones: ConcesionDeUsuario[]
}

/**
 * Qué abarca cada tipo de alcance, dicho como lo diría una persona.
 *
 * «HOLDING» no significa nada fuera de la base de datos; «Todo el grupo» sí, y
 * es lo que hay que leer antes de dársela a alguien.
 */
export const ALCANCE: Record<TipoDeAlcance, { label: string; ayuda: string }> = {
  HOLDING: {
    label: 'Todo el grupo',
    ayuda: 'Todas las razones sociales, las de hoy y las que se den de alta mañana.',
  },
  LEGAL_ENTITY: {
    label: 'Una razón social',
    ayuda: 'Esa empresa y todas sus bases.',
  },
  INSTALLATION: {
    label: 'Una base',
    ayuda: 'Solo esa instalación. Ve la empresa a la que pertenece, pero acotado a su base.',
  },
}
