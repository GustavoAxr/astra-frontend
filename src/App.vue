<template>
  <!--
    `delayDuration: 0` para TODOS los globos, no solo el del texto recortado:
    la espera del navegador con el `title` nativo era casi un segundo, y para
    leer un nombre cortado eso es una eternidad.
  -->
  <!--
    LOS AVISOS SE APILAN, NO SE AMONTONAN.
    `expand: false` los deja uno encima de otro, ocupando el alto de uno solo, y
    Nuxt UI los despliega al pasar el ratón por encima y los vuelve a plegar al
    salir. Es la diferencia entre un aviso y una cortina: con cinco altas
    seguidas, la versión desplegada tapa media pantalla justo mientras se
    trabaja.
    Arriba a la derecha porque es donde no estorba: abajo pelea con la barra de
    descargas del navegador, y a la izquierda tapa el menú.
  -->
  <UApp
    :tooltip="{ delayDuration: 0 }"
    :toaster="{ position: 'top-right', expand: false, duration: 4000 }"
  >
    <RouterView />
  </UApp>
</template>
