<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import { timezoneItems } from '@/shared/ui/timezones'
import { soporteApi } from '../api'

/**
 * ALTA DE UN CLIENTE ENTERO: el inquilino, su primera razón social y su
 * administrador, en un solo formulario.
 *
 * ══ ESTA PANTALLA NO PROTEGE NADA, Y HAY QUE TENERLO CLARO ══
 *
 * Que solo se pinte para un operador de plataforma es COMODIDAD, no seguridad.
 * Quien llame a `POST /support/tenants` por su cuenta se topa con lo mismo que
 * se topa aquí, porque quien decide es el servidor: sesión válida, estar en la
 * lista de operadores, y cinco altas por hora. Si esta comprobación de aquí
 * fallara, el peor síntoma posible es un formulario que devuelve 404.
 *
 * LA CONTRASEÑA SE ENSEÑA UNA VEZ Y NO SE GUARDA EN NINGÚN SITIO DEL NAVEGADOR.
 * Ni en `localStorage`, ni en la URL, ni en un `ref` que sobreviva al cierre.
 * Es la misma regla del secreto de un agente: una credencial recuperable acaba
 * en un correo o en una captura de pantalla.
 */
const emit = defineEmits<{ creado: [] }>()
const aviso = useAviso()

const open = defineModel<boolean>('open', { default: false })

const nombre = ref('')
const slug = ref('')
const businessName = ref('')
const taxId = ref('')
const timezone = ref('America/Mexico_City')
const adminEmail = ref('')
const adminFullName = ref('')

const enviando = ref(false)
const error = ref<Error | null>(null)
const clave = ref<string | null>(null)
const copiado = ref(false)

/**
 * El identificador se propone a partir del nombre, pero se puede corregir.
 *
 * Nadie quiere teclear dos veces lo mismo, y a la vez el identificador acaba en
 * bitácoras y enlaces: proponerlo evita el trabajo, dejarlo editable evita que
 * un nombre raro genere un identificador peor.
 */
watch(nombre, (v) => {
  if (clave.value !== null) return
  slug.value = v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
})

watch(open, (abierto) => {
  if (abierto) return
  nombre.value = ''
  slug.value = ''
  businessName.value = ''
  taxId.value = ''
  timezone.value = 'America/Mexico_City'
  adminEmail.value = ''
  adminFullName.value = ''
  error.value = null
  clave.value = null
  copiado.value = false
})

const valid = computed(
  () =>
    nombre.value.trim() !== '' &&
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug.value) &&
    businessName.value.trim() !== '' &&
    /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(taxId.value.trim().toUpperCase()) &&
    adminEmail.value.includes('@') &&
    adminFullName.value.trim() !== '',
)

async function submit(): Promise<void> {
  if (!valid.value || enviando.value) return
  enviando.value = true
  error.value = null

  try {
    const r = await soporteApi.crearCliente({
      nombre: nombre.value.trim(),
      slug: slug.value.trim(),
      businessName: businessName.value.trim(),
      taxId: taxId.value.trim().toUpperCase(),
      timezone: timezone.value,
      adminEmail: adminEmail.value.trim(),
      adminFullName: adminFullName.value.trim(),
    })
    clave.value = r.claveProvisional
    aviso.creado('Cliente', nombre.value.trim())
    emit('creado')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    enviando.value = false
  }
}

async function copiar(): Promise<void> {
  if (clave.value === null) return
  try {
    await navigator.clipboard.writeText(clave.value)
    copiado.value = true
  } catch (cause) {
    // Sin HTTPS el portapapeles no existe, y fallaba en silencio.
    aviso.fallo(cause, 'copiar la contraseña')
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Dar de alta un cliente">
    <template #body>
      <!-- Ya está creado: lo único que queda es llevarse la contraseña. -->
      <div v-if="clave" class="space-y-4">
        <div class="border-success/40 bg-success/10 space-y-1 rounded-xl border p-4">
          <p class="text-highlighted font-medium">{{ nombre }} quedó dado de alta</p>
          <p class="text-muted text-sm">
            Con su razón social y su administrador. Entra al cliente desde el selector
            para seguir configurándolo.
          </p>
        </div>

        <UFormField
          label="Contraseña provisional"
          help="Se muestra UNA vez. No se guarda en claro y no se puede volver a consultar."
        >
          <div class="flex gap-2">
            <UInput :model-value="clave" readonly class="w-full font-mono" />
            <UButton
              :icon="copiado ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copiado ? 'Copiada' : 'Copiar'"
              @click="copiar"
            />
          </div>
        </UFormField>

        <div class="flex justify-end pt-2">
          <UButton label="Listo" icon="i-lucide-check" @click="open = false" />
        </div>
      </div>

      <form v-else class="space-y-4" @submit.prevent="submit">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Nombre del cliente" required>
            <UInput v-model="nombre" placeholder="Diavaz" class="w-full" />
          </UFormField>
          <UFormField
            label="Identificador"
            required
            help="Minúsculas, números y guiones. Se usa en bitácoras y enlaces."
          >
            <UInput v-model="slug" placeholder="diavaz" class="w-full font-mono" />
          </UFormField>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Su primera razón social" required>
            <UInput
              v-model="businessName"
              placeholder="Diavaz Servicios S.A. de C.V."
              class="w-full"
            />
          </UFormField>
          <UFormField label="RFC" required>
            <UInput v-model="taxId" placeholder="DIA010101AA1" class="w-full font-mono" />
          </UFormField>
        </div>

        <UFormField label="Zona horaria" required>
          <USelectMenu
            v-model="timezone"
            :items="timezoneItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Administrador · nombre" required>
            <UInput v-model="adminFullName" placeholder="Ana Ruiz" class="w-full" />
          </UFormField>
          <UFormField label="Administrador · correo" required>
            <UInput v-model="adminEmail" type="email" placeholder="admin@diavaz.mx" class="w-full" />
          </UFormField>
        </div>

        <ApiErrorAlert :error="error" />

        <div class="flex justify-end gap-2 pt-2">
          <UButton label="Cancelar" :disabled="enviando" @click="open = false" />
          <UButton
            type="submit"
            label="Dar de alta"
            icon="i-lucide-building-2"
            :disabled="!valid"
            :loading="enviando"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
