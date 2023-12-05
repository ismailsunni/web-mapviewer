import WMTSCapabilities from 'ol/format/WMTSCapabilities'
import proj4 from 'proj4'

import { LayerAttribution } from '@/api/layers/AbstractLayer.class'
import ExternalWMTSLayer from '@/api/layers/ExternalWMTSLayer.class'
import allCoordinateSystems, { WGS84 } from '@/utils/coordinates/coordinateSystems'
import log from '@/utils/logging'

function parseCrs(crs) {
    let epsgNumber = crs?.split(':').pop()
    if (/84/.test(epsgNumber)) {
        epsgNumber = '4326'
    }
    return allCoordinateSystems.find((system) => system.epsg === `EPSG:${epsgNumber}`)
}

function findLayer(layerId, startFrom) {
    let layer = null
    const layers = startFrom

    for (let i = 0; i < layers.length && !layer; i++) {
        if (layers[i].Identifier === layerId) {
            layer = layers[i]
        } else if (!layers[i].Identifier && layers[i].Title === layerId) {
            layer = layers[i]
        }
    }
    return layer
}

/** Wrapper around the OpenLayer WMSCapabilities to add more functionalities */
export default class WMTSCapabilitiesParser {
    constructor(content, originUrl) {
        const parser = new WMTSCapabilities()
        const capabilities = parser.read(content)
        if (!capabilities.version) {
            throw new Error(`Failed to parse WMTS Capabilities: invalid content`)
        }
        Object.assign(this, capabilities)
        this.originUrl = new URL(originUrl)
    }

    /**
     * Find recursively in the capabilities the matching layer ID node
     *
     * @param {string} layerId Layer ID to search for
     * @returns {WMTSCapabilities.Contents.Layer} Capability layer node
     */
    findLayer(layerId) {
        return findLayer(layerId, this.Contents.Layer)
    }

    /**
     * Get ExternalWMTSLayer object from the capabilities for the given layer ID
     *
     * @param {string} layerId WMTS Capabilities layer ID to retrieve
     * @param {CoordinateSystem} projection Projection currently used by the application
     * @param {number} opacity
     * @param {boolean} visible
     * @param {boolean} ignoreError Don't throw exception in case of error, but return a default
     *   value or null
     * @returns {ExternalWMTSLayer | null} ExternalWMTSLayer object
     */
    getExternalLayerObject(layerId, projection, opacity = 1, visible = true, ignoreError = true) {
        const layer = this.findLayer(layerId)
        if (!layer) {
            const msg = `No WMTS layer ${layerId} found in Capabilities ${this.originUrl.toString()}`
            log.error(msg)
            if (!ignoreError) {
                throw new Error(msg)
            }
            return null
        }
        return this._getExternalLayerObject(layer, projection, opacity, visible, ignoreError)
    }

    /**
     * Get all ExternalWMTSLayer objects from capabilities
     *
     * @param {CoordinateSystem} projection Projection currently used by the application
     * @param {number} opacity
     * @param {boolean} visible
     * @param {boolean} ignoreError Don't throw exception in case of error, but return a default
     *   value or null
     * @returns {[ExternalWMTSLayer]} List of ExternalWMTSLayer objects
     */
    getAllExternalLayerObjects(projection, opacity = 1, visible = true, ignoreError = true) {
        return this.Contents.Layer.map((layer) =>
            this._getExternalLayerObject(layer, projection, opacity, visible, ignoreError)
        ).filter((layer) => !!layer)
    }

    _getExternalLayerObject(layer, projection, opacity, visible, ignoreError) {
        const attributes = this._getLayerAttributes(layer, projection, ignoreError)

        if (!attributes) {
            return null
        }

        return new ExternalWMTSLayer(
            attributes.title,
            opacity,
            visible,
            attributes.url,
            attributes.layerId,
            attributes.attributions,
            attributes.abstract,
            attributes.extent,
            false
        )
    }

    _getLayerAttributes(layer, projection, ignoreError = true) {
        let layerId = layer.Identifier
        if (!layerId) {
            // fallback to Title
            layerId = layer.Title
        }
        if (!layerId) {
            const msg = `No layer identifier found in Capabilities ${this.originUrl.toString()}`
            log.error(msg, layer)
            if (ignoreError) {
                return {}
            }
            throw new Error(msg)
        }
        const title = layer.Title || layerId

        const getCapUrl =
            this.OperationsMetadata?.GetCapabilities?.DCP?.HTTP?.Get[0]?.href ||
            this.originUrl.toString()

        return {
            layerId: layerId,
            title: title,
            url: getCapUrl,
            version: this.version,
            abstract: layer.Abstract,
            attributions: this._getLayerAttribution(layerId),
            extent: this._getLayerExtent(layerId, layer, projection, ignoreError),
        }
    }

    _findTileMatrixSetFromLinks(links) {
        let tileMatrixSet = null
        links?.forEach((link) => {
            tileMatrixSet = this.Contents.TileMatrixSet?.find(
                (set) => set.Identifier === link.TileMatrixSet
            )
            if (tileMatrixSet) {
                return
            }
        })
        return tileMatrixSet
    }

    _getLayerExtent(layerId, layer, projection, ignoreError) {
        let layerExtent = null
        let extentEpsg = null
        // First try to get the extent from the default bounding box
        if (layer.WGS84BoundingBox?.length) {
            layerExtent = [
                [layer.WGS84BoundingBox[0], layer.WGS84BoundingBox[1]],
                [layer.WGS84BoundingBox[2], layer.WGS84BoundingBox[3]],
            ]
            extentEpsg = WGS84.epsg
        }
        // Some provider don't uses the WGS84BoundingBox, but uses the BoundingBox instead
        else if (layer.BoundingBox) {
            // search for a matching crs bounding box
            const matching = layer.BoundingBox.find((bbox) => parseCrs(bbox.crs) === projection)
            if (matching) {
                layerExtent = [
                    [matching.extent[0], matching.extent[1]],
                    [matching.extent[2], matching.extent[3]],
                ]
            } else if (layer.BoundingBox.length === 1 && !layer.BoundingBox[0].crs) {
                // if we have only one bounding box without CRS, then take it searching the CRS
                // fom the TileMatrixSet
                const tileMatrixSet = this._findTileMatrixSetFromLinks(layer.TileMatrixSetLink)
                extentEpsg = parseCrs(tileMatrixSet?.SupportedCRS)?.epsg
                if (extentEpsg) {
                    layerExtent = [
                        [layer.BoundingBox[0].extent[0], layer.BoundingBox[0].extent[1]],
                        [layer.BoundingBox[0].extent[2], layer.BoundingBox[0].extent[3]],
                    ]
                }
            } else {
                // if we have multiple bounding box search for the one that specify a supported CRS
                const supported = layer.BoundingBox.find((bbox) => parseCrs(bbox.crs))
                if (supported) {
                    extentEpsg = parseCrs(supported.crs).epsg
                    layerExtent = [
                        [supported.extent[0], supported.extent[1]],
                        [supported.extent[2], supported.extent[3]],
                    ]
                }
            }
        }
        // If we didn't find a valid and supported bounding box in the layer then fallback to the
        // linked TileMatrixSet. NOTE: some provider don't specify the bounding box at the layer
        // level but on the TileMatrixSet
        if (!layerExtent && this.Contents.TileMatrixSet) {
            const tileMatrixSet = this._findTileMatrixSetFromLinks(layer.TileMatrixSetLink)
            const system = parseCrs(tileMatrixSet?.SupportedCRS)
            if (tileMatrixSet && system && tileMatrixSet.BoundingBox) {
                layerExtent = [
                    [tileMatrixSet.BoundingBox[0], tileMatrixSet.BoundingBox[1]],
                    [tileMatrixSet.BoundingBox[2], tileMatrixSet.BoundingBox[3]],
                ]
                extentEpsg = system.epsg
            }
        }
        // Convert the extent if needed
        if (layerExtent && extentEpsg && projection.epsg !== extentEpsg) {
            layerExtent = [
                proj4(extentEpsg, projection.epsg, layerExtent[0]),
                proj4(extentEpsg, projection.epsg, layerExtent[1]),
            ]
        }
        if (!layerExtent) {
            const msg = `No layer extent found for ${layerId}`
            log.error(msg, layer)
            if (!ignoreError) {
                throw new Error(msg)
            }
        }
        return layerExtent
    }

    _getLayerAttribution(layerId) {
        let title = this.ServiceProvider?.ProviderName
        let url = this.ServiceProvider?.ProviderSite

        if (!title) {
            const msg = `No attribution title for layer ${layerId}`
            log.error(msg)
            title = this.originUrl.hostname
        }
        return [new LayerAttribution(title, url)]
    }
}
