/** Lo que devuelve `GET /legal-entities`: arreglo plano, ya filtrado por RLS. */
export interface LegalEntity {
  id: string
  businessName: string
  taxId: string
  countryCode: string
  timezone: string
  isActive: boolean
}

/** Lo que devuelve `GET /installations`: arreglo plano. */
export interface Installation {
  id: string
  legalEntityId: string
  code: string
  name: string
  timezone: string
  address: string | null
  geofence: { center: { lat: number; lng: number }; radiusMeters: number } | null
  isActive: boolean
}

/**
 * Lo que `/{recurso}/:id/dependencies` contesta antes de ofrecer un borrado.
 *
 * `bloqueos` impiden borrar; `arrastra` no lo impide y **se lo lleva por
 * delante**, así que tiene que aparecer en la confirmación.
 */
export interface Dependencies {
  puedeBorrarse: boolean
  bloqueos: { que: string; cuantos: number }[]
  arrastra: { que: string; cuantos: number }[]
}

export interface CreateLegalEntityForm {
  businessName: string
  taxId: string
  countryCode: string
  timezone: string
}

export interface UpdateLegalEntityForm {
  businessName?: string
  taxId?: string
  timezone?: string
  isActive?: boolean
}

/**
 * Alta de una base. **La geocerca va PLANA**: `latitude`, `longitude` y
 * `geofenceRadiusMeters`. La respuesta la devuelve anidada en `geofence`, y
 * reenviar ese objeto en un POST o PATCH da 400 por campo desconocido.
 */
export interface CreateInstallationForm {
  legalEntityId: string
  /* Sin `code`: lo genera el servidor —`ADM-02`— al crear. */
  name: string
  timezone: string
  address: string
  latitude: string
  longitude: string
  geofenceRadiusMeters: string
}

/** El `code` **no** se puede cambiar: no existe en el PATCH. */
export interface UpdateInstallationForm {
  name?: string
  timezone?: string
  address?: string
  latitude?: number
  longitude?: number
  geofenceRadiusMeters?: number
  isActive?: boolean
}

/**
 * Un departamento. Vive con VIGENCIA en la adscripción, no en el expediente:
 * la gente cambia de departamento, y con una columna en el expediente el
 * reporte de febrero saldría con el departamento de hoy.
 */
export interface Department {
  id: string
  legalEntityId: string
  code: string
  name: string
  parentId: string | null
  costCenter: string | null
  isActive: boolean
  /** Cuántas personas lo tienen HOY. Solo llega en el listado. */
  employeeCount?: number
}

/**
 * Un puesto del catálogo.
 *
 * NO cuelga de un departamento a propósito: «Supervisor» existe en Producción,
 * Mantenimiento y Almacén, y colgarlo sería el mismo puesto capturado tres
 * veces. Los dos viajan por separado en la adscripción.
 */
export interface Position {
  id: string
  legalEntityId: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  /** Cuántas personas lo tienen HOY. Solo llega en el listado. */
  employeeCount?: number
}

/*
 * Sin `code`: lo genera el servidor al crear, dentro de la misma transacción
 * del INSERT. Un código propuesto en el navegador se calcula contra lo que esa
 * pantalla tiene cargado —que con un filtro puesto no es todo— y dos personas
 * dando de alta a la vez se llevan el mismo número.
 */
export interface DepartmentForm {
  name: string
  costCenter: string
}

export interface PositionForm {
  name: string
  description: string
}
