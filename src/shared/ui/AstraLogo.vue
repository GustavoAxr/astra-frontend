<script setup lang="ts">
import { useId } from 'vue'

/**
 * El logotipo, en línea y no como `<img>`.
 *
 * POR QUÉ EN LÍNEA
 * Es la primera cosa que se pinta en cada carga. Como `<img src="/logo.svg">`
 * sería una petición más antes de que se vea algo, y en la pantalla de acceso
 * —donde no hay nada más— ese hueco se nota. Pesa menos de un kilobyte.
 *
 * POR QUÉ EL DEGRADADO LLEVA UN IDENTIFICADOR ÚNICO
 * Un `<linearGradient id="...">` es global al documento. Con el identificador
 * fijo del archivo original, dos logotipos en la misma página —la barra lateral
 * y un encabezado, por ejemplo— compartirían el primero que se montara, y al
 * desmontarse ese, el otro se quedaría sin color. `useId()` da uno distinto por
 * instancia y el problema desaparece.
 */
const gradiente = `astra-grad-${useId()}`
</script>

<template>
  <!--
    `viewBox` ajustado a la CAJA REAL del dibujo, no al lienzo de 512.
    Medido: los trazos ocupan de 91 a 421 en los dos ejes —contando los
    extremos redondeados, que sobresalen 25—, o sea que el 36 % del lienzo
    original era aire. Con ese aire dentro, el logotipo se veía más pequeño
    que el texto de al lado y separado de él, y ajustar la separación por
    fuera no lo arreglaba: el hueco estaba dentro del propio SVG.
  -->
  <svg viewBox="91 91 330 330" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient :id="gradiente" x1="0%" y1="0%" x2="100%" y2="100%">
        <!--
          En `style` y no como atributo: `var()` solo se sustituye en
          declaraciones CSS. Como atributo de presentación el navegador lo lee
          como texto literal, no encuentra color y pinta el degradado en negro.
        -->
        <stop offset="0%" style="stop-color: var(--astra-desde)" />
        <stop offset="100%" style="stop-color: var(--astra-hasta)" />
      </linearGradient>
    </defs>

    <!-- El aro del reloj, abierto a las tres para dejar salir la palomita. -->
    <path
      d="M 235 118 A 140 140 0 1 0 394 280"
      fill="none"
      :stroke="`url(#${gradiente})`"
      stroke-width="50"
      stroke-linecap="round"
    />

    <!-- Manecillas que además son una palomita, con el vértice en el centro. -->
    <path
      d="M 256 116 L 256 256 L 355 355"
      fill="none"
      :stroke="`url(#${gradiente})`"
      stroke-width="50"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
