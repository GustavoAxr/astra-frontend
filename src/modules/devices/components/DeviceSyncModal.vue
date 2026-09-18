<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import { todayLocal } from '@/shared/date'
import { devicesApi } from '../api'
import type { Device, RecuperacionPedida, SyncOutcome } from '../types'

const props = defineProps<{ device: Device }>()
const emit = defineEmits<{ synced: [] }>()
const aviso = useAviso()

const open = defineModel<boolean>('open', { default: false })

const username = ref('admin')
const password = ref('')
const working = ref(false)
const error = ref<Error | null>(null)

/**
 * QUIÉN LEE EL RELOJ, y no es una preferencia: es lo único que funciona.
 *
 * `POST /devices/:id/sync` abre la conexión al equipo DESDE EL SERVIDOR. Eso
 * funcionó mientras la API y el reloj compartieron red —o sea, en la máquina de
 * quien programa— y dejó de funcionar el día del despliegue: desde el Contabo,
 * `192.168.1.66` es la red de otra persona. Es el mismo fallo por el que se
 * quitó `check` del alta de personal: diez segundos de espera y un «fetch
 * failed» sin explicación.
 *
 * Con agente, la lectura se le PIDE a quien sí ve el equipo, y esta pantalla
 * deja de pedir credenciales: las tiene el agente, en la máquina de la
 * instalación, que es donde deben estar.
 *
 * El camino directo se queda para el equipo que no tiene agente asignado —en
 * desarrollo, en la misma red— en vez de esconderlo: ahí sí sirve.
 */
const porElAgente = computed(() => props.device.edgeAgentId !== null)

/**
 * DESDE DÓNDE SE LEE.
 *
 * Por omisión, desde la marca de agua: es lo correcto en el día a día y lo que
 * hace que un corte de tres días se recupere solo.
 *
 * Las otras dos existen porque la marca AVANZA con cada lectura completa. Si
 * las checadas se borran de la base, el reloj las sigue teniendo pero ya no las
 * ofrece —para él están entregadas— y cada clic solo traería lo ocurrido desde
 * la vez anterior. Releer NO duplica: la clave de cada checada es determinista
 * y una repetida se cuenta como «ya estaba».
 *
 * La marca se queda un par de minutos por detrás del momento de leer, a
 * propósito: el equipo tarda unos segundos en indexar un evento y una marca
 * puesta en «ahora» se los saltaría para siempre. Ver `isapi.reader.ts`.
 */
type Alcance = 'marca' | 'fecha' | 'todo'

const ALCANCES = [
  { label: 'Desde la última lectura', value: 'marca' },
  { label: 'Desde una fecha', value: 'fecha' },
  { label: 'Todo lo que tenga el reloj', value: 'todo' },
]

/**
 * «Todo» es una fecha muy anterior a cualquier equipo instalado, no un valor
 * mágico en la API: el servidor sigue recibiendo una fecha y nada más, que es
 * más fácil de razonar que un caso especial escondido.
 *
 * SOLO EN EL CAMINO DIRECTO. Por el agente no existe la opción «todo», y no es
 * un olvido: el servidor rechaza más de cinco años atrás para que un dedo no
 * mande al agente a paginar un siglo de rango vacío de treinta en treinta. Ahí
 * se elige un día y se acabó.
 */
const PRINCIPIO_DE_LOS_TIEMPOS = '2000-01-01'

const alcance = ref<Alcance>('marca')

/**
 * EL PRIMERO DE ENERO DE ESTE AÑO, y no el primero de este mes.
 *
 * Quien abre esto por el agente viene a recuperar histórico, no el día de ayer
 * —lo de ayer ya lo trajo el agente solo—. La pregunta que trae es «¿por qué
 * solo tengo desde agosto?», y la respuesta es el año corriente.
 */
const desde = ref(`${todayLocal().slice(0, 4)}-01-01`)

/**
 * LO MÁS ATRÁS QUE ACEPTA EL SERVIDOR, repetido aquí a propósito.
 *
 * Es el mismo tope de `RecuperarHistoricoUseCase`, y sí, está en dos sitios.
 * Aquí no manda: acota el calendario para que el día no se pueda ni elegir. La
 * decisión sigue siendo del servidor, que la vuelve a comprobar y contesta con
 * el motivo escrito si alguien llega por otra vía.
 */
const AÑOS_ATRAS_MAXIMO = 5

const loMasAtras = computed(() => {
  const hoy = new Date(`${todayLocal()}T00:00:00Z`)
  hoy.setUTCFullYear(hoy.getUTCFullYear() - AÑOS_ATRAS_MAXIMO)
  return hoy.toISOString().slice(0, 10)
})

const desdeQueMandar = computed(() => {
  // Por el agente siempre va un día: el selector de alcance no se pinta.
  if (porElAgente.value) return desde.value
  if (alcance.value === 'todo') return PRINCIPIO_DE_LOS_TIEMPOS
  if (alcance.value === 'fecha') return desde.value
  return undefined
})

/** Lo acumulado en esta sesión de lectura, no solo la última llamada. */
const total = ref({ batches: 0, inserted: 0, duplicates: 0, unmatched: 0 })
const last = ref<SyncOutcome | null>(null)
const vueltas = ref(0)

const canRead = computed(() => username.value.trim() !== '' && password.value !== '')
const started = computed(() => last.value !== null)

/**
 * CUÁNTAS VUELTAS SEGUIDAS COMO MUCHO.
 *
 * Cada llamada trae hasta trescientos eventos. Con treinta vueltas se recogen
 * nueve mil de un solo clic, que es más de lo que guarda un equipo de estos. El
 * tope existe para que un reloj que contestara `hasMore` para siempre —por un
 * error suyo o nuestro— no dejara la pantalla girando sin fin.
 */
const VUELTAS_MAXIMAS = 30

watch(open, (isOpen) => {
  if (isOpen) return
  // La contraseña del equipo se olvida al cerrar: no vive más que lo necesario.
  password.value = ''
  error.value = null
  last.value = null
  vueltas.value = 0
  alcance.value = 'marca'
  pedida.value = null
  total.value = { batches: 0, inserted: 0, duplicates: 0, unmatched: 0 }
})

const pedida = ref<RecuperacionPedida | null>(null)

/**
 * Pide la recuperación y vuelve. No espera al reloj, a propósito: atar esta
 * pantalla a que el equipo conteste dejaría a quien la mira sin poder
 * distinguir «tarda» de «está roto».
 */
async function pedirAlAgente(): Promise<void> {
  if (working.value) return
  working.value = true
  error.value = null

  try {
    const r = await devicesApi.recuperarHistorico(props.device.id, desde.value)
    pedida.value = r
    aviso.hecho(
      'Recuperación pedida',
      `El agente releerá el reloj desde el ${r.desde}. Las checadas irán apareciendo.`,
    )
    emit('synced')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    working.value = false
  }
}

/**
 * Lee hasta que el equipo diga que no queda nada.
 *
 * UN CLIC, NO QUINCE. El servidor devuelve como mucho unos trescientos eventos
 * por llamada —el reloj pagina de treinta en treinta— y antes había que pulsar
 * «seguir leyendo» hasta que la etiqueta cambiara. Con tres mil eventos eso son
 * once pulsaciones seguidas mirando una pantalla, que no es trabajo de nadie.
 */
async function read(): Promise<void> {
  if (!canRead.value || working.value) return
  working.value = true
  error.value = null
  vueltas.value = 0

  try {
    for (let i = 0; i < VUELTAS_MAXIMAS; i += 1) {
      const outcome = await devicesApi.sync(props.device.id, {
        username: username.value.trim(),
        password: password.value,
        /*
         * El «desde» va SOLO en la primera vuelta. En las siguientes manda la
         * marca que el servidor acaba de guardar; repetirlo reiniciaría el
         * recorrido desde el principio en cada vuelta y no avanzaría nunca.
         */
        ...(i === 0 && desdeQueMandar.value ? { desde: desdeQueMandar.value } : {}),
      })

      last.value = outcome
      vueltas.value = i + 1
      total.value = {
        batches: total.value.batches + outcome.batches,
        inserted: total.value.inserted + outcome.inserted,
        duplicates: total.value.duplicates + outcome.duplicates,
        unmatched: total.value.unmatched + outcome.unmatched,
      }

      if (!outcome.hasMore) break
    }

    /*
     * El aviso, aunque el resultado ya se pinta en el modal: leer tres mil
     * eventos son varias vueltas y quien lo lanzó se va a otra pestaña. Al
     * volver, el detalle sigue ahí; el aviso es para el que NO estaba mirando.
     */
    aviso.hecho(
      `Reloj leído · ${total.value.inserted} checadas nuevas`,
      total.value.unmatched > 0
        ? `${total.value.unmatched} sin dueño, quedan en conciliación.`
        : undefined,
    )
    emit('synced')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    working.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="porElAgente ? 'Recuperar checadas del reloj' : 'Leer las checadas del reloj'"
    :description="device.serialNumber"
  >
    <template #body>
      <div class="space-y-4">
        <!--
          CON AGENTE NO SE PIDEN CREDENCIALES, y no es comodidad: las tiene el
          agente, en la máquina de la instalación. Que no viajen a la base
          central es el motivo por el que el agente existe.
        -->
        <template v-if="porElAgente">
          <UFormField
            label="Recuperar desde el día"
            help="El reloj guarda su histórico completo. Lo que falta en Clocc es lo anterior al día en que el agente se dio de alta: su primera lectura arranca 30 días atrás, no antes."
          >
            <UInput
              v-model="desde"
              type="date"
              :min="loMasAtras"
              :max="todayLocal()"
              class="w-full"
            />
          </UFormField>

          <UAlert
            icon="i-lucide-info"
            title="Se le pide al agente y él lo va trayendo"
            description="No espera al reloj: la orden queda puesta y las checadas aparecen en los minutos siguientes. Releer no duplica nada. Mientras dura, lo del día tarda más en subir —el agente está recorriendo el pasado—, así que conviene lanzarlo al terminar la jornada."
          />
        </template>

        <template v-else>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Usuario del reloj">
              <UInput v-model="username" autocomplete="off" class="w-full" />
            </UFormField>
            <UFormField label="Contraseña del reloj">
              <UInput v-model="password" type="password" autocomplete="off" class="w-full" />
            </UFormField>
          </div>
          <p class="text-dimmed text-xs">
            Son las credenciales del equipo, no las tuyas. No se guardan.
          </p>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Qué leer">
              <USelectMenu v-model="alcance" :items="ALCANCES" value-key="value" class="w-full" />
            </UFormField>
            <UFormField v-if="alcance === 'fecha'" label="Desde el día">
              <UInput v-model="desde" type="date" :max="todayLocal()" class="w-full" />
            </UFormField>
          </div>

          <!--
            Este camino lee el reloj DESDE EL SERVIDOR, y el servidor está en
            otro país: solo sirve con la API en la misma red que el equipo. Se
            dice aquí en vez de dejar que falle con un «fetch failed» a los diez
            segundos, que es lo que hacía.
          -->
          <UAlert
            icon="i-lucide-triangle-alert"
            color="warning"
            title="Este equipo no tiene agente asignado"
            description="La lectura saldría desde el servidor, que solo alcanza al reloj si comparten red. Para un equipo en planta hay que asignarle un agente."
          />
        </template>

        <!--
          Lo que hace cada opción, dicho antes de pulsar. «Releer» asusta si uno
          no sabe que no duplica, y es justo lo que hay que hacer para recuperar
          checadas borradas.
        -->
        <p v-if="!porElAgente && alcance === 'marca'" class="text-dimmed text-xs">
          Continúa desde donde quedó la última vez. Es lo normal: un corte de tres días se recupera
          solo.
        </p>
        <p v-else-if="!porElAgente" class="text-muted text-xs">
          Se ignora la última lectura y se vuelve a leer
          {{ alcance === 'todo' ? 'todo el histórico del equipo' : `desde el ${desde}` }}. Sirve
          para recuperar checadas borradas de la base: el reloj las sigue teniendo.
          <span class="text-dimmed">
            No se duplica nada — lo que ya esté se cuenta como repetido.
          </span>
        </p>

        <!--
          LO QUE CONTESTÓ EL SERVIDOR AL PEDIR LA RECUPERACIÓN. No son checadas
          —todavía no hay ninguna— sino que la orden quedó puesta y desde qué
          día. Sin esto, pulsar el botón no produce ningún cambio visible y
          parece que no pasó nada.
        -->
        <div v-if="pedida" class="bg-elevated/50 space-y-1 p-3 text-sm">
          <p class="text-highlighted font-medium">
            Orden puesta: releer desde el {{ pedida.desde }}
          </p>
          <p class="text-muted">
            El agente la recoge en segundos y va subiendo el rango. Las checadas van saliendo en
            Marcajes y en cada expediente.
          </p>
        </div>

        <!--
          LA TRAMPA QUE HAY QUE DECIR ANTES, no después.

          Una checada de alguien que el reloj no tiene vinculado no entra en
          ningún expediente: se va a la bandeja. Y vincularlo luego NO la
          rescata por sí solo — la marca resuelta y nada más. La recuperación sí
          la rescata, porque suelta esas checadas en el agente para que las
          vuelva a entregar. O sea: conciliar primero, recuperar después.
        -->
        <UAlert
          v-if="porElAgente && (pedida?.sinDuenoPendientes ?? 0) > 0"
          icon="i-lucide-users"
          color="warning"
          title="Hay checadas sin dueño de este reloj"
          :description="`${pedida?.sinDuenoPendientes} esperan en la bandeja. Mientras ese número no sea cero, lo que recuperes de esas personas volverá a caer ahí: vincúlalas y pide la recuperación otra vez.`"
        >
          <template #actions>
            <UButton :to="{ name: 'unmatched-punches' }" label="Ver la bandeja" />
          </template>
        </UAlert>

        <div v-if="started && last" class="bg-elevated/50 space-y-1 p-3 text-sm">
          <p class="text-highlighted font-medium">
            {{ last.watermarkLabel ?? 'Sin marca todavía' }}
          </p>
          <p class="text-muted">
            {{ total.inserted }} checadas registradas · {{ total.unmatched }} de gente sin enrolar ·
            {{ total.duplicates }} repetidas que ya estaban
          </p>
          <p class="text-dimmed text-xs">
            {{ vueltas }} {{ vueltas === 1 ? 'lectura' : 'lecturas' }} · {{ total.batches }} tramos
          </p>
          <!--
            Si tras agotar las vueltas TODAVÍA queda, se dice: callarlo dejaría
            creer que el equipo está al día cuando no lo está.
          -->
          <p v-if="last.hasMore" class="text-warning text-xs">
            Quedan más eventos en el equipo. Pulsa otra vez para seguir leyendo.
          </p>
          <p v-else class="text-success text-xs">
            No quedan eventos por leer: el equipo está al día.
          </p>
        </div>

        <!--
          Las checadas de gente que no está enrolada no se pierden: esperan en la
          bandeja hasta que se concilie el padrón. Decirlo evita que alguien
          piense que la lectura falló.
        -->
        <UAlert
          v-if="started && total.unmatched > 0 && total.inserted === 0"
          icon="i-lucide-info"
          color="info"
          title="Todas fueron a la bandeja de sin dueño"
          description="Es lo esperado mientras nadie del padrón esté enrolado. Concilia el padrón del reloj y VUELVE A LEER: vincular a alguien marca esas checadas como resueltas, pero no las mete en su expediente por sí solo."
        >
          <template #actions>
            <UButton :to="{ name: 'unmatched-punches' }" label="Ver la bandeja" />
          </template>
        </UAlert>

        <ApiErrorAlert :error="error" :fields="['username', 'password']" />

        <div class="flex justify-end gap-2">
          <UButton label="Cerrar" @click="open = false" />
          <UButton
            v-if="porElAgente"
            :label="pedida ? 'Pedirlo otra vez' : 'Pedir la recuperación'"
            icon="i-lucide-history"
            :loading="working"
            :disabled="desde === ''"
            @click="pedirAlAgente"
          />
          <UButton
            v-else
            :label="
              working
                ? `Leyendo… (${vueltas})`
                : started && last?.hasMore
                  ? 'Seguir leyendo'
                  : started
                    ? 'Leer otra vez'
                    : 'Leer checadas'
            "
            icon="i-lucide-download"
            :loading="working"
            :disabled="!canRead"
            @click="read"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
