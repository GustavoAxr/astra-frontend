<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/modules/auth/store'
import { primeraPantalla } from '@/app/navigation'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { ApiError } from '@/shared/api/errors'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { bootstrapError } = storeToRefs(auth)

const FIELDS = ['email', 'password'] as const

const email = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref<Error | null>(null)

/** Lo que impidió saber si había sesión al arrancar, si es que pasó algo. */
const shownError = computed(() => error.value ?? bootstrapError.value)

const fieldErrors = computed(() =>
  error.value instanceof ApiError ? error.value.splitDetails(FIELDS).byField : {},
)

async function submit(): Promise<void> {
  if (submitting.value) return

  submitting.value = true
  error.value = null

  try {
    await auth.login({ email: email.value, password: password.value })

    const redirect = route.query.redirect
    /*
     * A dónde entra depende de sus roles: «Organización» era un destino fijo
     * que un gerente no puede abrir, y lo habría rebotado el guard nada más
     * entrar. `primeraPantalla` sale de la misma tabla que el menú.
     */
    await router.push(
      typeof redirect === 'string' ? redirect : { name: primeraPantalla(auth.roles) },
    )
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UCard>
    <form class="space-y-4" @submit.prevent="submit">
      <UFormField label="Correo" :error="fieldErrors.email?.[0]">
        <UInput
          v-model="email"
          type="email"
          autocomplete="username"
          placeholder="tu@empresa.mx"
          icon="i-lucide-mail"
          autofocus
          class="w-full"
        />
      </UFormField>

      <UFormField label="Contraseña" :error="fieldErrors.password?.[0]">
        <UInput
          v-model="password"
          type="password"
          autocomplete="current-password"
          icon="i-lucide-lock"
          class="w-full"
        />
      </UFormField>

      <ApiErrorAlert :error="shownError" :fields="FIELDS" />

      <UButton
        type="submit"
        label="Entrar"
        block
        :loading="submitting"
        :disabled="email === '' || password === ''"
      />
    </form>
  </UCard>
</template>
