<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '@/shared/api/errors'
import { nombreCompleto } from '@/shared/text'
import { employeesApi } from '@/modules/employees/api'
import type { Employee } from '@/modules/employees/types'
import { orgApi } from '@/modules/org/api'
import type { Installation, LegalEntity } from '@/modules/org/types'
import { useAviso } from '@/shared/ui/aviso'
import { usersApi } from '../api'
import { ALCANCE, type RolDisponible, type TipoDeAlcance } from '../types'

/**
 * CONVERTIR A ALGUIEN DE LA PLANTILLA EN USUARIO DE ASTRA.
 *
 * Se empieza por la PERSONA y no por el correo, y ese orden es la mitad del
 * diseño: quien hace esto está pensando «que Karina lleve RRHH de Biocarbon»,
 * no «dar de alta karina@…». Eligiendo primero a la persona, el nombre y el
 * correo se rellenan solos desde su expediente y no hay dos verdades sobre cómo
 * se llama.
 *
 * También deja crear una cuenta suelta, sin expediente: soporte del proveedor,
 * un contador externo. Es la excepción, y por eso está debajo y no delante.
 */
const emit = defineEmits<{ close: []; created: [] }>()
const aviso = useAviso()

const abierto = ref(true)
const paso = ref<'quien' | 'que' | 'listo'>('quien')

const plantilla = ref<Employee[]>([])
const roles = ref<RolDisponible[]>([])
const empresas = ref<LegalEntity[]>([])
const bases = ref<Installation[]>([])
const cargando = ref(true)
const error = ref<string | null>(null)
const enviando = ref(false)

const busqueda = ref('')
const elegido = ref<Employee | null>(null)
const cuentaSuelta = ref(false)

const email = ref('')
const fullName = ref('')
const roleCode = ref('')
const scopeType = ref<TipoDeAlcance>('LEGAL_ENTITY')
const scopeId = ref('')

const clave = ref<string | null>(null)
const claveCopiada = ref(false)

const visibles = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  const lista = plantilla.value
  if (q === '') return lista.slice(0, 40)
  return lista
    .filter((e) => `${e.employeeCode} ${nombreCompleto(e)}`.toLowerCase().includes(q))
    .slice(0, 40)
})

const opcionesDeRol = computed(() =>
  roles.value.map((r) => ({ label: r.name, value: r.code })),
)

const opcionesDeAlcance = computed(() =>
  (Object.keys(ALCANCE) as TipoDeAlcance[]).map((k) => ({
    label: ALCANCE[k].label,
    value: k,
  })),
)

const opcionesDeDestino = computed(() =>
  scopeType.value === 'LEGAL_ENTITY'
    ? empresas.value.map((e) => ({ label: e.businessName, value: e.id }))
    : bases.value.map((b) => ({ label: b.name, value: b.id })),
)

const puedeGuardar = computed(
  () =>
    email.value.trim() !== '' &&
    fullName.value.trim() !== '' &&
    roleCode.value !== '' &&
    (scopeType.value === 'HOLDING' || scopeId.value !== '') &&
    !enviando.value,
)

/** Al elegir persona, su ficha manda: nombre y correo salen del expediente. */
watch(elegido, (persona) => {
  if (!persona) return
  fullName.value = nombreCompleto(persona)
  email.value = persona.email ?? ''
})

// Cambiar de tipo de alcance invalida el destino elegido: una base no es una
// empresa, y dejar el id viejo mandaría un destino que no existe en esa lista.
watch(scopeType, () => (scopeId.value = ''))

onMounted(async () => {
  try {
    const [gente, catalogo, ent, inst] = await Promise.all([
      employeesApi.list({ limit: 100, onlyActive: true }),
      usersApi.roles(),
      orgApi.legalEntities(),
      orgApi.installations({ incluirInactivas: false }),
    ])
    plantilla.value = gente.data
    roles.value = catalogo
    empresas.value = ent
    bases.value = inst
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude cargar los datos'
  } finally {
    cargando.value = false
  }
})

function elegirPersona(persona: Employee): void {
  elegido.value = persona
  cuentaSuelta.value = false
  paso.value = 'que'
}

function sinExpediente(): void {
  elegido.value = null
  cuentaSuelta.value = true
  fullName.value = ''
  email.value = ''
  paso.value = 'que'
}

async function guardar(): Promise<void> {
  enviando.value = true
  error.value = null
  try {
    const r = await usersApi.crear({
      employeeId: elegido.value?.id,
      email: email.value.trim(),
      fullName: fullName.value.trim(),
      roleCode: roleCode.value,
      scopeType: scopeType.value,
      scopeId: scopeType.value === 'HOLDING' ? undefined : scopeId.value,
    })
    clave.value = r.claveProvisional
    /*
     * La clave provisional NO va en el aviso: se ve en el modal y ahí se
     * queda. Un toast se copia en una captura de pantalla sin querer.
     */
    aviso.creado('Cuenta', `${fullName.value.trim()} · ${email.value.trim()}`)
    paso.value = 'listo'
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude crear la cuenta'
  } finally {
    enviando.value = false
  }
}

/**
 * Cerrar con la cuenta ya creada NO es cancelar.
 *
 * La lista de atrás tiene que enterarse igual: si se avisara «cancelado», el
 * usuario nuevo no aparecería hasta recargar la pantalla, y quien lo acaba de
 * crear pensaría que falló.
 */
function cerrar(): void {
  if (clave.value) emit('created')
  else emit('close')
}

async function copiarClave(): Promise<void> {
  if (!clave.value) return
  await navigator.clipboard.writeText(clave.value)
  claveCopiada.value = true
  window.setTimeout(() => (claveCopiada.value = false), 2000)
}
</script>

<template>
  <UModal
    v-model:open="abierto"
    title="Dar acceso a Astra"
    :description="
      paso === 'quien'
        ? '¿Quién va a entrar?'
        : paso === 'que'
          ? '¿Con qué rol, y sobre qué?'
          : 'Cuenta creada'
    "
    @update:open="(abierta: boolean) => !abierta && cerrar()"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />
        <p v-if="cargando" class="text-muted text-sm">Cargando…</p>

        <!-- 1. La persona. -->
        <template v-else-if="paso === 'quien'">
          <UInput
            v-model="busqueda"
            icon="i-lucide-search"
            placeholder="Buscar en la plantilla por nombre o número"
            class="w-full"
          />
          <div class="border-default max-h-72 overflow-y-auto rounded-lg border">
            <button
              v-for="persona in visibles"
              :key="persona.id"
              type="button"
              class="border-default hover:bg-elevated/50 flex w-full items-center gap-3 border-t px-3 py-2 text-left first:border-t-0"
              @click="elegirPersona(persona)"
            >
              <span class="text-dimmed w-28 shrink-0 font-mono text-xs">
                {{ persona.employeeCode }}
              </span>
              <span class="text-default truncate text-sm">{{ nombreCompleto(persona) }}</span>
              <UIcon
                v-if="!persona.email"
                name="i-lucide-mail-x"
                class="text-dimmed ml-auto size-4 shrink-0"
                title="Sin correo en el expediente: habrá que teclearlo"
              />
            </button>
            <p v-if="visibles.length === 0" class="text-dimmed p-3 text-sm">
              Nadie con ese nombre o número.
            </p>
          </div>
          <UButton
            label="Crear una cuenta sin expediente"
            icon="i-lucide-user-plus"
            size="xs"
            @click="sinExpediente"
          />
          <p class="text-dimmed text-xs">
            Para quien usa Astra sin estar en la plantilla: soporte del proveedor, un contador
            externo.
          </p>
        </template>

        <!-- 2. El rol y el alcance. -->
        <template v-else-if="paso === 'que'">
          <div
            v-if="elegido"
            class="border-default bg-elevated/50 flex items-center gap-3 rounded-lg border p-3"
          >
            <UIcon name="i-lucide-user-round" class="text-muted size-5" />
            <div class="min-w-0">
              <p class="text-highlighted truncate text-sm font-medium">
                {{ nombreCompleto(elegido) }}
              </p>
              <p class="text-dimmed font-mono text-xs">{{ elegido.employeeCode }}</p>
            </div>
            <UButton label="Cambiar" size="xs" class="ml-auto" @click="paso = 'quien'" />
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Nombre">
              <UInput v-model="fullName" class="w-full" />
            </UFormField>
            <UFormField
              label="Correo"
              :help="
                elegido && !elegido.email
                  ? 'Su expediente no tiene correo. El que pongas aquí es con el que entrará.'
                  : undefined
              "
            >
              <UInput v-model="email" type="email" placeholder="nombre@empresa.mx" class="w-full" />
            </UFormField>
          </div>

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
              v-model="scopeType"
              :items="opcionesDeAlcance"
              value-key="value"
              class="w-full"
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

          <div class="flex justify-end gap-2 pt-2">
            <UButton label="Cancelar" @click="emit('close')" />
            <UButton
              label="Crear cuenta"
              icon="i-lucide-key-round"
              :disabled="!puedeGuardar"
              :loading="enviando"
              @click="guardar"
            />
          </div>
        </template>

        <!-- 3. La clave, una sola vez. -->
        <template v-else>
          <UAlert
            color="success"
            icon="i-lucide-circle-check-big"
            :title="`${fullName} ya puede entrar`"
            :description="`Con el correo ${email}. Se le va a pedir cambiar la contraseña la primera vez.`"
          />

          <div class="border-warning/50 bg-warning/5 space-y-2 rounded-lg border p-4">
            <p class="text-muted text-xs font-medium tracking-wide uppercase">
              Contraseña provisional
            </p>
            <p class="text-highlighted font-mono text-2xl tracking-wider">{{ clave }}</p>
            <p class="text-muted text-xs">
              <strong>Esta es la única vez que se ve.</strong> No se guarda en ningún sitio:
              cópiala ahora y dásela en persona. Si se pierde, hay que restablecerla.
            </p>
            <UButton
              :label="claveCopiada ? 'Copiada' : 'Copiar'"
              :icon="claveCopiada ? 'i-lucide-check' : 'i-lucide-copy'"
              size="xs"
              @click="copiarClave"
            />
          </div>

          <div class="flex justify-end">
            <UButton label="Listo" @click="emit('created')" />
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>
