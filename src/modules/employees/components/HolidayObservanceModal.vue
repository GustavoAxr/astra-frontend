<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import { useAsync } from '@/shared/composables/useAsync'
import { orgApi } from '@/modules/org/api'
import { employeesApi } from '../api'
import type { Holiday } from '../types'

/**
 * EN QUÉ DÍA TOMA ESTA EMPRESA UN FESTIVO DE LEY.
 *
 * LO QUE ESTE MODAL **NO** HACE: editar el festivo. El 2 de febrero sigue
 * siendo el 2 de febrero para todos los inquilinos de la nube, y por eso los
 * renglones `Nacional` no tienen lápiz. Lo que se guarda aquí es una fila
 * propia de la razón social que dice qué día da ella el descanso.
 *
 * Son DOS FECHAS y hacen dos trabajos distintos: el día que se toma es el que
 * no cuenta falta, y la fecha de ley es la que paga prima a quien la trabaje.
 * Que la prima se quede allí o viaje con el descanso lo decide cada empresa en
 * la casilla de abajo.
 */
const props = defineProps<{
  /** El festivo de ley que se está moviendo. */
  holiday: Holiday | null
  /** La razón social del filtro de arriba, como punto de partida. */
  legalEntityId: string | null
}>()
const emit = defineEmits<{ saved: [] }>()
const aviso = useAviso()

const open = defineModel<boolean>('open', { default: false })

const entityId = ref('')
const observedDate = ref('')
const premiumOnLegalDate = ref(true)
const submitting = ref(false)
const error = ref<Error | null>(null)

const entities = useAsync((signal) => orgApi.legalEntities(false, signal))
const entityItems = computed(() =>
  (entities.data.value ?? []).map((e) => ({ label: e.businessName, value: e.id })),
)

/** Lo que esta razón social tenía puesto, si es que tenía algo. */
const actual = computed(
  () => props.holiday?.observances.find((o) => o.legalEntityId === entityId.value) ?? null,
)

const añoDeLey = computed(() => props.holiday?.holidayDate.slice(0, 4) ?? '')
const mismoAño = computed(() => observedDate.value.slice(0, 4) === añoDeLey.value)

const valid = computed(() => entityId.value !== '' && observedDate.value !== '' && mismoAño.value)

/** Si no se movió de sitio, no hay nada que guardar. */
const sinCambios = computed(
  () =>
    actual.value !== null &&
    actual.value.observedDate === observedDate.value &&
    actual.value.premiumOnLegalDate === premiumOnLegalDate.value,
)

/**
 * Al abrir, y también al cambiar de razón social: cada una tiene su propio día
 * y enseñar el de la anterior haría creer que ya está puesto.
 */
function cargar(): void {
  const suya = actual.value
  observedDate.value = suya?.observedDate ?? props.holiday?.holidayDate ?? ''
  premiumOnLegalDate.value = suya?.premiumOnLegalDate ?? true
}

watch(
  open,
  (abierto) => {
    if (!abierto) return
    error.value = null
    void entities.run()
    entityId.value = props.legalEntityId ?? ''
    cargar()
  },
  { immediate: true },
)

function elegirEmpresa(id: string): void {
  entityId.value = id
  cargar()
}

async function submit(): Promise<void> {
  if (!valid.value || submitting.value || props.holiday === null) return
  submitting.value = true
  error.value = null

  try {
    await employeesApi.moverFestivo(props.holiday.id, {
      legalEntityId: entityId.value,
      observedDate: observedDate.value,
      premiumOnLegalDate: premiumOnLegalDate.value,
    })
    aviso.hecho(
      `${props.holiday.name} se toma el ${observedDate.value}`,
      observedDate.value === props.holiday.holidayDate
        ? 'En la misma fecha de ley.'
        : `La fecha de ley sigue siendo el ${props.holiday.holidayDate}.`,
    )
    open.value = false
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    submitting.value = false
  }
}

async function devolver(): Promise<void> {
  if (submitting.value || props.holiday === null || actual.value === null) return
  submitting.value = true
  error.value = null

  try {
    await employeesApi.devolverFestivoALaLey(props.holiday.id, entityId.value)
    aviso.hecho(`${props.holiday.name} vuelve a la fecha de ley`)
    open.value = false
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    submitting.value = false
  }
}

const fecha = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
/** Partida a mano: `new Date('2026-02-02')` se lee como UTC y en México retrocede un día. */
function cuando(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return fecha.format(new Date(a ?? 0, (m ?? 1) - 1, d ?? 1))
}
</script>

<template>
  <UModal
    v-if="holiday"
    v-model:open="open"
    :title="`¿Qué día tomas «${holiday.name}»?`"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <form class="space-y-4" @submit.prevent="submit">
        <!--
          La fecha de ley se enseña arriba y no se puede tocar. Es la mitad de
          la explicación: sin ella, «se toma el 5 de febrero» no dice de qué.
        -->
        <UAlert icon="i-lucide-scale" color="neutral">
          <template #description>
            De ley es el <span class="capitalize">{{ cuando(holiday.holidayDate) }}</span> de
            {{ añoDeLey }}, y eso no cambia: es el mismo día para todas las empresas. Aquí solo se
            dice qué día lo da la tuya.
          </template>
        </UAlert>

        <UFormField
          label="Razón social"
          required
          help="Cada empresa decide el suyo. Mover el de una no toca a las demás."
        >
          <USelectMenu
            :model-value="entityId"
            :items="entityItems"
            value-key="value"
            class="w-full"
            @update:model-value="elegirEmpresa"
          />
        </UFormField>

        <UFormField
          label="Se toma el"
          required
          :error="
            observedDate !== '' && !mismoAño
              ? `Ese festivo es de ${añoDeLey}: el día en que se toma tiene que caer en el mismo año.`
              : undefined
          "
        >
          <UInput v-model="observedDate" type="date" class="w-full" />
        </UFormField>

        <p v-if="valid && observedDate !== holiday.holidayDate" class="text-muted text-sm">
          El <span class="capitalize">{{ cuando(observedDate) }}</span> deja de contar falta. El
          <span class="capitalize">{{ cuando(holiday.holidayDate) }}</span> vuelve a medirse como
          día de trabajo.
        </p>

        <!--
          La casilla dice QUÉ PASA CON EL DINERO, no cómo se llama la opción.
          Encendida es lo que no debe de menos, y por eso es el valor de partida.
        -->
        <UFormField
          label="La prima se queda en la fecha de ley"
          help="Encendida, quien trabaje el día de ley cobra la prima aunque el descanso esté en otra fecha (art. 75 LFT). Apagada, la prima viaja con el descanso y ese día de ley se paga como cualquier otro."
        >
          <USwitch v-model="premiumOnLegalDate" label="La prima no se mueve" />
        </UFormField>

        <ApiErrorAlert :error="error" />

        <div class="flex items-center justify-end gap-2 pt-2">
          <UButton
            v-if="actual"
            label="Volver a la fecha de ley"
            icon="i-lucide-undo-2"
            class="mr-auto"
            :disabled="submitting"
            @click="devolver"
          />
          <UButton label="Cancelar" :disabled="submitting" @click="open = false" />
          <UButton
            type="submit"
            label="Guardar"
            icon="i-lucide-check"
            :disabled="!valid || sinCambios"
            :loading="submitting"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
