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
const checadaElegida = ref('')
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
const opcionesDeChecada = computed(() =>
  (checadas.data.value?.data ?? []).map((p) => ({
    label: `${hhmm.format(new Date(p.punchTime))} · ${p.serialNumber ?? 'sin equipo'}`,
    value: p.id,
  })),
)

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
  { label: 'Que una checada no cuente', value: 'IGNORE_PUNCH' },
  { label: 'Decir qué fue ese día', value: 'OVERRIDE_STATUS' },
]

const valid = computed(() => {
  if (motivo.value.trim().length < 5) return false
  if (tipo.value === 'ADD_PUNCH') return /^([01]\d|2[0-3]):[0-5]\d$/.test(hora.value)
  if (tipo.value === 'IGNORE_PUNCH') return checadaElegida.value !== ''
  return estado.value !== ''
})

watch(
  open,
  (abierto) => {
    if (!abierto) return
    error.value = null
    tipo.value = tipoQueProcede(props.dia)
    hora.value = ''
    checadaElegida.value = ''
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
      ...(tipo.value === 'IGNORE_PUNCH' ? { targetPunchId: checadaElegida.value } : {}),
      ...(tipo.value === 'OVERRIDE_STATUS' ? { proposedStatus: estado.value } : {}),
      reason: motivo.value.trim(),
    })

    aviso.hecho(
      'Corrección propuesta',
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
          label="Cuál deja de contar"
          required
          help="No se borra: sigue en Marcajes y sigue siendo lo que se enseña en una auditoría. Solo deja de sumar."
        >
          <USelectMenu
            v-model="checadaElegida"
            :items="opcionesDeChecada"
            value-key="value"
            :loading="checadas.pending.value"
            placeholder="Elige la checada"
            class="w-full"
          />
        </UFormField>

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
