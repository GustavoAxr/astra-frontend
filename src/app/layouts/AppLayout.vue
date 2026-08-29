<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/modules/auth/store'
import { ROLE_LABEL } from '@/modules/auth/types'
import { isGroup, visibleNavigation, type NavGroup } from '@/app/navigation'
import { useLegalEntityFilter } from '@/modules/org/store'
import LegalEntityPicker from '@/modules/org/components/LegalEntityPicker.vue'
import AstraLogo from '@/shared/ui/AstraLogo.vue'
import ConfirmDialog from '@/shared/ui/ConfirmDialog.vue'
import OverflowTooltip from '@/shared/ui/OverflowTooltip.vue'
import { THEMES, useTheme } from '@/shared/theme'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { me, roles, hasProvisionalPassword, showsLegalEntityPicker } = storeToRefs(auth)

const legalEntityFilter = useLegalEntityFilter()

const menuOpen = ref(false)

/**
 * Barra lateral retraída, a iconos.
 *
 * Se recuerda entre sesiones: quien trabaja en un portátil la retrae una vez y
 * espera que siga así mañana. `useStorage` la lee al arrancar, así que no hay
 * un salto de ancho al montar.
 *
 * Solo aplica en pantallas grandes. En móvil la barra ya es un cajón que se
 * abre y se cierra entero, y retraerla ahí no significaría nada.
 */
const colapsado = useStorage('astra-menu-colapsado', false)

const theme = useTheme()

/** El activo se marca con una palomita; lo demás sería adivinar cuál está puesto. */
const themeItems = computed(() =>
  THEMES.map((t) => ({
    label: t.label,
    icon: t.icon,
    trailingIcon: theme.current.value === t.value ? 'i-lucide-check' : undefined,
    onSelect: () => {
      theme.current.value = t.value
    },
  })),
)

/** Salir también cambia algo de un clic, y el botón es pequeño. */
const confirmingSignOut = ref(false)

// Los roles solo deciden qué se ve en el menú. Nunca si una llamada se hace.
const items = computed(() => visibleNavigation(roles.value))

/*
 * Apartados plegados. Abiertos de entrada: un menú que empieza cerrado esconde
 * lo que hay y obliga a descubrirlo abriendo cajones.
 */
const plegado = ref<Record<string, boolean>>({})
const abierto = (grupo: NavGroup): boolean => !plegado.value[grupo.label]
const alternar = (grupo: NavGroup): void => {
  plegado.value[grupo.label] = abierto(grupo)
}

// Si se llega a una pantalla de dentro —por un enlace o por la URL— su apartado
// se abre solo. Estar en una pantalla cuyo apartado aparece cerrado desorienta.
watch(
  () => route.name,
  (name) => {
    for (const entry of items.value) {
      if (isGroup(entry) && entry.children.some((child) => child.name === name)) {
        plegado.value[entry.label] = false
      }
    }
  },
  { immediate: true },
)

/**
 * El enlace activo lleva `enlace-activo`, que en modo OSCURO pinta su etiqueta
 * con el degradado de la marca (ver `main.css`). El fondo y la negrita se
 * quedan en los dos temas: son lo que sostiene el estado activo cuando el
 * degradado no está —en claro— y lo que lo hace visible sin depender del color.
 */
const linkClass = (name: string): string =>
  route.name === name
    ? 'enlace-activo bg-elevated text-highlighted font-medium'
    : 'text-muted hover:bg-elevated/60 hover:text-default'
const roleLabels = computed(() => roles.value.map((role) => ROLE_LABEL[role]).join(' · '))
const initials = computed(() =>
  (me.value?.fullName ?? '')
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase(),
)

async function signOut(): Promise<void> {
  await auth.logout()
  legalEntityFilter.reset()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div class="bg-default min-h-screen lg:flex">
    <!-- El globo del texto recortado, uno para toda la aplicación. -->
    <OverflowTooltip />

    <!-- Navegación lateral -->
    <aside
      class="border-default bg-elevated/30 flex shrink-0 flex-col border-r transition-[width] duration-200 lg:sticky lg:top-0 lg:h-screen"
      :class="[menuOpen ? '' : 'max-lg:hidden', colapsado ? 'lg:w-16' : 'lg:w-64']"
    >
      <div
        class="border-default flex h-14 items-center gap-1.5 border-b"
        :class="colapsado ? 'justify-center px-2' : 'px-4'"
      >
        <!-- Sobre fondo transparente: el logotipo trae su propio degradado. -->
        <AstraLogo class="size-7 shrink-0" />
        <!--
          `text-[1.75rem]` es exactamente `size-7`: la palabra mide lo mismo que
          el dibujo. Con `leading-none` la caja del texto no añade el espacio de
          línea que lo desalinearía por dos píxeles.
        -->
        <span
          v-if="!colapsado"
          class="marca-astra text-[1.75rem] leading-none font-semibold tracking-tight"
        >
          Astra
        </span>
      </div>

      <nav class="flex-1 space-y-0.5 overflow-y-auto" :class="colapsado ? 'p-2' : 'p-3'">
        <!--
          Retraída se pintan TODOS los enlaces en plano, hijos incluidos, y
          desaparecen los encabezados de apartado. Con dieciséis píxeles de
          ancho no cabe una jerarquía, y esconder los hijos detrás de un
          desplegable dejaría media aplicación inalcanzable sin desplegar.
          El nombre va en el título del enlace: es lo único que queda.
        -->
        <template v-for="entry in items" :key="entry.label">
          <template v-if="colapsado">
            <RouterLink
              v-for="link in isGroup(entry) ? entry.children : [entry]"
              :key="link.name"
              :to="{ name: link.name }"
              :title="link.label"
              class="flex items-center justify-center rounded-lg p-2 transition-colors"
              :class="linkClass(link.name)"
              @click="menuOpen = false"
            >
              <UIcon :name="link.icon" class="size-4 shrink-0" />
            </RouterLink>
          </template>

          <template v-else>
            <RouterLink
              v-if="!isGroup(entry)"
              :to="{ name: entry.name }"
              class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
              :class="linkClass(entry.name)"
              @click="menuOpen = false"
            >
              <UIcon :name="entry.icon" class="size-4 shrink-0" />
              <span class="truncate">{{ entry.label }}</span>
            </RouterLink>

            <!--
              Un apartado NO navega: pulsarlo abre y cierra. No hay pantalla de
              «Personal» — hay varias, y son las de dentro.
            -->
            <div v-else>
              <button
                type="button"
                class="text-muted hover:bg-elevated/60 hover:text-default flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
                :aria-expanded="abierto(entry)"
                @click="alternar(entry)"
              >
                <UIcon :name="entry.icon" class="size-4 shrink-0" />
                <span class="flex-1 truncate text-left">{{ entry.label }}</span>
                <!--
                  Una sola flecha que GIRA, en vez de dos iconos que se
                  reemplazan: cambiar el icono es un salto, girarlo cuenta que
                  es el mismo control cambiando de estado.
                -->
                <UIcon
                  name="i-lucide-chevron-right"
                  class="text-dimmed size-3.5 shrink-0 transition-transform duration-200"
                  :class="abierto(entry) ? 'rotate-90' : ''"
                />
              </button>

              <!--
                Se despliega con altura animada, y aquí no vale una transición
                normal: no se puede animar hasta `height: auto`, que es lo que
                mide una lista cuyo largo no se sabe de antemano.
                El truco es una rejilla de una fila que pasa de `0fr` a `1fr`
                —eso SÍ se puede interpolar— con el contenido recortado dentro.
                Sale CSS puro, sin medir nada a mano ni enganchar callbacks.
              -->
              <div
                class="grid transition-[grid-template-rows] duration-200 ease-out"
                :class="abierto(entry) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
              >
                <div class="overflow-hidden">
                  <div class="border-default mt-0.5 ml-5 space-y-0.5 border-l pl-2">
                    <RouterLink
                      v-for="child in entry.children"
                      :key="child.name"
                      :to="{ name: child.name }"
                      class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
                      :class="linkClass(child.name)"
                      @click="menuOpen = false"
                    >
                      <UIcon :name="child.icon" class="size-4 shrink-0" />
                      <span class="truncate">{{ child.label }}</span>
                    </RouterLink>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </template>
      </nav>

      <div class="border-default border-t" :class="colapsado ? 'p-2' : 'p-3'">
        <div class="flex gap-2.5" :class="colapsado ? 'flex-col items-center' : 'items-center'">
          <div
            class="bg-elevated text-highlighted flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
            :title="colapsado ? `${me?.fullName} · ${roleLabels}` : undefined"
          >
            {{ initials }}
          </div>

          <div v-if="!colapsado" class="min-w-0 flex-1">
            <p class="text-highlighted truncate text-sm font-medium">{{ me?.fullName }}</p>
            <p class="text-dimmed truncate text-xs">{{ roleLabels }}</p>
          </div>

          <UDropdownMenu :items="themeItems">
            <UButton
              :icon="theme.icon.value"
              square
              size="sm"
              aria-label="Cambiar entre tema claro y oscuro"
            />
          </UDropdownMenu>

          <!-- Solo en pantalla grande: en móvil la barra ya se abre y cierra entera. -->
          <UButton
            :icon="colapsado ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
            square
            size="sm"
            class="max-lg:hidden"
            :aria-label="colapsado ? 'Desplegar el menú' : 'Retraer el menú'"
            :title="colapsado ? 'Desplegar el menú' : 'Retraer el menú'"
            @click="colapsado = !colapsado"
          />

          <UButton
            icon="i-lucide-log-out"
            square
            size="sm"
            aria-label="Salir"
            @click="confirmingSignOut = true"
          />
        </div>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Barra superior -->
      <header
        class="border-default bg-default/80 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur lg:px-6"
      >
        <UButton
          icon="i-lucide-menu"
          square
          class="lg:hidden"
          aria-label="Menú"
          @click="menuOpen = !menuOpen"
        />
        <span class="text-muted text-sm">{{ route.meta.title }}</span>
        <div class="ml-auto">
          <LegalEntityPicker v-if="showsLegalEntityPicker" />
        </div>
      </header>

      <main class="flex-1 px-4 py-6 lg:px-6">
        <!--
          Aviso, no bloqueo: hoy no existe ruta para cambiar la contraseña y
          todos los usuarios vienen con la marca puesta.
        -->
        <UAlert
          v-if="hasProvisionalPassword"
          icon="i-lucide-triangle-alert"
          color="warning"
          title="Tu contraseña es provisional"
          description="Cámbiala en cuanto la pantalla exista. Puedes seguir trabajando."
          class="mb-6"
        />

        <RouterView />
      </main>
    </div>

    <ConfirmDialog
      v-model:open="confirmingSignOut"
      title="Cerrar sesión"
      message="Vas a salir de Astra. Lo que no hayas guardado se pierde."
      confirm-label="Cerrar sesión"
      confirm-icon="i-lucide-log-out"
      :action="signOut"
    />
  </div>
</template>
