<script setup lang="ts">
import { computed } from 'vue'
import type { Installation, LegalEntity } from '@/modules/org/types'
import { ALCANCE, type RolDisponible, type TipoDeAlcance } from '../types'

/**
 * LOS TRES CAMPOS QUE DEFINEN UN PERMISO: qué rol, hasta dónde, y sobre qué.
 *
 * Vive aparte porque se rellenan en DOS sitios —al dar de alta una cuenta y al
 * añadirle otro permiso a una que ya existe— y son el mismo formulario. Con el
 * bloque duplicado, el día que aparezca un cuarto tipo de alcance uno de los dos
 * se queda viejo y ofrece permisos que el otro no.
 *
 * LOS CATÁLOGOS LLEGAN POR PROPS y no se piden aquí: quien abre la pantalla es
 * el que tiene que poder decir «no pude cargar los datos». Pidiéndolos dentro,
 * un catálogo caído dejaría tres desplegables vacíos sin una palabra de por qué.
 */
const props = defineProps<{
  roles: readonly RolDisponible[]
  empresas: readonly LegalEntity[]
  bases: readonly Installation[]
}>()

const roleCode = defineModel<string>('roleCode', { required: true })
const scopeType = defineModel<TipoDeAlcance>('scopeType', { required: true })
const scopeId = defineModel<string>('scopeId', { required: true })

const opcionesDeRol = computed(() => props.roles.map((r) => ({ label: r.name, value: r.code })))

const opcionesDeAlcance = computed(() =>
  (Object.keys(ALCANCE) as TipoDeAlcance[]).map((k) => ({
    label: ALCANCE[k].label,
    value: k,
  })),
)

const opcionesDeDestino = computed(() =>
  scopeType.value === 'LEGAL_ENTITY'
    ? props.empresas.map((e) => ({ label: e.businessName, value: e.id }))
    : props.bases.map((b) => ({ label: b.name, value: b.id })),
)

/**
 * Cambiar de tipo de alcance invalida el destino elegido: una base no es una
 * empresa, y dejar el id viejo mandaría un destino que no existe en esa lista.
 *
 * Se hace al ELEGIR y no con un `watch` sobre el modelo: así el padre puede
 * rellenar los tres valores de golpe —al reabrir un formulario, por ejemplo—
 * sin que este componente le borre el destino por detrás.
 */
function elegirAlcance(tipo: TipoDeAlcance): void {
  scopeType.value = tipo
  scopeId.value = ''
}
</script>

<template>
  <div class="space-y-3">
    <UFormField label="Rol">
      <USelectMenu
        v-model="roleCode"
        :items="opcionesDeRol"
        value-key="value"
        placeholder="Elige un rol"
        class="w-full"
      />
    </UFormField>

    <UFormField label="Hasta dónde alcanza" :help="ALCANCE[scopeType].ayuda">
      <USelectMenu
        :model-value="scopeType"
        :items="opcionesDeAlcance"
        value-key="value"
        class="w-full"
        @update:model-value="elegirAlcance"
      />
    </UFormField>

    <UFormField
      v-if="scopeType !== 'HOLDING'"
      :label="scopeType === 'LEGAL_ENTITY' ? 'Razón social' : 'Base'"
    >
      <USelectMenu
        v-model="scopeId"
        :items="opcionesDeDestino"
        value-key="value"
        placeholder="Elige"
        class="w-full"
      />
    </UFormField>
  </div>
</template>
