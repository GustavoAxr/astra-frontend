<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAsync } from '@/shared/composables/useAsync'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import DeleteResourceDialog from '@/shared/ui/DeleteResourceDialog.vue'
import ConfirmDialog from '@/shared/ui/ConfirmDialog.vue'
import { timezoneOffset } from '@/shared/ui/timezones'
import { useAuthStore } from '@/modules/auth/store'
import { orgApi } from '../api'
import { useLegalEntityFilter } from '../store'
import LegalEntityFormModal from '../components/LegalEntityFormModal.vue'
import InstallationFormModal from '../components/InstallationFormModal.vue'
import { useAviso } from '@/shared/ui/aviso'
import type { Installation, LegalEntity } from '../types'

const auth = useAuthStore()
const { selectedId } = storeToRefs(useLegalEntityFilter())

/** Sin este interruptor, desactivar sería un viaje sin regreso desde la interfaz. */
const showInactive = ref(false)

const entities = useAsync((signal) => orgApi.legalEntities(showInactive.value, signal))
const installations = useAsync((signal) =>
  orgApi.installations({ incluirInactivas: showInactive.value }, signal),
)

const canCreate = computed(() => auth.can('createLegalEntity'))
const canEdit = computed(() => auth.can('editLegalEntity'))
const canDelete = computed(() => auth.can('deleteLegalEntity'))
const aviso = useAviso()

const canCreateBase = computed(() => auth.can('createInstallation'))
const canEditBase = computed(() => auth.can('editInstallation'))
const canDeleteBase = computed(() => auth.can('deleteInstallation'))

const formOpen = ref(false)
const editing = ref<LegalEntity | null>(null)
const deleting = ref<LegalEntity | null>(null)

/** Alta y edición de bases: se guarda a qué empresa cuelgan. */
const baseForm = ref<{
  legalEntity: LegalEntity
  installation: Installation | null
  clone?: boolean
} | null>(null)
const deletingBase = ref<{ legalEntity: LegalEntity; installation: Installation } | null>(null)

/**
 * Activar y desactivar cambian datos de un solo clic, así que pasan por
 * confirmación como todo lo demás. Un mismo estado para los dos recursos:
 * es la misma acción sobre cosas distintas.
 */
const pendingToggle = ref<{
  kind: 'razón social' | 'base'
  name: string
  isActive: boolean
  apply: () => Promise<void>
} | null>(null)

function askToggleEntity(entity: LegalEntity): void {
  pendingToggle.value = {
    kind: 'razón social',
    name: entity.businessName,
    isActive: entity.isActive,
    apply: async () => {
      await orgApi.updateLegalEntity(entity.id, { isActive: !entity.isActive })
    },
  }
}

function askToggleBase(installation: Installation): void {
  pendingToggle.value = {
    kind: 'base',
    name: `${installation.code} · ${installation.name}`,
    isActive: installation.isActive,
    apply: async () => {
      await orgApi.updateInstallation(installation.id, { isActive: !installation.isActive })
      aviso.actualizado(
        installation.name,
        installation.isActive ? 'Queda inactiva.' : 'Vuelve a estar activa.',
      )
    },
  }
}
const actionError = ref<Error | null>(null)

const tree = computed(() =>
  (entities.data.value ?? [])
    .filter((entity) => selectedId.value === null || entity.id === selectedId.value)
    .map((entity) => ({
      entity,
      installations: (installations.data.value ?? []).filter(
        (installation: Installation) => installation.legalEntityId === entity.id,
      ),
    })),
)

const pending = computed(() => entities.pending.value || installations.pending.value)

/**
 * Primera carga: no hay nada que enseñar todavía.
 *
 * Se distingue de una recarga —cambiar el interruptor de inactivas, guardar un
 * formulario— porque en esa los datos de antes siguen en pantalla y siguen
 * siendo casi los mismos. Taparlos con «Cargando…» desmonta la lista entera y
 * la vuelve a montar: es el parpadeo.
 */
const firstLoad = computed(
  () => pending.value && (!entities.loaded.value || !installations.loaded.value),
)

/** Recargando con datos ya en pantalla: se atenúa, no se sustituye. */
const refreshing = computed(() => pending.value && !firstLoad.value)

function create(): void {
  editing.value = null
  formOpen.value = true
}

function edit(entity: LegalEntity): void {
  editing.value = entity
  formOpen.value = true
}

async function refresh(): Promise<void> {
  await Promise.all([entities.run(), installations.run()])
}

// El interruptor manda sobre las dos listas.
watch(showInactive, () => void refresh())
void refresh()
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      title="Organización"
      description="Las razones sociales del grupo y las bases que operan dentro de cada una."
      :count="firstLoad ? undefined : `${tree.length}`"
    >
      <template #actions>
        <USwitch v-model="showInactive" label="Ver inactivas" />
        <UButton v-if="canCreate" icon="i-lucide-plus" label="Nueva razón social" @click="create" />
      </template>
    </PageHeader>

    <ApiErrorAlert :error="entities.error.value ?? installations.error.value ?? actionError" />

    <div v-if="firstLoad" class="text-muted text-sm">Cargando…</div>

    <EmptyState
      v-else-if="tree.length === 0"
      icon="i-lucide-building-2"
      title="No hay razones sociales"
      description="Da de alta la primera empresa del grupo para empezar a registrar bases y relojes."
    >
      <UButton v-if="canCreate" icon="i-lucide-plus" label="Nueva razón social" @click="create" />
    </EmptyState>

    <!--
      La lista se queda montada mientras llega lo nuevo: solo se atenúa. Se
      envuelve en su propio contenedor porque `v-else` sobre un `v-for` depende
      de la precedencia entre directivas, y eso es frágil de leer.
    -->
    <div
      v-else
      class="space-y-4 transition-opacity"
      :class="refreshing ? 'opacity-60' : ''"
      :aria-busy="refreshing"
    >
      <article
        v-for="node in tree"
        :key="node.entity.id"
        class="border-default bg-elevated/20 overflow-hidden rounded-xl border"
        :class="node.entity.isActive ? '' : 'opacity-70'"
      >
        <header class="border-default flex flex-wrap items-center gap-3 border-b px-5 py-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="text-highlighted truncate font-medium">{{ node.entity.businessName }}</h2>
              <UBadge v-if="!node.entity.isActive" label="Inactiva" color="neutral" size="sm" />
            </div>
            <p class="text-dimmed mt-0.5 flex flex-wrap items-center gap-x-3 text-xs">
              <span class="font-mono">{{ node.entity.taxId }}</span>
              <span>{{ node.entity.countryCode }}</span>
              <span>{{ node.entity.timezone }} · {{ timezoneOffset(node.entity.timezone) }}</span>
            </p>
          </div>

          <div class="ml-auto flex items-center gap-1">
            <UButton
              v-if="canEdit"
              icon="i-lucide-pencil"
              label="Editar"
              size="sm"
              @click="edit(node.entity)"
            />
            <UButton
              v-if="canEdit"
              :icon="node.entity.isActive ? 'i-lucide-power-off' : 'i-lucide-power'"
              :label="node.entity.isActive ? 'Desactivar' : 'Reactivar'"
              size="sm"
              @click="askToggleEntity(node.entity)"
            />
            <UButton
              v-if="canDelete"
              icon="i-lucide-trash-2"
              label="Borrar"
              color="error"
              size="sm"
              @click="deleting = node.entity"
            />
          </div>
        </header>

        <div class="px-5 py-4">
          <div class="mb-3 flex items-center gap-2">
            <p class="text-muted text-xs font-medium tracking-wide uppercase">
              Bases · {{ node.installations.length }}
            </p>
            <UButton
              v-if="canCreateBase"
              icon="i-lucide-plus"
              label="Nueva base"
              size="xs"
              class="ml-auto"
              @click="baseForm = { legalEntity: node.entity, installation: null }"
            />
          </div>

          <p v-if="node.installations.length === 0" class="text-dimmed text-sm">
            Sin bases dadas de alta.
          </p>

          <div v-else class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <div
              v-for="installation in node.installations"
              :key="installation.id"
              class="border-default bg-default flex flex-col rounded-lg border p-3"
              :class="installation.isActive ? '' : 'opacity-70'"
            >
              <div class="flex items-center gap-2">
                <span class="text-dimmed font-mono text-xs">{{ installation.code }}</span>
                <span class="text-highlighted truncate text-sm font-medium">
                  {{ installation.name }}
                </span>
                <UBadge
                  v-if="!installation.isActive"
                  label="Inactiva"
                  color="neutral"
                  size="sm"
                  class="ml-auto"
                />
              </div>
              <p class="text-muted mt-1 truncate text-xs">
                {{ installation.address ?? 'Sin domicilio' }}
              </p>
              <p class="text-dimmed mt-1 text-xs">
                {{ installation.timezone }}
                <!--
                  Se distingue el área dibujada del círculo porque son cosas
                  distintas: «geocerca 105 m» en una nave alargada abarca la
                  calle de atrás, y desde la tarjeta no habría forma de saber
                  cuáles bases siguen así.
                -->
                <template v-if="installation.geofence?.polygon?.length">
                  · área de {{ installation.geofence.polygon.length }} esquinas
                </template>
                <template v-else-if="installation.geofence">
                  · círculo de {{ installation.geofence.radiusMeters }} m
                </template>
                <template v-else>· sin geocerca</template>
              </p>

              <div class="border-default mt-3 flex items-center gap-1 border-t pt-2">
                <UButton
                  v-if="canEditBase"
                  icon="i-lucide-pencil"
                  size="xs"
                  aria-label="Editar base"
                  @click="baseForm = { legalEntity: node.entity, installation }"
                />
                <UButton
                  v-if="canEditBase"
                  :icon="installation.isActive ? 'i-lucide-power-off' : 'i-lucide-power'"
                  :label="installation.isActive ? 'Desactivar' : 'Reactivar'"
                  size="xs"
                  @click="askToggleBase(installation)"
                />
                <!--
                Duplicar es un alta normal con el formulario ya relleno: se
                copia la base y solo se pregunta a qué razón social va.
              -->
                <UButton
                  v-if="canCreateBase"
                  icon="i-lucide-copy"
                  size="xs"
                  aria-label="Duplicar en otra razón social"
                  title="Duplicar en otra razón social"
                  @click="baseForm = { legalEntity: node.entity, installation, clone: true }"
                />
                <UButton
                  v-if="canDeleteBase"
                  icon="i-lucide-trash-2"
                  color="error"
                  size="xs"
                  class="ml-auto"
                  aria-label="Borrar base"
                  @click="deletingBase = { legalEntity: node.entity, installation }"
                />
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>

    <ConfirmDialog
      v-if="pendingToggle"
      :open="true"
      :title="
        pendingToggle.isActive
          ? `Desactivar ${pendingToggle.kind}`
          : `Reactivar ${pendingToggle.kind}`
      "
      :message="
        pendingToggle.isActive
          ? `${pendingToggle.name} dejará de ofrecerse para operaciones nuevas. Su historia se conserva y podrás volver a verla con «Ver inactivas».`
          : `${pendingToggle.name} volverá a estar disponible para operaciones nuevas.`
      "
      :confirm-label="pendingToggle.isActive ? 'Desactivar' : 'Reactivar'"
      :confirm-icon="pendingToggle.isActive ? 'i-lucide-power-off' : 'i-lucide-power'"
      :action="pendingToggle.apply"
      @update:open="
        (value: boolean) => {
          if (!value) pendingToggle = null
        }
      "
      @confirmed="
        () => {
          pendingToggle = null
          void refresh()
        }
      "
    />

    <LegalEntityFormModal v-model:open="formOpen" :entity="editing" @saved="refresh" />

    <DeleteResourceDialog
      v-if="deleting"
      :open="true"
      title="Borrar razón social"
      resource-kind="razón social"
      :resource-name="deleting.businessName"
      :load-dependencies="() => orgApi.legalEntityDependencies(deleting!.id)"
      :remove="
        async () => {
          const nombre = deleting!.businessName
          await orgApi.deleteLegalEntity(deleting!.id)
          aviso.borrado('Razón social', nombre)
        }
      "
      @update:open="
        (value: boolean) => {
          if (!value) deleting = null
        }
      "
      @deleted="
        () => {
          deleting = null
          void refresh()
        }
      "
    />

    <InstallationFormModal
      v-if="baseForm"
      :open="true"
      :legal-entity="baseForm.legalEntity"
      :installation="baseForm.installation"
      :clone="baseForm.clone"
      :legal-entities="entities.data.value ?? []"
      :existing="installations.data.value ?? []"
      @update:open="
        (value: boolean) => {
          if (!value) baseForm = null
        }
      "
      @saved="
        () => {
          baseForm = null
          void refresh()
        }
      "
    />

    <DeleteResourceDialog
      v-if="deletingBase"
      :open="true"
      title="Borrar base"
      resource-kind="base"
      :resource-name="`${deletingBase.installation.code} · ${deletingBase.installation.name}`"
      :load-dependencies="() => orgApi.installationDependencies(deletingBase!.installation.id)"
      :remove="
        async () => {
          await orgApi.deleteInstallation(deletingBase!.installation.id)
          aviso.borrado(deletingBase!.installation.name)
        }
      "
      @update:open="
        (value: boolean) => {
          if (!value) deletingBase = null
        }
      "
      @deleted="
        () => {
          deletingBase = null
          void refresh()
        }
      "
    />
  </div>
</template>
