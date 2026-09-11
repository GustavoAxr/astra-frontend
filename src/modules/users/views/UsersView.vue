<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/shared/api/errors'
import { useAuthStore } from '@/modules/auth/store'
import { useAviso } from '@/shared/ui/aviso'
import { usersApi } from '../api'
import { ALCANCE, type UsuarioDeAstra } from '../types'
import NuevoUsuarioModal from '../components/NuevoUsuarioModal.vue'
import ConcederPermisoModal from '../components/ConcederPermisoModal.vue'
import VinculoAsistente from '../components/VinculoAsistente.vue'
import { asistenteApi, type VinculoDelAsistente } from '../api-asistente'

/**
 * QUIÉN ENTRA A ASTRA.
 *
 * No es la plantilla: la plantilla son las personas que trabajan y la mayoría
 * no toca el sistema. Aquí solo están las que además tienen cuenta, y lo que
 * importa de cada una no es su ficha sino QUÉ ALCANZA — por eso los permisos se
 * ven en la propia fila y no escondidos tras un clic.
 */
const auth = useAuthStore()
const aviso = useAviso()

const usuarios = ref<UsuarioDeAstra[]>([])
const cargando = ref(true)
const error = ref<string | null>(null)
const dando = ref(false)
const trabajando = ref<string | null>(null)

const busqueda = ref('')

/**
 * A QUIÉN SE LE ESTÁ AÑADIENDO UN PERMISO. `null` = a nadie.
 *
 * Se guarda la cuenta y no solo su id porque el diálogo enseña lo que ya tiene
 * para no ofrecer un duplicado.
 */
const concediendoA = ref<UsuarioDeAstra | null>(null)

/**
 * Mismo permiso que mira `VinculoAsistente` para pintarse. Aquí sirve para lo
 * contrario: para decirlo cuando NO se tiene, en vez de dejar la pantalla muda.
 */
const puedeRepartirTelegram = computed(() => auth.can('manageAssistantLinks'))

/**
 * LOS ACCESOS AL ASISTENTE, indexados por usuario.
 *
 * Se traen aparte y se cruzan aquí en vez de venir dentro de cada usuario: el
 * asistente puede estar apagado —y en la mayoría de las instalaciones lo está—
 * y en ese caso esta llamada falla sin que la pantalla de usuarios se entere.
 * Cargarlo dentro habría hecho que un asistente sin configurar tumbara la
 * pantalla donde se administra QUIÉN ENTRA, que es de las últimas que uno
 * quiere perder.
 */
const vinculos = ref<Map<string, VinculoDelAsistente>>(new Map())

async function cargarVinculos(): Promise<void> {
  try {
    const lista = await asistenteApi.list()
    vinculos.value = new Map(lista.filter((v) => v.revokedAt === null).map((v) => [v.userId, v]))
  } catch {
    // Sin vínculos, la sección simplemente no se pinta.
    vinculos.value = new Map()
  }
}

const visibles = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (q === '') return usuarios.value
  return usuarios.value.filter((u) =>
    `${u.fullName} ${u.email} ${u.employeeCode ?? ''}`.toLowerCase().includes(q),
  )
})

async function cargar(): Promise<void> {
  /*
   * «Cargando…» SOLO LA PRIMERA VEZ.
   *
   * Esa bandera cambia `v-if`/`v-else`: mientras está puesta, la lista entera
   * deja de existir y Vue DESTRUYE cada tarjeta con todo lo que guarde dentro.
   * En una recarga eso no se ve como una espera, se ve como que algo se borró.
   */
  cargando.value = usuarios.value.length === 0
  error.value = null
  try {
    usuarios.value = await usersApi.list()
    await cargarVinculos()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude traer los usuarios'
  } finally {
    cargando.value = false
  }
}

async function revocar(grantId: string): Promise<void> {
  trabajando.value = grantId
  try {
    await usersApi.revocar(grantId)
    aviso.borrado('Permiso')
    await cargar()
  } catch (e) {
    aviso.fallo(e, 'quitar el permiso')
  } finally {
    trabajando.value = null
  }
}

/**
 * CAMBIÓ ALGO DEL ASISTENTE: se vuelven a pedir LOS VÍNCULOS Y NADA MÁS.
 *
 * Antes esto llamaba a `cargar()`, y ahí estaba el fallo que rompía el QR: esa
 * recarga vaciaba la lista un instante, Vue destruía las tarjetas y con ellas el
 * estado de `VinculoAsistente` — donde vive el enlace recién generado. **El
 * servidor no puede volver a enseñarlo**: guarda su hash, no el enlace. Así que
 * pulsar «Sin correo» creaba el alta, perdía el enlace en el mismo parpadeo y
 * dejaba en pantalla «el enlace de antes ya no se puede volver a ver», sin QR y
 * sin nada que copiar.
 *
 * Ligar un chat no cambia ni cuentas ni roles: la lista de usuarios no tiene por
 * qué volver a pedirse.
 */
function asistenteCambio(): void {
  void cargarVinculos()
}

/**
 * El permiso ya está concedido: el servidor devolvió la lista recalculada.
 *
 * Se sube esa y no se vuelve a pedir — es la misma respuesta que ya viajó—, y el
 * aviso dice a quién, porque esta pantalla tiene muchas filas iguales y «permiso
 * añadido» a secas no dice sobre cuál.
 */
function permisoConcedido(lista: UsuarioDeAstra[]): void {
  const nombre = concediendoA.value?.fullName ?? ''
  usuarios.value = lista
  concediendoA.value = null
  aviso.hecho('Permiso añadido', nombre)
}

async function alternarActivo(u: UsuarioDeAstra): Promise<void> {
  trabajando.value = u.id
  try {
    usuarios.value = await usersApi.activar(u.id, !u.isActive)
    aviso.actualizado(u.fullName, u.isActive ? 'Ya no puede entrar.' : 'Vuelve a tener acceso.')
  } catch (e) {
    aviso.fallo(e, 'cambiar la cuenta')
  } finally {
    trabajando.value = null
  }
}

/**
 * NADIE SE QUITA SU PROPIO ÚLTIMO PERMISO.
 *
 * Es el mismo error de un clic que ya está atajado en «Desactivar», y aquí sale
 * más caro: sin permisos el guardia rechaza la entrada con «tu cuenta ya no
 * tiene accesos asignados», así que quien se lo quita a sí mismo se queda fuera
 * de la pantalla donde se arregla y necesita que otro se lo devuelva.
 *
 * Solo el ÚLTIMO. Quitarse uno de dos es legítimo —dejar de administrar una
 * empresa y seguir con la otra— y no deja a nadie fuera.
 */
function esMiUltimoPermiso(u: UsuarioDeAstra): boolean {
  return u.id === auth.user?.id && u.concesiones.length === 1
}

/** Cómo se lee un permiso: «RRHH en Biocarbon», «Dirección · todo el grupo». */
function comoSeLee(c: UsuarioDeAstra['concesiones'][number]): string {
  if (c.scopeType === 'HOLDING') return `${c.roleName} · ${ALCANCE.HOLDING.label}`
  return `${c.roleName} · ${c.scopeName ?? 'destino borrado'}`
}

onMounted(cargar)
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1">
        <h1 class="text-highlighted text-xl font-semibold">Quién entra a Astra</h1>
        <p class="text-muted mt-1 text-sm">
          Alguien de la plantilla pasa a usar el sistema cuando se le da un rol y se dice hasta
          dónde alcanza. Todo lo demás —quién trabaja aquí— vive en Personal.
        </p>
        <!--
          SE DICE DÓNDE ESTÁ LO QUE NO SE VE.
          El acceso por Telegram es solo de la dirección de la empresa, así que a
          soporte y a la dirección del grupo esta pantalla les sale SIN esa
          parte. Sin esta línea, quien la buscaba creía que se había roto o que
          dependía de la empresa elegida arriba — pasó.
        -->
        <p v-if="!puedeRepartirTelegram" class="text-dimmed mt-1 text-xs">
          El acceso por Telegram no se reparte desde esta cuenta: es de la administración de la
          razón social. Entra con una cuenta de ese rol para ligar un chat.
        </p>
      </div>
      <UButton label="Dar acceso" icon="i-lucide-user-round-plus" @click="dando = true" />
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

    <UInput
      v-model="busqueda"
      icon="i-lucide-search"
      placeholder="Buscar por nombre, correo o número"
      class="w-full max-w-sm"
    />

    <p v-if="cargando" class="text-muted text-sm">Cargando…</p>

    <div v-else class="space-y-2">
      <div
        v-for="u in visibles"
        :key="u.id"
        class="border-default rounded-lg border p-4"
        :class="u.isActive ? '' : 'opacity-60'"
      >
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-highlighted text-sm font-medium">{{ u.fullName }}</span>
              <UBadge v-if="!u.isActive" label="Desactivado" color="neutral" size="sm" />
              <!--
                Que siga con la contraseña provisional es un dato operativo, no
                un adorno: significa que todavía no ha entrado ni una vez.
              -->
              <UBadge v-if="u.mustChangePassword" label="No ha entrado" color="warning" size="sm" />
              <span v-if="u.employeeCode" class="text-dimmed font-mono text-xs">
                {{ u.employeeCode }}
              </span>
            </div>
            <p class="text-muted mt-0.5 text-xs">{{ u.email }}</p>

            <div class="mt-2 flex flex-wrap gap-1.5">
              <span
                v-for="c in u.concesiones"
                :key="c.grantId"
                class="border-default bg-elevated/50 inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-1 pl-2.5 text-xs"
              >
                {{ comoSeLee(c) }}
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  square
                  :aria-label="`Quitar ${comoSeLee(c)}`"
                  :disabled="trabajando === c.grantId || esMiUltimoPermiso(u)"
                  :title="
                    esMiUltimoPermiso(u)
                      ? 'Es tu único permiso: sin él no podrías volver a entrar'
                      : undefined
                  "
                  @click="revocar(c.grantId)"
                />
              </span>
              <span v-if="u.concesiones.length === 0" class="text-warning text-xs">
                Sin permisos: esta cuenta no puede entrar aunque esté activa.
              </span>
              <!--
                AÑADIR VA JUNTO A LAS ETIQUETAS, no en un menú de la fila: quitar
                está aquí, y poner tiene que estar en el mismo sitio. Un permiso
                se suma a los demás —no sustituye a ninguno—, y por eso es un
                «más» y no un «editar».
              -->
              <UButton
                icon="i-lucide-plus"
                :label="u.concesiones.length === 0 ? 'Darle un permiso' : 'Añadir permiso'"
                size="xs"
                @click="concediendoA = u"
              />
            </div>

            <!--
              EL ACCESO POR TELEGRAM, junto a los demás permisos y no en otra
              pantalla: es una concesión de acceso más. El día que alguien se
              va, aquí es donde se entra a quitarle cosas, y lo que no esté
              aquí se queda puesto.
            -->
            <VinculoAsistente
              :user-id="u.id"
              :user-name="u.fullName"
              :vinculo="vinculos.get(u.id) ?? null"
              :activo="u.isActive"
              :roles="u.concesiones.map((c) => c.roleCode)"
              @cambio="asistenteCambio"
            />
          </div>

          <UButton
            :label="u.isActive ? 'Desactivar' : 'Reactivar'"
            :icon="u.isActive ? 'i-lucide-user-round-x' : 'i-lucide-user-round-check'"
            size="xs"
            :disabled="trabajando === u.id || u.id === auth.user?.id"
            :title="u.id === auth.user?.id ? 'No puedes desactivar tu propia cuenta' : undefined"
            @click="alternarActivo(u)"
          />
        </div>
      </div>

      <p v-if="visibles.length === 0" class="text-dimmed text-sm">Nadie con ese nombre.</p>
    </div>

    <ConcederPermisoModal
      v-if="concediendoA"
      :usuario="concediendoA"
      @close="concediendoA = null"
      @concedido="permisoConcedido"
    />

    <NuevoUsuarioModal
      v-if="dando"
      @close="dando = false"
      @created="
        () => {
          dando = false
          cargar()
        }
      "
    />
  </div>
</template>
