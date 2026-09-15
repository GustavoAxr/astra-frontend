<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAsync } from '@/shared/composables/useAsync'
import { useAviso } from '@/shared/ui/aviso'
import { attendanceApi } from '../api'
import { ESTADOS_QUE_SE_PUEDEN_FORZAR, type DerivedDay, type TipoDeCorreccion } from '../types'

/**
 * CERRAR UN DÍA QUE EL RELOJ DEJÓ A MEDIAS.
 *
 * ══ ESTO NO EDITA NADA: PROPONE ══
 *
 * Lo que sale de aquí es una solicitud que queda PENDIENTE hasta que la firma
 * la dirección. El día no cambia al pulsar guardar, y eso se dice con todas las
 * letras: quien corrige tiene que saber que todavía no está hecho, o volverá
 * mañana a corregir lo mismo creyendo que se perdió.
 *
 * ══ Y LA EVIDENCIA NO SE TOCA ══
 *
 * Ni siquiera «la checada que no cuenta» la borra: la base le tiene revocado el
 * borrado a la aplicación. La checada sigue en Marcajes y sigue siendo lo que
 * se enseña en una auditoría; lo único que cambia es que deja de sumar.
 */
const props = defineProps<{
  employeeId: string
  employeeName: string
  dia: DerivedDay
}>()
const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
const aviso = useAviso()

const tipo = ref<TipoDeCorreccion>('ADD_PUNCH')
const hora = ref('')
const checadasElegidas = ref<string[]>([])
const estado = ref('PERMISSION')
const motivo = ref('')
const submitting = ref(false)
const error = ref<Error | null>(null)

/**
 * Las checadas de ese día, con su id.
 *
 * Hacen falta para poder señalar CUÁL deja de contar: el día calculado trae la
 * primera y la última, pero no sus identificadores, y sin id no hay nada que
 * señalar. Se piden solo cuando el modal se abre.
 */
const checadas = useAsync((signal) =>
  attendanceApi.punches(
    {
      employeeId: props.employeeId,
      from: props.dia.workDate,
      to: props.dia.workDate,
      limit: 50,
      page: 1,
    },
    signal,
  ),
)

const hhmm = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
/**
 * Las checadas del día, de la primera a la última.
 *
 * EN ORDEN Y CON LA HORA DELANTE, que es lo único que se mira: el número de
 * serie del equipo es el mismo en todas y no distingue nada. Antes iban como
 * venían de la consulta —de la más reciente a la más vieja— y eso obligaba a
 * leer la lista al revés para reconstruir el día.
 */
const checadasDelDia = computed(() =>
  [...(checadas.data.value?.data ?? [])].sort((a, b) => a.punchTime.localeCompare(b.punchTime)),
)

const opcionesDeChecada = computed(() =>
  checadasDelDia.value.map((p) => ({
    label: hhmm.format(new Date(p.punchTime)),
    value: p.id,
  })),
)

/**
 * CÓMO QUEDARÍA EL DÍA, dicho antes de proponer nada.
 *
 * Es lo que quita la duda de raíz. La pregunta que se hace quien mira esta
 * lista es «¿entonces el día termina a las 17:24?», y ninguna etiqueta la
 * contesta tan bien como enseñar el resultado. Sin esto, marcar la checada
 * equivocada —la buena en vez de las malas— no se descubre hasta que alguien
 * firma y el día sale peor que antes.
 */
const comoQuedaria = computed(() => {
  const quedan = checadasDelDia.value.filter((p) => !checadasElegidas.value.includes(p.id))
  if (checadasElegidas.value.length === 0) return null
  if (quedan.length === 0) return 'El día se quedaría SIN NINGUNA checada.'

  const primera = quedan[0]
  const ultima = quedan[quedan.length - 1]
  if (quedan.length === 1) {
    return `El día se quedaría con una sola checada, a las ${hhmm.format(new Date(primera!.punchTime))}.`
  }
  return (
    `El día quedaría de ${hhmm.format(new Date(primera!.punchTime))} ` +
    `a ${hhmm.format(new Date(ultima!.punchTime))}, con ${quedan.length} checadas.`
  )
})

/**
 * QUÉ CORRECCIÓN SE OFRECE PRIMERO, según lo que le pasa al día.
 *
 * Abrir siempre en «poner la checada que falta» obligaría a quien viene a
 * descartar una checada rara a cambiar el selector cada vez. El día ya dice
 * cuál es su problema; proponerlo es leer lo que está delante.
 */
function tipoQueProcede(d: DerivedDay): TipoDeCorreccion {
  if (d.punchCount === 1) return 'ADD_PUNCH'
  if (d.unapprovedOvertimeMinutes > 0) return 'IGNORE_PUNCH'
  return 'OVERRIDE_STATUS'
}

const TIPOS: { label: string; value: TipoDeCorreccion }[] = [
  { label: 'Poner la checada que falta', value: 'ADD_PUNCH' },
  { label: 'Que una o varias checadas no cuenten', value: 'IGNORE_PUNCH' },
  { label: 'Decir qué fue ese día', value: 'OVERRIDE_STATUS' },
]

const valid = computed(() => {
  if (motivo.value.trim().length < 5) return false
  if (tipo.value === 'ADD_PUNCH') return /^([01]\d|2[0-3]):[0-5]\d$/.test(hora.value)
  if (tipo.value === 'IGNORE_PUNCH') return checadasElegidas.value.length > 0
  return estado.value !== ''
})

watch(
  open,
  (abierto) => {
    if (!abierto) return
    error.value = null
    tipo.value = tipoQueProcede(props.dia)
    hora.value = ''
    checadasElegidas.value = []
    estado.value = 'PERMISSION'
    motivo.value = ''
    void checadas.run()
  },
  { immediate: true },
)

async function submit(): Promise<void> {
  if (!valid.value || submitting.value) return
  submitting.value = true
  error.value = null

  try {
    /*
     * UNA CORRECCIÓN POR CHECADA, y no una que las cubra todas.
     *
     * La base señala UNA checada por fila —`target_punch_id`— y eso es lo
     * correcto: cada una se firma o se rechaza por su cuenta, y si la dirección
     * está de acuerdo con quitar la de las 21:51 pero no la de las 21:38, puede
     * decirlo. Una fila que las cubriera todas obligaría a firmar en bloque.
     *
     * Lo que sí se hace aquí es no obligar a RRHH a repetir el formulario: se
     * eligen juntas y salen juntas, con el mismo motivo.
     */
    const aQuitar = tipo.value === 'IGNORE_PUNCH' ? checadasElegidas.value : [null]

    for (const punchId of aQuitar) {
      await attendanceApi.requestAdjustment({
        employeeId: props.employeeId,
        workDate: props.dia.workDate,
        adjustmentType: tipo.value,
        /*
         * Se manda SOLO el campo del tipo elegido. `forbidNonWhitelisted` está
         * activo y un campo de más devuelve 400 — pero además mandar la hora de
         * una corrección que no la usa dejaría escrito en la base un dato que
         * nadie puso y que nadie va a leer.
         */
        ...(tipo.value === 'ADD_PUNCH' ? { proposedTime: hora.value } : {}),
        ...(punchId !== null ? { targetPunchId: punchId } : {}),
        ...(tipo.value === 'OVERRIDE_STATUS' ? { proposedStatus: estado.value } : {}),
        reason: motivo.value.trim(),
      })
    }

    aviso.hecho(
      aQuitar.length > 1 ? `${aQuitar.length} correcciones propuestas` : 'Corrección propuesta',
      'Queda pendiente hasta que la dirección la firme. El día no cambia todavía.',
    )
    open.value = false
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    submitting.value = false
  }
}

const fecha = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
function cuando(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return fecha.format(new Date(a ?? 0, (m ?? 1) - 1, d ?? 1))
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`Corregir el día de ${employeeName}`"
    :description="cuando(dia.workDate)"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <form class="space-y-4" @submit.prevent="submit">
        <!--
          LO QUE DICE EL RELOJ, ARRIBA Y SIN ADORNOS. Quien corrige tiene que
          ver contra qué corrige; sin esto hay que cerrar el modal para
          acordarse de a qué hora entró.
        -->
        <div
          class="border-default bg-elevated/30 flex flex-wrap gap-x-6 gap-y-1 border p-3 text-sm"
        >
          <span class="text-muted">
            Checadas: <span class="text-default">{{ dia.punchCount }}</span>
          </span>
          <span v-if="dia.firstPunch" class="text-muted">
            Primera: <span class="text-default">{{ hhmm.format(new Date(dia.firstPunch)) }}</span>
          </span>
          <span v-if="dia.lastPunch && dia.punchCount > 1" class="text-muted">
            Última: <span class="text-default">{{ hhmm.format(new Date(dia.lastPunch)) }}</span>
          </span>
          <span v-if="dia.unapprovedOvertimeMinutes > 0" class="text-warning">
            {{ dia.unapprovedOvertimeMinutes }} min de más sin autorizar
          </span>
        </div>

        <UFormField label="Qué hay que corregir" required>
          <USelectMenu v-model="tipo" :items="TIPOS" value-key="value" class="w-full" />
        </UFormField>

        <UFormField
          v-if="tipo === 'ADD_PUNCH'"
          label="Hora de la checada que falta"
          required
          help="En la hora de su instalación, como 17:00. La convierte el servidor, que sabe en qué zona trabaja."
        >
          <UInput v-model="hora" type="time" class="w-full" />
        </UFormField>

        <UFormField
          v-else-if="tipo === 'IGNORE_PUNCH'"
          label="Cuáles dejan de contar"
          required
          help="Marca las que SOBRAN, no la buena. Puedes elegir varias. No se borran: siguen en Marcajes y siguen siendo lo que se enseña en una auditoría; solo dejan de sumar."
        >
          <USelectMenu
            v-model="checadasElegidas"
            :items="opcionesDeChecada"
            value-key="value"
            multiple
            :loading="checadas.pending.value"
            placeholder="Elige las que sobran"
            class="w-full"
          />
        </UFormField>

        <!--
          CÓMO QUEDARÍA EL DÍA. Es lo que quita la duda de raíz: la pregunta de
          quien mira la lista es «¿entonces el día termina a las 17:24?», y
          ninguna etiqueta la contesta tan bien como enseñar el resultado.
        -->
        <p
          v-if="tipo === 'IGNORE_PUNCH' && comoQuedaria"
          class="text-sm"
          :class="checadasElegidas.length === checadasDelDia.length ? 'text-warning' : 'text-info'"
        >
          {{ comoQuedaria }}
        </p>

        <UFormField
          v-else
          label="Qué fue ese día"
          required
          help="Lo que una persona puede saber mirando el caso. «A tiempo» y «retardo» no están: eso lo mide el reloj contra el turno."
        >
          <USelectMenu
            v-model="estado"
            :items="ESTADOS_QUE_SE_PUEDEN_FORZAR"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <!--
          EL MOTIVO NO ES OPCIONAL, y no por burocracia: es lo único que queda
          escrito de por qué un día dejó de decir lo que decía. Lo lee quien
          firma, y lo lee quien audite dentro de dos años.
        -->
        <UFormField
          label="Por qué"
          required
          help="Lo lee quien firma. Queda guardado con la corrección."
        >
          <UTextarea
            v-model="motivo"
            :rows="2"
            placeholder="Se fue sin checar; lo confirmó su jefe de área."
            class="w-full"
          />
        </UFormField>

        <UAlert icon="i-lucide-pen-line" color="neutral">
          <template #description>
            Esto no cambia el día todavía: queda <strong>pendiente</strong> hasta que la dirección
            lo firme. Tú no puedes firmar lo que pides.
          </template>
        </UAlert>

        <ApiErrorAlert :error="error" />

        <div class="flex justify-end gap-2 pt-2">
          <UButton label="Cancelar" :disabled="submitting" @click="open = false" />
          <UButton
            type="submit"
            label="Proponer la corrección"
            icon="i-lucide-check"
            :disabled="!valid"
            :loading="submitting"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
