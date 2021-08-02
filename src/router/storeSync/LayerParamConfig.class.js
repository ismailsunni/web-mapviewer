import AbstractParamConfig from '@/router/storeSync/abstractParamConfig.class'
import layersParamParser from '@/router/storeSync/layersParamParser'
import KMLLayer from '@/api/layers/KMLLayer.class'
import { getFileId } from '@/api/files.api'
import { API_PUBLIC_URL } from '@/config'

/**
 * Transform a layer metadata into a string. This value can then be used in the URL to describe a
 * layer and its state (visibility, opacity, etc...)
 *
 * @param {AbstractLayer} layer
 * @param {GeoAdminLayer[]} defaultLayerConfig
 * @returns {string}
 */
export function transformLayerIntoUrlString(layer, defaultLayerConfig) {
    let layerUrlString = layer.getID()
    if (layer.timeConfig && layer.timeConfig.series.length > 1) {
        layerUrlString += `@time=${layer.timeConfig.currentTimestamp}`
    }
    if (!layer.visible) {
        layerUrlString += `,f`
    }
    // if no default layers config (e.g. external layers) or if the opacity is not the same as the default one
    if (!defaultLayerConfig || layer.opacity !== defaultLayerConfig.opacity) {
        if (layer.visible) {
            layerUrlString += ','
        }
        layerUrlString += `,${layer.opacity}`
    }
    // TODO: handle custom param
    return layerUrlString
}

function dispatchLayersFromUrlIntoStore(store, urlParamValue) {
    const parsedLayers = layersParamParser(urlParamValue)
    const promisesForAllDispatch = []
    // going through layers that are already present to set opacity / visibility
    store.state.layers.activeLayers.forEach((activeLayer) => {
        const matchingLayerMetadata = parsedLayers.find((layer) => layer.id === activeLayer.getID())
        if (matchingLayerMetadata) {
            if (matchingLayerMetadata.opacity) {
                if (activeLayer.opacity !== matchingLayerMetadata.opacity) {
                    promisesForAllDispatch.push(
                        store.dispatch('setLayerOpacity', {
                            layerId: activeLayer.getID(),
                            opacity: matchingLayerMetadata.opacity,
                        })
                    )
                }
            } else {
                // checking if this active layer's opacity matches the default opacity from the config
                const configForThisLayer = store.getters.getLayerForId(activeLayer.getID())
                if (configForThisLayer.opacity !== activeLayer.opacity) {
                    promisesForAllDispatch.push(
                        store.dispatch('setLayerOpacity', {
                            layerId: activeLayer.getID(),
                            opacity: configForThisLayer.opacity,
                        })
                    )
                }
            }
            if (activeLayer.visible !== matchingLayerMetadata.visible) {
                promisesForAllDispatch.push(
                    store.dispatch('toggleLayerVisibility', activeLayer.getID())
                )
            }
        } else {
            // this layer has to be removed (not present in the URL anymore)
            promisesForAllDispatch.push(store.dispatch('removeLayer', activeLayer.getID()))
        }
    })
    // adding any layer that is not present yet
    parsedLayers.forEach((layer) => {
        if (
            !store.state.layers.activeLayers.find((activeLayer) => activeLayer.getID() === layer.id)
        ) {
            // checking if it is an external layer first
            if (layer.id.startsWith('KML|') && layer.id.split('|').length === 3) {
                const splittedLayerId = layer.id.split('|')
                const kmlLayer = new KMLLayer(splittedLayerId[2], layer.opacity, splittedLayerId[1])
                promisesForAllDispatch.push(store.dispatch('addLayer', kmlLayer))
            } else {
                // if internal (or BOD) layer, we add it through its config we have stored previously
                promisesForAllDispatch.push(store.dispatch('addLayer', layer.id))
            }
            if (layer.opacity) {
                promisesForAllDispatch.push(
                    store.dispatch('setLayerOpacity', {
                        layerId: layer.id,
                        opacity: layer.opacity,
                    })
                )
            }
            if (!layer.visible) {
                promisesForAllDispatch.push(store.dispatch('toggleLayerVisibility', layer.id))
            }
        }
    })
    // setting timestamps fore timed layers if specified in the URL
    parsedLayers
        .filter((layer) => layer.customAttributes && layer.customAttributes.time)
        .forEach((timedLayer) => {
            promisesForAllDispatch.push(
                store.dispatch('setTimedLayerCurrentTimestamp', {
                    layerId: timedLayer.id,
                    timestamp: timedLayer.customAttributes.time,
                })
            )
        })
    return Promise.all(promisesForAllDispatch)
}

function generateLayerUrlParamFromStoreValues(store) {
    return store.state.layers.activeLayers
        .map((layer) =>
            transformLayerIntoUrlString(
                layer,
                store.state.layers.config.find((config) => config.getID() === layer.getID())
            )
        )
        .join(';')
}

function dispatchAdminLayersFromUrlIntoStore(store, adminId) {
    return getFileId(adminId).then((fileId) => {
        const kmlLayer = new KMLLayer('Drawing', 1, `${API_PUBLIC_URL}${fileId}`)
        return Promise.all([
            store.dispatch('addLayer', kmlLayer),
            store.dispatch('setKmlIds', {
                adminId,
                fileId,
            }),
            store.dispatch('toggleDrawingOverlay'),
        ])
    })
}

export default class LayerParamConfig extends AbstractParamConfig {
    constructor() {
        super(
            'layers',
            'toggleLayerVisibility,addLayer,removeLayer,moveActiveLayerFromIndexToIndex,setLayerOpacity,setLayerTimestamp',
            dispatchLayersFromUrlIntoStore,
            generateLayerUrlParamFromStoreValues,
            false,
            String
        )
    }
}

export class AdminLayerParamConfig extends AbstractParamConfig {
    constructor() {
        super(
            'drawingAdminFileId',
            '',
            dispatchAdminLayersFromUrlIntoStore,
            undefined,
            false,
            String
        )
    }
}
