import LayerTypes from '@/api/layers/LayerTypes.enum.js'

/**
 * Minimalist description of an active layer. Is useful when parsing layers from the URL, but we do
 * not have searched them in the "real" layers config yet.
 *
 * Data contained by one of these is sufficient to find the matching layer (or build it from scratch
 * for external layers)
 *
 * @typedef ActiveLayerConfig
 * @property {String} id The layer ID
 * @property {LayerTypes} [type] The layer type (for external layers)
 * @property {Boolean} [visible] Flag telling if the layer should be visible on the map
 * @property {Number} [opacity] The opacity that the layers should have, when `undefined` uses the
 *   default opacity for the layer.
 * @property {String} [baseUrl] The base URL of this layer, if applicable (only for external layers)
 * @property {Object} [customAttributes] Other attributes relevant for this layer, such as time
 * @property {String | Number | null | undefined} [customAttributes.year=undefined] Selected year of
 *   the time enabled layer. Can be one of the following values:
 *
 *   - Undefined := either the layer has no timeConfig or we use the default year defined in
 *       layerConfig.timeBehaviour
 *   - 'none' := no year is selected, which means that the layer won't be visible. This happens when
 *       using the TimeSlider where a user can select a year that has no data for this layer.
 *   - 'all' := load all years for this layer (for WMS this means that no TIME param is added and for
 *       WMTS we use the geoadmin definition YEAR_TO_DESCRIBE_ALL_OR_CURRENT_DATA as timestamp)
 *   - 'current' := load current year, only valid for WMTS layer where 'current' is a valid timestamp.
 *   - YYYY := any valid year entry for this layer, this will load the data only for this year.
 *
 *   This attribute has only effect on timeEnabled layer and External WMS/WMTS layer with timestamp.
 *   Default is `undefined`
 * @property {Number | undefined} [customAttributes.updateDelay=undefined] Automatic refresh time in
 *   millisecondes of the layer. Has only effect on GeoAdminGeoJsonLayer. Default is `undefined`
 * @property {String | undefined} [customAttributes.features=undefined] Colon separated list of
 *   feature IDs to select. Default is `undefined`
 * @property {String | undefined} [customAttributes.adminId=undefined] KML admin ID required to edit
 *   a KML drawing. Default is `undefined`
 */

/**
 * Returns timestamp for WMS or WMTS layer from config data
 *
 * @param {AbstractLayer} config
 * @param {Number} previewYear
 * @param {Boolean} isTimeSliderActive
 * @returns {String | null | LayerTimeConfig.currentTimeEntry.timestamp}
 */
export function getTimestampFromConfig(config, previewYear, isTimeSliderActive) {
    if (config.timeConfig) {
        // if there is a preview year set, we search for the matching timestamp
        if (isTimeSliderActive) {
            if (config.timeConfig.getTimeEntryForYear(previewYear)) {
                return config.timeConfig.getTimeEntryForYear(previewYear).timestamp
            }
        }
        // when the time slider is not active,
        // if a time entry is defined, and is different from 'all'
        // (no need to pass 'all' to our WMS, that's the default timestamp used under the hood)
        else {
            return config.timeConfig.currentTimestamp
        }
    }
    return null
}

/**
 * @param {GeoAdminWMTSLayer | ExternalWMTSLayer} wmtsLayerConfig
 * @param {CoordinateSystem} projection
 * @param {Boolean} [options.addTimestamp=false] Add the timestamp from the time config or the
 *   timeslider to the ur. When false the timestamp is set to `{Time}` and need to processed later
 *   on. Default is `false`
 * @param {Number | null} [options.previewYear=null] Default is `null`
 * @param {Boolean} [options.isTimeSliderActive=false] Default is `false`
 * @returns {String | null}
 */
export function getWmtsXyzUrl(wmtsLayerConfig, projection, options = {}) {
    const { addTimestamp = false, previewYear = null, isTimeSliderActive = false } = options ?? {}
    if (wmtsLayerConfig?.type === LayerTypes.WMTS && projection) {
        let timestamp = '{Time}'
        if (addTimestamp) {
            timestamp =
                getTimestampFromConfig(wmtsLayerConfig, previewYear, isTimeSliderActive) ??
                'current'
        }

        const layerId = wmtsLayerConfig.isExternal
            ? wmtsLayerConfig.id
            : wmtsLayerConfig.technicalName
        return `${wmtsLayerConfig.baseUrl}1.0.0/${layerId}/default/${timestamp}/${projection.epsgNumber}/{z}/{x}/{y}.${wmtsLayerConfig.format}`
    }
    return null
}

/**
 * Returns the index of the max resolution, which is used to determine the maximum zoom level
 * default to the array length
 *
 * @param {CoordinateSystem} projection
 * @param {Number} layerMaxResolution
 * @returns {Number}
 */
export function indexOfMaxResolution(projection, layerMaxResolution) {
    const indexOfResolution = projection.getResolutions().indexOf(layerMaxResolution)
    if (indexOfResolution === -1) {
        return projection.getResolutions().length
    }
    return indexOfResolution
}
