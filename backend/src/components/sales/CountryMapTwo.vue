<script setup lang="ts">
import { onMounted, ref } from 'vue'
import jsVectorMap from 'jsvectormap'
import 'jsvectormap/dist/maps/world'

const mapRef = ref<HTMLElement | null>(null)
const mapInstance = ref<any>(null)

const initMap = () => {
  if (mapRef.value) {
    mapInstance.value = new jsVectorMap({
      selector: mapRef.value,
      map: 'world',
      zoomButtons: false,
      markersSelectable: true,
      selectedRegions: ['US'],
      zoomOnScroll: false,
      // Note: jsVectorMap options differ slightly from react-jvectormap
      regionStyle: {
        initial: {
          fill: '#9CB9FF',
          fillOpacity: 1,
          fontFamily: 'Outfit',
          stroke: 'transparent',
          strokeWidth: 1,
        },
        hover: {
          fillOpacity: 1,
          fill: '#8098F9',
        },
        selected: {
          fill: '#465FFF',
        },
      },
      markers: [
        {
          coords: [37.0902, -95.7129],
          name: 'United States',
        },
        {
          coords: [-14.235, -51.9253],
          name: 'Brazil',
        },
        {
          coords: [9.082, 8.6753],
          name: 'Nigeria',
        },
        {
          coords: [20.5937, 78.9629],
          name: 'India',
        },
        {
          coords: [-25.2744, 133.7751],
          name: 'Australia',
        },
      ],
      markerStyle: {
        initial: {
          fill: '#465FFF',
          fillOpacity: 1,
          strokeWidth: 2,
          stroke: '#ffffff',
          r: 5,
        },
        hover: {
          fill: '#3538CD',
          fillOpacity: 1,
        },
      },
    })
  }
}

onMounted(() => {
  initMap()
})
</script>

<template>
  <div ref="mapRef" id="mapTwo" class="h-full w-full bg-transparent!"></div>
</template>
