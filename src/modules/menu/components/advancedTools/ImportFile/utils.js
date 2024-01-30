import { gpx as gpxToGeoJSON } from '@mapbox/togeojson'
import bbox from '@turf/bbox'

import GPXLayer from '@/api/layers/GPXLayer.class.js'
import KMLLayer from '@/api/layers/KMLLayer.class'
import { OutOfBoundsError } from '@/utils/coordinates/coordinateUtils'
import { getExtentForProjection } from '@/utils/extentUtils.js'
import GPX from '@/utils/GPX'
import { EmptyKMLError, getKmlExtent } from '@/utils/kmlUtils'

/**
 * Checks if file is KML
 *
 * @param {string} fileContent
 * @returns {boolean}
 */
export function isKml(fileContent) {
    return /<kml/.test(fileContent) && /<\/kml\s*>/.test(fileContent)
}

/**
 * Checks if file is GPX
 *
 * @param {string} fileContent
 * @returns {boolean}
 */
export function isGpx(fileContent) {
    return /<gpx/.test(fileContent) && /<\/gpx\s*>/.test(fileContent)
}

/**
 * Handle file content
 *
 * @param {OBject} store Vuex store
 * @param {string} content Content of the file
 * @param {string} source Source of the file (either URL or file path)
 * @returns {ExternalLayer} External layer object
 */
export function handleFileContent(store, content, source) {
    let layer = null
    if (isKml(content)) {
        layer = new KMLLayer(source, true, 1.0, null /* adminId */, content)
        const extent = getKmlExtent(content)
        if (!extent) {
            throw new EmptyKMLError()
        }
        const projectedExtent = getExtentForProjection(store.state.position.projection, extent)

        if (!projectedExtent) {
            throw new OutOfBoundsError(`KML out of projection bounds: ${extent}`)
        }
        store.dispatch('zoomToExtent', projectedExtent)
        store.dispatch('addLayer', layer)
    } else if (isGpx(content)) {
        const gpxParser = new GPX()
        const metadata = gpxParser.readMetadata(content)
        const parseGpx = new DOMParser().parseFromString(content, 'text/xml')
        layer = new GPXLayer(source, true, 1.0, content, metadata)
        const extent = getExtentForProjection(
            store.state.position.projection,
            bbox(gpxToGeoJSON(parseGpx))
        )
        store.dispatch('zoomToExtent', extent)
        store.dispatch('addLayer', layer)
    } else {
        throw new Error(`Unsupported file ${source} content`)
    }
    return layer
}
