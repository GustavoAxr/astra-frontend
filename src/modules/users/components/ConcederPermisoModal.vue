<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { orgApi } from '@/modules/org/api'
import type { Installation, LegalEntity } from '@/modules/org/types'
import { usersApi } from '../api'
import { ALCANCE, type RolDisponible, type TipoDeAlcance, type UsuarioDeAstra } from '../types'
import SelectorDeRolYAlcance from './SelectorDeRolYAlcance.vue'

/**
 * AÑADIRLE UN PERMISO A UNA CUENTA QUE YA EXISTE.
 *
 * ══ POR QUÉ FALTABA, Y POR QUÉ ERA UN CALLEJÓN SIN SALIDA ══
 *
 * Los permisos se podían QUITAR desde la fila —la equis de cada etiqueta— pero
 * no poner: el alta solo sabía crear cuentas nuevas, y con el correo ya
 * registrado contesta «ya hay una cuenta con ese correo». Quien quitaba el
 * último permiso de alguien dejaba esa cuenta sin forma de entrar y sin ningún
 * sitio donde devolvérselo. La llamada del servidor existía desde el principio;
 * lo que no existía era la pantalla.
 *
 * ══ DOS PERMISOS IGUALES NO SE IMPIDEN EN LA BASE ══
 *
 * `user_scopes` no tiene índice único sobre (cuenta, rol, alcance): conceder dos
 * veces lo mismo mete dos filas y la fila enseña dos etiquetas idénticas, cada
 * una con su equis y ninguna que sobre más que la otra. Por eso esa combinación
 * se desactiva aquí y se dice que ya la tiene.
 */
const props = defineProps<{ usuario: UsuarioDeAstra }>()
const emit = defineEmits<{ close: []; concedido: [UsuarioDeAstra[]] }>()

const abierto = ref(true)

const roles = ref<RolDisponible[]>([])
const empresas = ref<LegalEntity[]>([])
const bases = ref<Installation[]>([])

const cargando = ref(true)
const enviando = ref(false)
const error = ref<Error | null>(null)

const roleCode = ref('')
const scopeType = ref<TipoDeAlcance>('LEGAL_ENTITY')
const scopeId = ref('')

/** Lo que ya tiene, para no ofrecer un duplicado que nadie podría distinguir. */
const yaLoTiene = computed(() =>
  props.usuario.concesiones.some(
    (c) =>
      c.roleCode === roleCode.value &&
      c.scopeType === scopeType.value &&
      (scopeType.value === 'HOLDING' || c.scopeId === scopeId.value),
  ),
)

const completo = computed(
  () => roleCode.value !== '' && (scopeType.value === 'HOLDING' || scopeId.value !== ''),
)

onMounted(async () => {
  try {
    const [catalogo, ent, inst] = await Promise.all([
      usersApi.roles(),
      orgApi.legalEntities(),
      orgApi.installations({ incluirInactivas: false }),
    ])
    roles.value = catalogo
    empresas.value = ent
    bases.value = inst
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    cargando.value = false
  }
})

async function guardar(): Promise<void> {
  if (!completo.value || yaLoTiene.value || enviando.value) return
  enviando.value = true
  error.value = null
  try {
    /*
     * El servidor devuelve LA LISTA ENTERA de cuentas ya recalculada, así que se
     * sube tal cual en vez de volver a pedirla: es la misma respuesta que ya
     * viajó y una recarga detrás solo abriría una ventana para que la fila
     * enseñe el estado viejo.
     */
    const lista = await usersApi.conceder(props.usuario.id, {
      roleCode: roleCode.value,
      scopeType: scopeType.value,
      scopeId: scopeType.value === 'HOLDING' ? undefined : scopeId.value,
    })
    emit('concedido', lista)
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="abierto"
    title="Añadir un permiso"
    :description="`${usuario.fullName} · ${usuario.email}`"
    @update:open="(abierta: boolean) => !abierta && emit('close')"
  >
    <template #body>
      <div class="space-y-4">
        <ApiErrorAlert :error="error" />
        <p v-if="cargando" class="text-muted text-sm">Cargando…</p>

        <template v-else>
          <!--
            LO QUE YA TIENE, A LA VISTA. Un permiso no sustituye a otro: se
            suman, y quien añade uno tiene que poder ver sobre qué lo está
            sumando sin cerrar el diálogo para mirar la fila de detrás.
          -->
          <div v-if="usuario.concesiones.length > 0" class="space-y-1">
            <p class="text-muted text-xs font-medium tracking-wide uppercase">Ya tiene</p>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="c in usuario.concesiones"
                :key="c.grantId"
                class="border-default bg-elevated/50 rounded-full border px-2.5 py-0.5 text-xs"
              >
                {{ c.roleName }} ·
                {{
                  c.scopeType === 'HOLDING'
                    ? ALCANCE.HOLDING.label
                    : (c.scopeName ?? 'destino borrado')
                }}
              </span>
            </div>
          </div>
          <p v-else class="text-warning text-xs">
            Esta cuenta no tiene ningún permiso: hoy no puede entrar aunque esté activa.
          </p>

          <SelectorDeRolYAlcance
            v-model:role-code="roleCode"
            v-model:scope-type="scopeType"
            v-model:scope-id="scopeId"
            :roles="roles"
            :empresas="empresas"
            :bases="bases"
          />

          <p v-if="yaLoTiene" class="text-warning text-xs">
            Ya tiene ese rol sobre eso mismo. Elige otro rol u otro destino.
          </p>

          <div class="flex justify-end gap-2 pt-2">
            <UButton label="Cancelar" @click="emit('close')" />
            <UButton
              label="Añadir permiso"
              icon="i-lucide-check"
              :disabled="!completo || yaLoTiene"
              :loading="enviando"
              @click="guardar"
            />
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>
