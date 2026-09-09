<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAsync } from '@/shared/composables/useAsync'
import { PAGE_SIZE } from '@/shared/api/pagination'
import { useLegalEntityFilter } from '@/modules/org/store'
import { reconcileLegalEntityFilter } from '@/modules/org/filter-reconcile'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { mergeQuery, type QueryChanges } from '@/shared/router/query'
import { useAuthStore } from '@/modules/auth/store'
import { orgApi } from '@/modules/org/api'
import { employeesApi } from '../api'
import EmployeeFormModal from '../components/EmployeeFormModal.vue'
import { ESTADOS_DE_PLANTILLA, type Employee, type EstadoDePlantilla } from '../types'

const route = useRoute()
const router = useRouter()
const legalEntityFilter = useLegalEntityFilter()
const auth = useAuthStore()

/**
 * Dar de alta personal es de RRHH y del administrador de la razón social; el
 * director no escribe nada. Ocultar el botón evita ofrecer algo que va a dar
 * 403, pero el permiso lo sigue aplicando el servidor.
 */
const canCreate = computed(() => auth.can('assignEmployee'))

const formOpen = ref(false)
const entities = useAsync(() => orgApi.legalEntities())
void entities.run()

/**
 * La URL es la fuente de verdad de los filtros.
 *
 * No un `ref` en el componente: así el estado sobrevive a un recargar, el botón
 * atrás deshace el filtro y una búsqueda se puede pegar en un chat. El store
 * del selector de empresa solo recuerda la última elección entre pantallas.
 */
const page = computed(() => Number(route.query.page ?? 1) || 1)
const search = computed(() => String(route.query.search ?? ''))

/**
 * Qué parte de la plantilla se mira. En la URL, como el resto de los filtros:
 * así «los dados de baja» es un enlace que se puede compartir y sobrevive a un
 * recargar.
 *
 * Por omisión, los activos. La vista de las bajas es la que hacía falta para
 * responder a «¿quién sigue en el reloj pero ya no trabaja aquí?».
 */
const estado = computed<EstadoDePlantilla>(() => {
  const valor = String(route.query.estado ?? 'activos')
  return valor === 'inactivos' || valor === 'todos' ? valor : 'activos'
})
const legalEntityId = computed(() =>
  typeof route.query.legalEntityId === 'string' ? route.query.legalEntityId : undefined,
)

const searchInput = ref(search.value)

const { data, pending, error, loaded, run } = useAsync((signal) =>
  employeesApi.list(
    {
      page: page.value,
      limit: PAGE_SIZE,
      search: search.value,
      estado: estado.value,
      legalEntityId: legalEntityId.value,
    },
    signal,
  ),
)

const rows = computed<Employee[]>(() => data.value?.data ?? [])
const total = computed(() => data.value?.total ?? 0)

function fullName(employee: Employee): string {
  return [employee.firstName, employee.lastName, employee.secondLastName].filter(Boolean).join(' ')
}

/** Un filtro nuevo siempre vuelve a la página 1: la 7 de otro filtro no existe. */
function apply(changes: QueryChanges): void {
  void router.replace({ query: mergeQuery(route.query, changes) })
}

let debounce: ReturnType<typeof setTimeout> | undefined

watch(searchInput, (value) => {
  clearTimeout(debounce)
  // Se escribe en la URL, no en un estado aparte: un solo sitio donde mirar.
  debounce = setTimeout(() => apply({ search: value || undefined, page: undefined }), 300)
})

/*
 * Reconciliación entre la URL y el selector de la barra superior, UNA sola vez
 * al entrar. El orden importa y es lo que hay que respetar:
 *
 *   · si la URL trae empresa, manda la URL (es lo que se compartió o recargó);
 *   · si no la trae pero el selector recordaba una, se escribe en la URL;
 *   · si no hay ninguna de las dos, se ven todas.
 *
 * Lo que NO se puede hacer es sincronizar «URL → selector» con un watcher
 * `immediate`: corre durante el setup, ve la URL todavía sin parámetro y borra
 * el recuerdo antes de que nadie pueda restaurarlo. Volver a Plantilla desde
 * otro menú perdía la empresa elegida exactamente por eso.
 */
const reconciliation = reconcileLegalEntityFilter(legalEntityId.value, legalEntityFilter.selectedId)

if (reconciliation.action === 'adopt') {
  legalEntityFilter.select(reconciliation.legalEntityId)
} else if (reconciliation.action === 'push') {
  apply({ legalEntityId: reconciliation.legalEntityId, page: undefined })
}

// A partir de aquí la URL manda, pero solo cuando trae valor: que el parámetro
// desaparezca significa «todas», y eso ya lo escribió el propio selector.
watch(legalEntityId, (value) => {
  if (value !== undefined) legalEntityFilter.select(value)
})

watch([page, search, estado, legalEntityId], () => void run(), { immediate: true })
</script>

<template>
  <section class="space-y-4">
    <PageHeader
      title="Plantilla"
      description="Las personas dadas de alta en las empresas que alcanzas."
      :count="loaded ? `${total}` : undefined"
    >
      <template #actions>
        <UInput
          v-model="searchInput"
          placeholder="Nombre o clave"
          icon="i-lucide-search"
          class="w-64"
        />
        <USelectMenu
          :model-value="estado"
          :items="ESTADOS_DE_PLANTILLA"
          value-key="value"
          class="w-44"
          @update:model-value="
            (value: string) =>
              apply({ estado: value === 'activos' ? undefined : value, page: undefined })
          "
        />
        <UButton
          v-if="canCreate"
          icon="i-lucide-user-plus"
          label="Nuevo empleado"
          @click="formOpen = true"
        />
      </template>
    </PageHeader>

    <ApiErrorAlert :error="error" />

    <UTable
      :data="rows"
      :columns="[
        { accessorKey: 'employeeCode', header: 'Clave' },
        { id: 'fullName', header: 'Nombre' },
        { id: 'base', header: 'Base' },
        { id: 'turno', header: 'Turno' },
        { id: 'puesto', header: 'Puesto' },
        { accessorKey: 'isActive', header: 'Estado' },
        { id: 'acciones', header: '' },
      ]"
      :loading="pending"
      :empty="search ? 'Nadie coincide con esa búsqueda.' : 'No hay empleados que mostrar.'"
    >
      <template #fullName-cell="{ row }">
        {{ fullName(row.original) }}
      </template>

      <!--
        Base, turno y puesto salen de la vigencia de HOY. Sin ellos la lista no
        sirve para operar: son las tres cosas que RH necesita de un vistazo.
      -->
      <template #base-cell="{ row }">
        <span v-if="row.original.current" class="font-mono text-xs">
          {{ row.original.current.installationCode }}
        </span>
        <span v-else class="text-dimmed">—</span>
      </template>

      <template #turno-cell="{ row }">
        <template v-if="row.original.current">
          <span class="font-mono text-xs">{{ row.original.current.shiftCode }}</span>
        </template>
        <!-- Sin turno no se le calcula asistencia: se dice, no se deja en blanco. -->
        <UBadge v-else label="Sin turno" color="warning" size="sm" />
      </template>

      <!--
        Leía `current.position`, que era el texto libre y desapareció con el
        catálogo de puestos: la columna llevaba enseñando «—» para todo el
        mundo. La fila que entrega la tabla no está tipada, así que el
        `type-check` no lo vio; solo se nota mirando la pantalla.

        Se recorta a un ancho fijo para que un puesto largo no empuje al resto
        de columnas. El nombre completo sale al pasar el ratón — de eso se
        encarga el oyente de `@/shared/ui/overflow-title`, sin marcar nada aquí.
      -->
      <template #puesto-cell="{ row }">
        <span v-if="row.original.current?.positionName" class="block max-w-[13rem] truncate">
          {{ row.original.current.positionName }}
        </span>
        <span v-else class="text-dimmed">—</span>
      </template>

      <template #isActive-cell="{ row }">
        <UBadge
          :label="row.original.isActive ? 'Activo' : 'Inactivo'"
          :color="row.original.isActive ? 'success' : 'neutral'"
        />
      </template>
      <template #acciones-cell="{ row }">
        <UButton
          :to="{ name: 'employee-detail', params: { employeeId: row.original.id } }"
          icon="i-lucide-arrow-right"
          label="Expediente"
          size="xs"
        />
      </template>
    </UTable>

    <EmployeeFormModal
      v-model:open="formOpen"
      :legal-entities="entities.data.value ?? []"
      @saved="run"
    />

    <div v-if="total > PAGE_SIZE" class="flex justify-end">
      <UPagination
        :page="page"
        :items-per-page="PAGE_SIZE"
        :total="total"
        @update:page="(value: number) => apply({ page: value === 1 ? undefined : value })"
      />
    </div>
  </section>
</template>
