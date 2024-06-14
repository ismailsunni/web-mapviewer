import * as olHas from 'ol/has'
import { getRenderPixel } from 'ol/render'
import { computed, watch } from 'vue'
import { useStore } from 'vuex'

import log from '@/utils/logging'

const dispatcher = { dispatcher: 'print-area-renderer.composable' }

export default function usePrintAreaRenderer(map) {
    const store = useStore()

    let deregister = []
    const POINTS_PER_INCH = 72 // PostScript points 1/72"
    const MM_PER_INCHES = 25.4
    const UNITS_RATIO = 39.37 // inches per meter
    let printRectangle = []

    const isActive = computed(() => store.state.print.printSectionShown)
    const printLayoutSize = computed(() => store.getters.printLayoutSize)
    const selectedScale = computed(() => store.state.print.selectedScale)
    // For simplicity we use the screen size for the map size
    const mapWidth = computed(() => store.state.ui.width)
    // Same here for simplicity we take the screen size minus the header size for the map size
    const mapHeight = computed(() => store.state.ui.height - store.state.ui.headerHeight)

    watch(isActive, (newValue) => {
        if (newValue) {
            activatePrintArea()
        } else {
            deactivatePrintArea()
        }
    })

    function activatePrintArea() {
        // layers in openlayers array are not sorted by zIndex by default !
        const sortedMapsByZIndex = map
            .getAllLayers()
            .toSorted((a, b) => b.get('zIndex') - a.get('zIndex'))
        deregister = [
            sortedMapsByZIndex[0].on('prerender', handlePreRender),
            sortedMapsByZIndex[0].on('postrender', handlePostRender),
            watch(printLayoutSize, async () => {
                await store.dispatch('setSelectedScale', {
                    scale: getOptimalScale(),
                    ...dispatcher,
                })
                updatePrintRectanglePixels(selectedScale.value, printLayoutSize.value)
            }),
            watch(selectedScale, () => {
                updatePrintRectanglePixels(selectedScale.value, printLayoutSize.value)
            }),
            map.on('change:size', () => {
                updatePrintRectanglePixels(selectedScale.value, printLayoutSize.value)
            }),
            map.getView().on('propertychange', () => {
                updatePrintRectanglePixels(selectedScale.value, printLayoutSize.value)
            }),
        ]
        const scale = getOptimalScale()
        store.dispatch('setSelectedScale', { scale, ...dispatcher })
        updatePrintRectanglePixels(scale, printLayoutSize.value)
    }

    function deactivatePrintArea() {
        while (deregister.length > 0) {
            const item = deregister.pop()
            if (typeof item === 'function') {
                item()
            } else {
                item.target.un(item.type, item.listener)
            }
        }
        map.render()
    }

    function updatePrintRectanglePixels(scale, size) {
        if (isActive.value) {
            printRectangle = calculatePageBoundsPixels(scale, size)
            map.render()
        }
    }

    function calculatePageBoundsPixels(scale, size) {
        log.debug(`Calculate page bounds pixels for scale ${scale}`)
        const s = parseFloat(scale)
        const view = map.getView()
        const resolution = view.getResolution()
        const w =
            (((((size.width / POINTS_PER_INCH) * MM_PER_INCHES) / 1000.0) * s) / resolution) *
            olHas.DEVICE_PIXEL_RATIO
        const h =
            (((((size.height / POINTS_PER_INCH) * MM_PER_INCHES) / 1000.0) * s) / resolution) *
            olHas.DEVICE_PIXEL_RATIO
        const mapSize = map.getSize()
        const center = [
            (mapSize[0] * olHas.DEVICE_PIXEL_RATIO) / 2,
            (mapSize[1] * olHas.DEVICE_PIXEL_RATIO) / 2,
        ]

        const minx = center[0] - w / 2
        const miny = center[1] - h / 2
        const maxx = center[0] + w / 2
        const maxy = center[1] + h / 2
        return [minx, miny, maxx, maxy]
    }

    // Compose events
    function handlePreRender(event) {
        const context = event.context
        context.save()
    }
    function handlePostRender(event) {
        // This is where we draw the print area rectangle using the worldPolygon
        const context = event.context
        const size = map.getSize()

        const height = size[1] * olHas.DEVICE_PIXEL_RATIO
        const width = size[0] * olHas.DEVICE_PIXEL_RATIO

        const minx = printRectangle[0]
        const miny = printRectangle[1]
        const maxx = printRectangle[2]
        const maxy = printRectangle[3]

        context.save()

        context.beginPath()

        // Outside polygon, must be clockwise
        context.moveTo(...getRenderPixel(event, [0, 0]))
        context.lineTo(...getRenderPixel(event, [width, 0]))
        context.lineTo(...getRenderPixel(event, [width, height]))
        context.lineTo(...getRenderPixel(event, [0, height]))

        // Inner polygon, must be counter-clockwise
        context.moveTo(...getRenderPixel(event, [minx, miny]))
        context.lineTo(...getRenderPixel(event, [minx, maxy]))
        context.lineTo(...getRenderPixel(event, [maxx, maxy]))
        context.lineTo(...getRenderPixel(event, [maxx, miny]))

        context.closePath()

        context.fillStyle = 'rgba(0, 5, 25, 0.75)'
        context.fill()

        context.restore()
    }

    // Compute the optimal scale based on the map size (layout), resolution,
    // non-covered map vie (by header and menu tray)
    function getOptimalScale() {
        const resolution = map.getView().getResolution()
        const width = resolution * mapWidth.value
        const height = resolution * mapHeight.value
        const layoutSize = printLayoutSize.value
        const scaleWidth = (width * UNITS_RATIO * POINTS_PER_INCH) / layoutSize.width
        const scaleHeight = (height * UNITS_RATIO * POINTS_PER_INCH) / layoutSize.height
        let testScale = scaleWidth
        if (scaleHeight < testScale) {
            testScale = scaleHeight
        }
        const selectedLayoutScales = Array.from(store.state.print.selectedLayout.scales)
        // Make sure it's sorted descending
        selectedLayoutScales.sort((a, b) => b - a)
        log.debug(
            `Get print optimal scale, testScale=${testScale} size=[${mapWidth.value},${mapHeight.value}], resolution=${resolution}, layoutSize=`,
            layoutSize,
            `, scaleWidth=${scaleWidth} scaleHeight=${scaleHeight}`,
            selectedLayoutScales
        )
        // Find the first scale that is smaller than the testScale in descending order
        return selectedLayoutScales.find((scale) => scale < testScale) ?? selectedLayoutScales[0]
    }
}
