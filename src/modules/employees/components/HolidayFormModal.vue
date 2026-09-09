<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import { useAsync } from '@/shared/composables/useAsync'
import { orgApi } from '@/modules/org/api'
import { employeesApi } from '../api'
import type { Holiday } from '../types'

/**
 * Alta y corrección de un día festivo.
 *
 * LA RAZÓN SOCIAL ES OBLIGATORIA Y NO HAY OPCIÓN DE «TODAS».
 *
 * Un festivo sin razón social es de ley: lo ve todo el mundo, y en la nube
 * compartida eso incluye a clientes que no son este. Dejar aquí un «aplica a
 * todas» sería dar a un administrador la posibilidad de meter un día no
 * laborable en la nómina ajena. Los de ley se siembran con una migración, que
 * es donde se decide algo que afecta a todos.
 */
const props = defineProps<{
  /** `null` = alta. Con festivo = corrección. */
  holiday: Holiday | null
  /** La razón social del filtro de arriba, como punto de partida. */
  legalEntityId: string | null
  año: number
}>()
const emit = defineEmits<{ saved: [] }>()
const aviso = useAviso()

const open = defineModel<boolean>('open', { default: false })

const entityId = ref('')
const holidayDate = ref('')
const name = ref('')
const isMandatoryRest = ref(true)
const submitting = ref(false)
const error = ref<Error | null>(null)

const entities = useAsync((signal) => orgApi.legalEntities(false, signal))
const entityItems = computed(() =>
  (entities.data.value ?? []).map((e) => ({ label: e.businessName, value: e.id })),
)

const editando = computed(() => props.holiday !== null)
const valid = computed(
  () => entityId.value !== '' && holidayDate.value !== '' && name.value.trim() !== '',
)

watch(
  open,
  (abierto) => {
    if (!abierto) return
    error.value = null
    void entities.run()

    if (props.holiday) {
      entityId.value = props.holiday.legalEntityId ?? ''
      holidayDate.value = props.holiday.holidayDate
      name.value = props.holiday.name
      isMandatoryRest.value = props.holiday.isMandatoryRest
      return
    }

    entityId.value = props.legalEntityId ?? ''
    /*
     * Se propone el 1 de enero DEL AÑO QUE SE ESTÁ MIRANDO, no el día de hoy.
     * Quien abre el calendario de 2027 en septiembre de 2026 va a capturar
     * fechas de 2027, y arrancar con la de hoy le obliga a corregir el año en
     * cada alta.
     */
    holidayDate.value = `${props.año}-01-01`
    name.value = ''
    isMandatoryRest.value = true
  },
  { immediate: true },
)

async function submit(): Promise<void> {
  if (!valid.value || submitting.value) return
  submitting.value = true
  error.value = null

  try {
    if (props.holiday) {
      /*
       * Solo lo que cambió: `forbidNonWhitelisted` está activo y la razón
       * social no se puede mover de sitio —sería otro festivo, no el mismo—.
       */
      const cambios: Record<string, string | boolean> = {}
      if (holidayDate.value !== props.holiday.holidayDate) {
        cambios.holidayDate = holidayDate.value
      }
      if (name.value.trim() !== props.holiday.name) cambios.name = name.value.trim()
      if (isMandatoryRest.value !== props.holiday.isMandatoryRest) {
        cambios.isMandatoryRest = isMandatoryRest.value
      }

      // Sin cambios no se avisa de nada: un «actualizado» tras abrir y cerrar
      // sin tocar nada le enseña a la gente a ignorar los avisos.
      if (Object.keys(cambios).length > 0) {
        await employeesApi.actualizarFestivo(props.holiday.id, cambios)
        aviso.actualizado(name.value.trim())
      }
    } else {
      await employeesApi.crearFestivo({
        legalEntityId: entityId.value,
        holidayDate: holidayDate.value,
        name: name.value.trim(),
        isMandatoryRest: isMandatoryRest.value,
      })
      aviso.creado('Día festivo', `${name.value.trim()} · ${holidayDate.value}`)
    }

    open.value = false
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="editando ? 'Corregir día festivo' : 'Nuevo día festivo'">
    <template #body>
      <form class="space-y-4" @submit.prevent="submit">
        <UFormField
          label="Razón social"
          required
          help="Un festivo pertenece a una empresa. Los de ley ya vienen cargados y no se editan aquí."
        >
          <USelectMenu
            v-model="entityId"
            :items="entityItems"
            value-key="value"
            :disabled="editando"
            class="w-full"
          />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Día" required>
            <UInput v-model="holidayDate" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Motivo" required>
            <UInput v-model="name" placeholder="Aniversario de la planta" class="w-full" />
          </UFormField>
        </div>

        <!--
          Se dice QUÉ CAMBIA al apagarlo, no solo cómo se llama la opción:
          «descanso obligatorio» a secas no explica que trabajarlo se paga
          distinto, que es justamente lo que decide esta casilla.
        -->
        <UFormField
          label="Descanso obligatorio"
          help="Encendido, quien trabaje ese día cobra la prima que marca la ley. Apagado, es un día normal con nombre."
        >
          <USwitch v-model="isMandatoryRest" label="Obliga a descansar" />
        </UFormField>

        <ApiErrorAlert :error="error" />

        <div class="flex justify-end gap-2 pt-2">
          <UButton label="Cancelar" :disabled="submitting" @click="open = false" />
          <UButton
            type="submit"
            :label="editando ? 'Guardar' : 'Añadir'"
            icon="i-lucide-check"
            :disabled="!valid"
            :loading="submitting"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
