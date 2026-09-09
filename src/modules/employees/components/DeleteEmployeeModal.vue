<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import { enPlano } from '@/shared/text'
import { employeesApi } from '../api'
import type { EmployeeDependencies } from '../types'

/**
 * BORRAR A UNA PERSONA, DE VERDAD.
 *
 * En dos tiempos, como el resto de los borrados del sistema: primero se
 * pregunta qué cuelga de ella y solo después se ofrece destruirlo.
 *
 * POR QUÉ HAY QUE ESCRIBIR EL NOMBRE
 * Un botón de confirmar se pulsa sin leer. Un nombre hay que copiarlo mirándolo,
 * y en ese rato uno se entera de a quién está a punto de borrar. Es el mismo
 * gesto que pide GitHub para borrar un repositorio, y por la misma razón: no
 * hay vuelta atrás. El servidor comprueba el nombre otra vez —esta pantalla se
 * puede saltar—.
 *
 * Y LO IMPORTANTE: casi nadie necesita esto. Quien tiene una sola checada NO se
 * puede borrar, y está bien que así sea: esa es la evidencia con la que se
 * defiende su nómina. Para eso está la baja, que además se deshace.
 */
const props = defineProps<{ employeeId: string; fullName: string; employeeCode: string }>()
const emit = defineEmits<{ deleted: [] }>()
const aviso = useAviso()

const open = defineModel<boolean>('open', { default: false })

const dependencias = ref<EmployeeDependencies | null>(null)
const cargando = ref(false)
const borrando = ref(false)
const error = ref<Error | null>(null)
const escrito = ref('')

/** Sin acentos ni mayúsculas, igual que en el servidor: nadie acierta la tilde. */
const nombreCoincide = computed(() => enPlano(escrito.value) === enPlano(props.fullName))
const bloqueado = computed(() => (dependencias.value?.bloqueos.length ?? 0) > 0)

const resumen = (items: { que: string; cuantos: number }[]): string =>
  items.map((i) => `${i.cuantos} ${i.que}`).join(', ')

/*
 * `immediate`: el diálogo se monta con `v-if` cuando `open` YA vale true, así
 * que un watcher normal vigilaría un cambio ocurrido antes de que el componente
 * existiera, y las dependencias no se pedirían nunca.
 */
watch(
  open,
  async (abierto) => {
    if (!abierto) {
      dependencias.value = null
      error.value = null
      escrito.value = ''
      return
    }

    cargando.value = true
    error.value = null
    try {
      dependencias.value = await employeesApi.dependencies(props.employeeId)
    } catch (cause) {
      error.value = cause instanceof Error ? cause : new Error(String(cause))
    } finally {
      cargando.value = false
    }
  },
  { immediate: true },
)

async function borrar(): Promise<void> {
  if (!nombreCoincide.value || bloqueado.value || borrando.value) return
  borrando.value = true
  error.value = null

  try {
    await employeesApi.purge(props.employeeId, escrito.value.trim())
    aviso.borrado(props.fullName, 'No queda nada de su expediente.')
    open.value = false
    emit('deleted')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    borrando.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Borrar definitivamente" :description="fullName">
    <template #body>
      <div class="space-y-4">
        <p v-if="cargando" class="text-muted text-sm">Viendo qué cuelga de esta persona…</p>

        <template v-else-if="dependencias">
          <!--
            El bloqueo se explica y se ofrece la salida buena. Un «no se puede»
            a secas deja a quien lo lee sin saber qué hacer con esa persona.
          -->
          <UAlert
            v-if="bloqueado"
            icon="i-lucide-shield-alert"
            color="warning"
            title="Esta persona no se puede borrar"
            :description="`Tiene ${resumen(dependencias.bloqueos)}. Esa es la evidencia con la que se defiende su nómina, y la base no permite borrarla. Dale de baja: deja de aparecer en la plantilla y de entrar por el reloj, y su historia se conserva intacta.`"
          />

          <template v-else>
            <UAlert
              icon="i-lucide-triangle-alert"
              color="error"
              title="Esto no se puede deshacer"
              :description="
                dependencias.total > 0
                  ? `Se borrará el expediente de ${fullName} y ${resumen(dependencias.arrastra)}.`
                  : `Se borrará el expediente de ${fullName}. No tiene nada más asociado.`
              "
            />

            <!--
              El reloj es otro aparato y no se entera de esto: si la persona
              estaba enrolada, sigue pudiendo abrir la puerta. Decirlo aquí evita
              que alguien borre creyendo que también le quitó el acceso.
            -->
            <p
              v-if="dependencias.arrastra.some((a) => a.que.includes('reloj'))"
              class="text-warning text-sm"
            >
              Ojo: borrarla de Astra <strong>no la quita del reloj</strong>. Seguirá abriendo la
              puerta hasta que la quites del padrón del equipo, y sus checadas caerán en la bandeja
              de sin dueño. Si lo que quieres es cerrarle el acceso, dale de baja y empuja el
              padrón.
            </p>

            <UFormField
              label="Escribe el nombre completo para confirmar"
              :help="`Tal cual: ${fullName}`"
            >
              <UInput v-model="escrito" :placeholder="fullName" autocomplete="off" class="w-full" />
            </UFormField>
          </template>
        </template>

        <ApiErrorAlert :error="error" :fields="['confirmName']" />

        <div class="flex justify-end gap-2">
          <UButton label="Cancelar" @click="open = false" />
          <UButton
            label="Borrar definitivamente"
            icon="i-lucide-trash-2"
            color="error"
            :loading="borrando"
            :disabled="bloqueado || !nombreCoincide"
            @click="borrar"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
