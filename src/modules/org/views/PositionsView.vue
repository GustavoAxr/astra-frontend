<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAsync } from '@/shared/composables/useAsync'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import ConfirmDialog from '@/shared/ui/ConfirmDialog.vue'
import DeleteResourceDialog from '@/shared/ui/DeleteResourceDialog.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { useAviso } from '@/shared/ui/aviso'
import { useAuthStore } from '@/modules/auth/store'
import { orgApi } from '../api'
import { useLegalEntityFilter } from '../store'
import CatalogDuplicateModal from '../components/CatalogDuplicateModal.vue'
import type { Position, PositionForm } from '../types'

const aviso = useAviso()

const auth = useAuthStore()
const { selectedId } = storeToRefs(useLegalEntityFilter())

const canWrite = computed(() => auth.can('assignEmployee'))
const canDelete = computed(() => auth.can('deleteEmployee'))

const list = useAsync((signal) => orgApi.positions(selectedId.value ?? undefined, signal))
const entities = useAsync((signal) => orgApi.legalEntities(false, signal))

/**
 * Por razón social y, dentro de cada una, por código. El servidor los devuelve
 * ordenados por código a secas, y así los de tres empresas salen intercalados:
 * `DEP-ADM-01`, `DEP-BIO-01`, `DEP-ADM-02`… que no hay forma de leer.
 */
const rows = computed(() =>
  [...(list.data.value ?? [])].sort(
    (a, b) =>
      entityName(a.legalEntityId).localeCompare(entityName(b.legalEntityId), 'es') ||
      a.code.localeCompare(b.code, 'es'),
  ),
)
const entityName = (id: string): string =>
  (entities.data.value ?? []).find((e) => e.id === id)?.businessName ?? '—'

const editing = ref<Position | null>(null)
const creating = ref(false)
const duplicating = ref<Position | null>(null)
const toggling = ref<Position | null>(null)
const deleting = ref<Position | null>(null)

const form = ref<PositionForm>({ name: '', description: '' })
const entityId = ref('')
const submitting = ref(false)
const formError = ref<Error | null>(null)

/*
 * El código se propone solo, y se deja de proponer en cuanto alguien lo
 * escribe a mano: pisarle lo que acaba de teclear al cambiar de empresa sería
 * insufrible.
 */

const formOpen = computed({
  get: () => creating.value || editing.value !== null,
  set: (v: boolean) => {
    if (!v) {
      creating.value = false
      editing.value = null
    }
  },
})

const valid = computed(
  () => form.value.name.trim() !== '' && (editing.value !== null || entityId.value !== ''),
)

function abrirAlta(): void {
  form.value = { name: '', description: '' }
  entityId.value = selectedId.value ?? ''
  formError.value = null
  creating.value = true
}

function abrirEdicion(d: Position): void {
  form.value = { name: d.name, description: d.description ?? '' }
  entityId.value = d.legalEntityId
  formError.value = null
  editing.value = d
}

async function submit(): Promise<void> {
  if (!valid.value || submitting.value) return
  submitting.value = true
  formError.value = null
  try {
    // La rama mira `editing`, no si el formulario viene lleno: al duplicar, el
    // molde también viene lleno y guardar reescribiría el original.
    if (editing.value) {
      await orgApi.updatePosition(editing.value.id, form.value)
      aviso.actualizado(form.value.name)
    } else {
      await orgApi.createPosition(entityId.value, form.value)
      aviso.creado('Puesto', form.value.name)
    }
    formOpen.value = false
    await list.run()
  } catch (cause) {
    formError.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    submitting.value = false
  }
}

watch(selectedId, () => void list.run(), { immediate: true })
void entities.run()
</script>

<template>
  <div class="space-y-4">
    <PageHeader
      title="Puestos"
      description="Qué hace cada quien. Antes era texto libre, y así «Operador» y «operador» eran dos puestos distintos."
      :count="list.loaded.value ? `${rows.length}` : undefined"
    >
      <template #actions>
        <UButton v-if="canWrite" icon="i-lucide-plus" label="Nuevo puesto" @click="abrirAlta" />
      </template>
    </PageHeader>

    <ApiErrorAlert :error="list.error.value" />

    <EmptyState
      v-if="list.loaded.value && !rows.length"
      icon="i-lucide-briefcase"
      title="Todavía no hay puestos"
      description="Una adscripción sin puesto es válida, así que no bloquean nada. Sirven para que el concentrado por puesto salga con un renglón por puesto y no uno por forma de escribirlo."
    >
      <UButton v-if="canWrite" icon="i-lucide-plus" label="Crear el primero" @click="abrirAlta" />
    </EmptyState>

    <UTable
      v-else
      :data="rows"
      :columns="[
        { accessorKey: 'code', header: 'Código' },
        { accessorKey: 'name', header: 'Nombre' },
        { id: 'empresa', header: 'Razón social' },
        { id: 'descripcion', header: 'Descripción' },
        { id: 'gente', header: 'Personas hoy' },
        { id: 'acciones', header: '' },
      ]"
      :loading="list.pending.value"
      :class="list.loaded.value && list.pending.value ? 'opacity-60 transition-opacity' : ''"
      empty="No hay puestos."
    >
      <template #code-cell="{ row }">
        <span class="font-mono text-xs">{{ row.original.code }}</span>
        <UBadge v-if="!row.original.isActive" label="Inactivo" color="neutral" class="ml-2" />
      </template>

      <template #empresa-cell="{ row }">
        <span class="text-muted text-sm">{{ entityName(row.original.legalEntityId) }}</span>
      </template>

      <template #descripcion-cell="{ row }">
        <span v-if="row.original.description" class="text-muted text-sm">
          {{ row.original.description }}
        </span>
        <span v-else class="text-dimmed text-sm">—</span>
      </template>

      <!--
        Cuenta solo adscripciones VIGENTES. Uno del que todos se fueron muestra
        cero aunque conserve historia, que es lo que hay que saber para decidir
        si se puede retirar.
      -->
      <template #gente-cell="{ row }">
        <span :class="row.original.employeeCount ? '' : 'text-dimmed'">
          {{ row.original.employeeCount ?? 0 }}
        </span>
      </template>

      <template #acciones-cell="{ row }">
        <div v-if="canWrite" class="flex justify-end gap-1">
          <UButton
            icon="i-lucide-pencil"
            square
            size="xs"
            aria-label="Editar"
            @click="abrirEdicion(row.original)"
          />
          <UButton
            :icon="row.original.isActive ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            square
            size="xs"
            :aria-label="row.original.isActive ? 'Desactivar' : 'Reactivar'"
            @click="toggling = row.original"
          />
          <UButton
            v-if="canDelete"
            icon="i-lucide-trash-2"
            square
            size="xs"
            aria-label="Borrar"
            @click="deleting = row.original"
          />
        </div>
      </template>
    </UTable>

    <UModal
      v-model:open="formOpen"
      :title="editing ? 'Editar puesto' : 'Nuevo puesto'"
      description="El código es único dentro de su razón social y es lo que sale en los reportes."
    >
      <template #body>
        <form class="space-y-3" @submit.prevent="submit">
          <UFormField v-if="!editing" label="Razón social" required>
            <USelectMenu
              v-model="entityId"
              :items="
                (entities.data.value ?? []).map((e) => ({ label: e.businessName, value: e.id }))
              "
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <div>
            <!-- El código de un puesto SÍ se puede corregir: el PATCH lo admite. -->
            <!-- El código lo pone el servidor al crear. Ver `shared/code/entity-code`. -->
            <UFormField label="Nombre" required>
              <UInput v-model="form.name" placeholder="Supervisor de línea" class="w-full" />
            </UFormField>
          </div>

          <UFormField
            label="Descripción"
            help="Para distinguir dos puestos que se llaman parecido. Opcional."
          >
            <UTextarea
              v-model="form.description"
              :rows="2"
              placeholder="Responsable del turno en la línea 2. No confundir con Supervisor de patio."
              class="w-full"
            />
          </UFormField>

          <ApiErrorAlert :error="formError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancelar" @click="formOpen = false" />
            <UButton
              type="submit"
              icon="i-lucide-check"
              :label="editing ? 'Guardar cambios' : 'Crear'"
              :disabled="!valid"
              :loading="submitting"
            />
          </div>
        </form>
      </template>
    </UModal>

    <ConfirmDialog
      v-if="toggling"
      :open="true"
      :title="toggling.isActive ? 'Desactivar puesto' : 'Reactivar puesto'"
      :message="`${toggling.code} · ${toggling.name}`"
      :warning="
        toggling.isActive
          ? 'Deja de ofrecerse en adscripciones nuevas. Quien ya lo tiene sigue en él y los reportes pasados no cambian.'
          : undefined
      "
      :confirm-label="toggling.isActive ? 'Desactivar' : 'Reactivar'"
      :confirm-color="toggling.isActive ? 'warning' : 'primary'"
      :action="
        async () => {
          const seDesactiva = toggling!.isActive
          const nombre = toggling!.name
          await orgApi.setPositionActive(toggling!.id, !seDesactiva)
          aviso.actualizado(
            nombre,
            seDesactiva ? 'Ya no se ofrece en adscripciones.' : 'Vuelve a ofrecerse.',
          )
        }
      "
      @update:open="
        (value: boolean) => {
          if (!value) toggling = null
        }
      "
      @confirmed="list.run()"
    />

    <CatalogDuplicateModal
      v-if="duplicating"
      :open="true"
      resource-kind="puesto"
      :source-name="`${duplicating.code} · ${duplicating.name}`"
      :source-entity-id="duplicating.legalEntityId"
      :entities="entities.data.value ?? []"
      :duplicate="
        (id: string) =>
          orgApi.createPosition(id, {
            name: duplicating!.name,
            description: duplicating!.description ?? '',
          })
      "
      @update:open="
        (value: boolean) => {
          if (!value) duplicating = null
        }
      "
      @done="list.run()"
    />

    <DeleteResourceDialog
      v-if="deleting"
      :open="true"
      title="Borrar puesto"
      resource-kind="puesto"
      :resource-name="`${deleting.code} · ${deleting.name}`"
      :load-dependencies="() => orgApi.positionDependencies(deleting!.id)"
      :remove="
        async () => {
          const nombre = deleting!.name
          await orgApi.removePosition(deleting!.id)
          aviso.borrado('Puesto', nombre)
        }
      "
      @update:open="
        (value: boolean) => {
          if (!value) deleting = null
        }
      "
      @deleted="list.run()"
    />
  </div>
</template>
