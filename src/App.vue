<template>
  <!--
    `delayDuration: 0` para TODOS los globos, no solo el del texto recortado:
    la espera del navegador con el `title` nativo era casi un segundo, y para
    leer un nombre cortado eso es una eternidad.
  -->
  <UApp :tooltip="{ delayDuration: 0 }">
    <RouterView />
  </UApp>
</template>
