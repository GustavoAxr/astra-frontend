/**
 * Husos horarios IANA, del propio motor: `Intl.supportedValuesOf` los conoce
 * todos y se mantienen solos. Una lista escrita a mano envejece y deja fuera al
 * cliente que opera donde no habíamos pensado.
 *
 * La zona de la empresa y la de cada base son independientes y pueden diferir:
 * un grupo con operación en Campeche y en Baja California tiene dos husos, y
 * una checada de las 6 de la mañana no significa lo mismo en cada uno.
 */
function allTimezones(): string[] {
  try {
    const supported = Intl.supportedValuesOf?.('timeZone')
    if (supported && supported.length > 0) return [...supported]
  } catch {
    // Motor viejo: se cae al mínimo indispensable en vez de dejar el campo vacío.
  }
  return ['America/Mexico_City', 'America/Tijuana', 'America/Cancun', 'UTC']
}

/** Lo que la mayoría va a elegir, arriba y separado del resto. */
const FREQUENT = [
  'America/Mexico_City',
  'America/Monterrey',
  'America/Merida',
  'America/Chihuahua',
  'America/Mazatlan',
  'America/Tijuana',
  'America/Cancun',
]

export function timezoneItems(): { label: string; value: string }[] {
  const all = allTimezones()
  const frequent = FREQUENT.filter((zone) => all.includes(zone))
  const rest = all.filter((zone) => !frequent.includes(zone))

  return [...frequent, ...rest].map((zone) => ({ label: zone.replace(/_/g, ' '), value: zone }))
}

/** Desfase actual, para que la elección se pueda comprobar de un vistazo. */
export function timezoneOffset(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('es-MX', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date())
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}
