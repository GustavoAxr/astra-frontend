<script setup lang="ts">
import { computed } from 'vue'
import AstraLogo from '@/shared/ui/AstraLogo.vue'
import { THEMES, useTheme } from '@/shared/theme'

const theme = useTheme()

/*
 * También aquí, y no es un adorno: quien entra desde una nave a pleno sol y
 * quien entra desde una caseta de noche no necesitan la misma pantalla, y la
 * de acceso es justo donde nadie ha podido cambiar nada todavía.
 */
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
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center px-4">
    <div class="absolute top-4 right-4">
      <UDropdownMenu :items="themeItems">
        <UButton
          :icon="theme.icon.value"
          square
          size="sm"
          aria-label="Cambiar entre tema claro y oscuro"
        />
      </UDropdownMenu>
    </div>

    <div class="w-full max-w-sm">
      <!-- En horizontal: con la palabra a la altura del dibujo, apilarlos
           dejaba un bloque alto y desequilibrado. -->
      <div class="mb-6 flex items-center justify-center gap-3">
        <AstraLogo class="size-14 shrink-0" />
        <p class="marca-astra text-[3.5rem] leading-none font-semibold tracking-tight">
          Astra
        </p>
      </div>
      <RouterView />
    </div>
  </div>
</template>
