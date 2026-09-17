<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/modules/auth/store'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { ApiError } from '@/shared/api/errors'

/**
 * CAMBIAR LA PROPIA CONTRASEÑA.
 *
 * Tres cosas que este formulario hace y conviene que queden escritas:
 *
 * 1 · AVISA ANTES, NO DESPUÉS. Cambiar la contraseña cierra TODAS las sesiones
 *   —el servidor revoca la familia entera, también la que pide el cambio— y eso
 *   se dice con el formulario abierto. Enterarse al caer en la pantalla de
 *   entrar se lee como un fallo, no como lo que es.
 *
 * 2 · LO QUE SE PUEDE COMPROBAR AQUÍ, SE COMPRUEBA AQUÍ. El largo mínimo y que
 *   la repetición cuadre no necesitan viajar: mandarlos al servidor para que
 *   conteste lo mismo es un viaje de ida y vuelta para decir algo que ya se
 *   sabía. Lo que NO se comprueba aquí es si la actual es correcta: eso solo lo
 *   sabe el servidor, y fingir que se sabe sería mentir.
 *
 * 3 · LA NUEVA SE PUEDE DESTAPAR; LA REPETICIÓN NO. Diez caracteres a ciegas se
 *   teclean mal, y el error aparece dos pantallas después. Destapar las dos
 *   dejaría la repetición sin función: se copiaría con los ojos.
 */
const auth = useAuthStore()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ changed: [sesionesCerradas: number] }>()

/** Los nombres del DTO del servidor, para repartir sus `details`. */
const FIELDS = ['actual', 'nueva'] as const

/** El mínimo lo pone el servidor; repetirlo aquí es solo para avisar antes. */
const LARGO_MINIMO = 10

const actual = ref('')
const nueva = ref('')
const repetida = ref('')
const nuevaVisible = ref(false)
const working = ref(false)
const error = ref<Error | null>(null)

/*
 * No se enseña un error mientras la persona TODAVÍA está tecleando ese campo.
 * «Debe tener al menos 10 caracteres» apareciendo en la primera letra es una
 * regañina, no una ayuda; en cuanto sale del campo, sí es una ayuda.
 */
const tocado = ref<Record<string, boolean>>({})
const marcar = (campo: string): void => {
  tocado.value[campo] = true
}

const cortaDeMas = computed(() => nueva.value.length > 0 && nueva.value.length < LARGO_MINIMO)
const repetidaNoCuadra = computed(() => repetida.value.length > 0 && repetida.value !== nueva.value)
/*
 * Repetir la misma también lo rechaza el servidor —dejaría `mustChangePassword`
 * apagado sin que nada hubiera cambiado—, pero decirlo aquí ahorra el viaje.
 */
const esLaMisma = computed(() => nueva.value.length > 0 && nueva.value === actual.value)

const errorNueva = computed(() => {
  if (!tocado.value.nueva) return undefined
  if (cortaDeMas.value) return `Al menos ${LARGO_MINIMO} caracteres.`
  if (esLaMisma.value) return 'Tiene que ser distinta de la actual.'
  return undefined
})

const errorRepetida = computed(() =>
  tocado.value.repetida && repetidaNoCuadra.value ? 'No coincide con la nueva.' : undefined,
)

const listo = computed(
  () =>
    actual.value.length > 0 &&
    nueva.value.length >= LARGO_MINIMO &&
    !esLaMisma.value &&
    repetida.value === nueva.value,
)

/** Los `details` del servidor que sí corresponden a un campo del formulario. */
const erroresDelServidor = computed<Record<string, string[]>>(() =>
  error.value instanceof ApiError ? error.value.splitDetails(FIELDS).byField : {},
)

// Abrir en limpio. Un diálogo que conserva lo tecleado de la vez anterior deja
// una contraseña escrita en memoria sin que nadie la esté mirando.
watch(open, (abierto) => {
  if (abierto) return
  actual.value = ''
  nueva.value = ''
  repetida.value = ''
  nuevaVisible.value = false
  tocado.value = {}
  error.value = null
})

async function submit(): Promise<void> {
  if (working.value || !listo.value) return
  working.value = true
  error.value = null

  try {
    const sesionesCerradas = await auth.changePassword({
      actual: actual.value,
      nueva: nueva.value,
    })
    open.value = false
    emit('changed', sesionesCerradas)
  } catch (cause) {
    // El diálogo se queda abierto con el error: cerrarlo escondería el motivo,
    // y el más común —«la contraseña actual no es correcta»— se arregla aquí.
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    working.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Cambiar contraseña" :dismissible="!working" :close="!working">
    <template #body>
      <form class="space-y-4" @submit.prevent="submit">
        <UAlert
          icon="i-lucide-info"
          description="Al cambiarla se cierran todas tus sesiones, también esta. Tendrás que volver a entrar."
        />

        <UFormField label="Contraseña actual" :error="erroresDelServidor.actual?.[0]">
          <UInput
            v-model="actual"
            type="password"
            autocomplete="current-password"
            icon="i-lucide-lock"
            autofocus
            class="w-full"
            @blur="marcar('actual')"
          />
        </UFormField>

        <UFormField
          label="Contraseña nueva"
          :error="errorNueva ?? erroresDelServidor.nueva?.[0]"
          :help="
            errorNueva
              ? undefined
              : `Al menos ${LARGO_MINIMO} caracteres. No hacen falta símbolos ni mayúsculas: lo que cuesta adivinar es el largo.`
          "
        >
          <UInput
            v-model="nueva"
            :type="nuevaVisible ? 'text' : 'password'"
            autocomplete="new-password"
            icon="i-lucide-key-round"
            class="w-full"
            @blur="marcar('nueva')"
          >
            <template #trailing>
              <UButton
                :icon="nuevaVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                square
                size="xs"
                :aria-label="nuevaVisible ? 'Ocultar la contraseña' : 'Ver la contraseña'"
                :aria-pressed="nuevaVisible"
                @click="nuevaVisible = !nuevaVisible"
              />
            </template>
          </UInput>
        </UFormField>

        <UFormField label="Repite la contraseña nueva" :error="errorRepetida">
          <UInput
            v-model="repetida"
            type="password"
            autocomplete="new-password"
            icon="i-lucide-key-round"
            class="w-full"
            @blur="marcar('repetida')"
          />
        </UFormField>

        <ApiErrorAlert :error="error" :fields="FIELDS" />

        <div class="flex justify-end gap-2 pt-2">
          <UButton label="Cancelar" :disabled="working" @click="open = false" />
          <UButton
            type="submit"
            label="Cambiar contraseña"
            icon="i-lucide-key-round"
            :loading="working"
            :disabled="!listo"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
