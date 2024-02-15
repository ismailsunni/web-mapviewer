import {
    createEmpty as emptyExtent,
    extend as extendExtent,
    isEmpty as isExtentEmpty,
} from 'ol/extent'
import Feature from 'ol/Feature'
import GeoJSON from 'ol/format/GeoJSON'
import KML, { getDefaultStyle } from 'ol/format/KML'
import IconStyle from 'ol/style/Icon'
import Style from 'ol/style/Style'

import EditableFeature, { EditableFeatureTypes } from '@/api/features/EditableFeature.class'
import { DrawingIcon } from '@/api/icon.api'
import { WGS84 } from '@/utils/coordinates/coordinateSystems'
import {
    allStylingSizes,
    featureStyleFunction,
    getFeatureStyleColor,
    getStyle,
    getTextColor,
    getTextSize,
    RED,
    SMALL,
} from '@/utils/featureStyleUtils'
import { GeodesicGeometries } from '@/utils/geodesicManager'
import log from '@/utils/logging'
import { parseRGBColor } from '@/utils/utils'

// On the legacy drawing, openlayer used the scale from xml as is, but since openlayer
// version 6.7, the scale has been normalized to 32 pixels, therefore we need to add the
// 32 pixel scale factor below
// scale_factor := iconStyle.getSize()[0] / 32
// iconStyle.getSize()[0] = 48 (always 48 pixel on old viewer)
// scale_factor = 48/32 => 1.5
// See https://github.com/openlayers/openlayers/pull/12695
export const LEGACY_ICON_XML_SCALE_FACTOR = 1.5

/**
 * Read the KML name
 *
 * @param {string} content Kml content
 * @returns {string} Return KML name
 */
export function parseKmlName(content) {
    const kml = new KML()

    return kml.readName(content)
}

/**
 * Get KML extent
 *
 * @param {string} content KML content
 * @returns {ol/extent|null} KML layer extent in WGS84 projection or null if the KML has no features
 */
export function getKmlExtent(content) {
    const kml = new KML()
    const features = kml.readFeatures(content, {
        dataProjection: WGS84.epsg, // KML files should always be in WGS84
        featureProjection: WGS84.epsg,
    })
    const extent = emptyExtent()
    features.forEach((feature) => {
        extendExtent(extent, feature.getGeometry().getExtent())
    })
    if (isExtentEmpty(extent)) {
        return null
    }
    return extent
}

/**
 * Get the KML feature type
 *
 * The type is taken from the geoadmin proprietary "type" property, and if this property is not
 * available it is guess from the geometry and style. The only use case that cannot be guess is for
 * measure which will always fallback to line.
 *
 * @param {ol/Feature} kmlFeature Open layer kml feature
 * @returns {String | null} KML feature type or null if this is not a geoadmin kml feature
 */
export function getFeatureType(kmlFeature) {
    let featureType = kmlFeature.get('type')?.toUpperCase() // only set by geoadmin's kml
    if (!Object.values(EditableFeatureTypes).includes(featureType)) {
        log.error(
            `Type ${featureType} of feature in kml not recognized, guessing it from geometry`,
            kmlFeature
        )

        const style = getStyle(kmlFeature)
        switch (kmlFeature.getGeometry().getType()) {
            case 'Point':
                if (style?.getImage()?.getScale() > 0) {
                    featureType = EditableFeatureTypes.MARKER
                } else {
                    featureType = EditableFeatureTypes.ANNOTATION
                }
                break
            case 'LineString':
                // Here this could also be a measure but cannot differentiate between measure
                // and line
                featureType = EditableFeatureTypes.LINEPOLYGON
                break
            case 'Polygon':
                featureType = EditableFeatureTypes.LINEPOLYGON
                break
            default:
                log.error(`Could not guess the feature type, fallback to marker`, kmlFeature, style)
                featureType = EditableFeatureTypes.MARKER
                break
        }
    }
    return featureType
}

/**
 * Get feature text scale from style
 *
 * @param {Style} style
 * @returns {number | null} Return text scale or null if not found
 */
export function getTextScale(style) {
    // When exporting the kml, the parser does not put a scale property when the scale is 1.
    // But when importing the kml, it seems that the parser interprets the lack of a scale
    // property as if the scale was 0.8, which is strange. The code below tries to fix that.
    let textScale = style.getText()?.getScale() ?? null
    if (textScale === getDefaultStyle()?.getText()?.getScale()) {
        return 1
    }
    return textScale
}

/**
 * Get KML icon style
 *
 * @param {Style} style
 * @returns {IconStyle | null} Returns the KML icon style if present otherwise null
 */
export function getIconStyle(style) {
    if (!(style instanceof Style)) {
        return null
    }
    let icon = style.getImage()
    if (!(icon instanceof IconStyle)) {
        return null
    }
    // To interpret the KMLs the same way as GoogleEarth, the kml parser automatically adds a Google icon
    // if no icon is present (i.e. for our text feature type), but we do not want that.
    if (
        icon?.getSrc()?.match(/google/) ||
        icon?.getSrc() === getDefaultStyle()?.getImage()?.getSrc()
    ) {
        return null
    }
    return icon
}

class IconColorArg {
    /**
     * @param {Number} r
     * @param {Number} g
     * @param {Number} b
     */
    constructor(r, g, b) {
        this.r = r
        this.g = g
        this.b = b
    }
}

class IconArgs {
    /**
     * @param {string} set
     * @param {string} name
     * @param {IconColorArg} color
     * @param {Boolean} isLegacy
     */
    constructor(set, name, color, isLegacy) {
        this.set = set
        this.name = name
        this.color = color
        this.isLegacy = isLegacy
    }
}

/**
 * Parse an Icon URL
 *
 * This handle also the legacy icon url to the following two url style:
 *
 * - Api3.geo.admin.ch/color/{r},{g},{b}/{image}-{size}@{scale}x.png
 * - Api3.geo.admin.ch/images/{set_name}/{image}
 *
 * As well as the new style:
 *
 * - Map.geo.admin.ch/api/icons/sets/{set_name}/icons/{icon_name}@{icon_scale}-{red},{green},{blue}.png
 *
 * @param {string} url URL string
 * @returns {IconArgs | null} Returns the parsed URL or nul in case of invalid non recognize url
 */
export function parseIconUrl(url) {
    // legacy icon urls pattern
    // default set := /color/{r},{g},{b}/{image}-{size}@{scale}x.png
    // babs set := /images/{set_name}/{image}
    const legacyDefaultMatch =
        /color\/(?<r>\d+),(?<g>\d+),(?<b>\d+)\/(?<name>[^/]+)-(?<size>\d+)@(?<scale>\d+)x\.png$/.exec(
            url
        )
    const legacySetMatch = /images\/(?<set>\w+)\/(?<name>[^/]+)\.png$/.exec(url)

    // new icon urls pattern
    // /api/icons/sets/{set_name}/icons/{icon_name}.png
    // /api/icons/sets/{set_name}/icons/{icon_name}@{icon_scale}-{red},{green},{blue}.png
    // if cannot be parsed from legacy or new pattern, then use default
    const setMatch =
        /api\/icons\/sets\/(?<set>\w+)\/icons\/(?<name>.+?)(@(?<scale>\d+(\.\d+)?)x-(?<r>\d+),(?<g>\d+),(?<b>\d+))\.png/.exec(
            url
        )

    const match = legacyDefaultMatch ?? legacySetMatch ?? setMatch

    if (!match) {
        log.warn(`Could not retrieve icon infos from URL ${url}`)
        return null
    }

    const setName = match.groups.set ?? 'default'
    const name = match.groups.name ?? 'unknown'
    const isLegacy = !!(legacyDefaultMatch || legacySetMatch)

    return new IconArgs(
        setName,
        name,
        new IconColorArg(
            parseRGBColor(match.groups.r ?? 255, 'R'),
            parseRGBColor(match.groups.g ?? 0, 'B'),
            parseRGBColor(match.groups.b ?? 0, 'G')
        ),
        isLegacy
    )
}

/**
 * Generates an icon that has the url of the given olIcon
 *
 * This is used for non geoadmin KMLs
 *
 * @param {IconStyle} iconStyle
 * @param {IconArgs} iconArgs
 * @returns {DrawingIcon}
 */
function generateIconFromStyle(iconStyle, iconArgs) {
    if (!iconStyle || !iconArgs) {
        return null
    }
    iconStyle.setDisplacement([0, 0])
    const url = iconStyle.getSrc()
    const size = iconStyle.getSize()
    let anchor = iconStyle.getAnchor()
    try {
        anchor[0] /= size[0]
        anchor[1] /= size[1]
    } catch (error) {
        log.error(`Failed to compute icon anchor: anchor=${anchor}, size=${size}`)
        anchor = [0, 0]
    }

    return url && anchor ? new DrawingIcon(iconArgs.name, url, url, iconArgs.set, anchor) : null
}

/**
 * Get KML drawing icon from style
 *
 * This returns null if the icon is not a geoadmin icon, but returns a default icon if the icon
 * cannot be found in the icon list.
 *
 * @param {IconArgs} iconArgs Geoadmin icon arguments
 * @param {IconStyle | null} iconStyle Ol icon style
 * @param {DrawingIconSet[] | null} availableIconSets
 * @returns {DrawingIcon | null} Return the drawing icon or nul in case of non geoadmin icon
 */
export function getIcon(iconArgs, iconStyle, availableIconSets) {
    if (!iconArgs) {
        return null
    }

    // Here if we have already the icon sets and can find the icon within the available sets
    // we are using it, if not we generate the DrawingIcon from the URL parsing.
    // Creating the DrawingIcon from the URL parsing works well for almost all uses cases, the
    // exception is for legacy default set url where the name doesn't have the numbered prefix.
    // That means that in this case if we don't have the icon sets when parsing and we then open
    // the drawing menu, when clicking on an icon the preselection in the icon dropdown will not
    // work ! This in theory only happens when opening a legacy drawing with the admin id.
    // See also the watcher in DrawingModule trying to solve this.
    if (!availableIconSets) {
        log.error(`Iconset not yet available fallback to default icon`)
        return generateIconFromStyle(iconStyle, iconArgs)
    }
    const iconSet = availableIconSets.find((drawingIconSet) => drawingIconSet.name === iconArgs.set)
    if (!iconSet) {
        log.error(`Iconset ${iconArgs.set} not found, fallback to default icon`)
        return generateIconFromStyle(iconStyle, iconArgs)
    }

    // The icon name on the legacy default set was without numbered prefix, therefore add a
    // regex numbered prefix to it. This allow for the new icon url syntax to do a full match
    // while on legacy default url we use only the name without numbered prefix
    const namePrefix = iconArgs.isLegacy ? '(\\d+-)?' : ''
    const nameRegex = new RegExp(`^${namePrefix}${iconArgs.name}$`)

    const icon = iconSet.icons.find((drawingIcon) => nameRegex.test(drawingIcon.name))
    if (!icon) {
        log.error(
            `Can not find icon ${iconArgs.name} in set ${iconArgs.set}, fallback to default icon`
        )
        return generateIconFromStyle(iconStyle, iconArgs)
    }
    return icon
}

/**
 * Get icon Size
 *
 * Default to SMALL if not found in style
 *
 * @param {IconStyle} iconStyle
 * @returns {FeatureStyleSize} Returns the icon size
 */
function getIconSize(iconStyle) {
    const iconScale = iconStyle.getScale()
    if (iconScale) {
        return allStylingSizes.find((size) => size.iconScale === iconScale) ?? SMALL
    }
    return SMALL
}

/**
 * Get the fill color from icon arguments or style
 *
 * @param {Style} style
 * @param {ol/geom/Type} geometryType
 * @param {IconArg} iconArgs
 * @returns {FeatureStyleColor} Returns fill color (default RED if not found in style)
 */
export function getFillColor(style, geometryType, iconArgs) {
    // Fillcolor can be either the color of the stroke or the fill color or the color of the icon.
    if (geometryType === 'Point' && iconArgs?.color) {
        return getFeatureStyleColor([iconArgs.color.r, iconArgs.color.g, iconArgs.color.b])
    } else if (['LineString', 'Point'].includes(geometryType) && style.getStroke()) {
        return getFeatureStyleColor(style.getStroke().getColor())
    } else if (geometryType === 'Polygon' && style.getFill()) {
        return getFeatureStyleColor(style.getFill().getColor())
    } else {
        return RED
    }
}

/**
 * Get KML feature coordinates
 *
 * @param {Feature} feature Openlayer kml feature
 * @returns {[[lat, lon]]} Return the coordinate of the feature
 */
export function getKmlFeatureCoordinates(feature) {
    let coordinates = feature.getGeometry().getCoordinates()
    if (feature.getGeometry().getType() === 'Polygon') {
        // in case of a polygon, the coordinates structure is
        // [
        //   [ (poly1)
        //      [coord1],[coord2]
        //   ],
        //   [ (poly2) ...
        // ]
        // so as we will not have multipoly, we only keep what's defined as poly one
        // (we remove the wrapping array that would enable us to have a second polygon)
        coordinates = coordinates[0]
    }
    return coordinates
}

/**
 * Get the geoadmin editable feature for the given open layer KML feature
 *
 * @param {Feature} kmlFeature Open layer KML feature
 * @param {DrawingIconSet[]} availableIconSets
 * @returns {EditableFeature | null} Returns EditableFeature or null if this is not a geoadmin
 *   feature
 */
export function getEditableFeatureFromKmlFeature(kmlFeature, availableIconSets) {
    const featureType = getFeatureType(kmlFeature)
    if (!(kmlFeature instanceof Feature)) {
        log.error(`Cannot generate EditableFeature from KML feature`, kmlFeature)
        return null
    }
    // The kml parser automatically created a style based on the "<style>" part of the feature in the kml file.
    // We will now analyse this style to retrieve all information we need to generate the editable feature.
    const style = getStyle(kmlFeature)
    if (!style) {
        log.error('Parsing error: Could not get the style from the ol Feature', kmlFeature)
        return null
    }
    const featureId = kmlFeature.getId()

    // facultative on marker, never present on measure and linepolygon
    const title = kmlFeature.get('name') ?? ''
    const textScale = getTextScale(style)
    const textSize = getTextSize(textScale)
    const textColor = getTextColor(style)

    const description = kmlFeature.get('description') ?? ''

    const iconStyle = getIconStyle(style)
    const iconArgs = iconStyle ? parseIconUrl(iconStyle.getSrc()) : null
    if (iconArgs?.isLegacy) {
        // On the legacy drawing, openlayer used the scale from xml as is, but since openlayer
        // version 6.7, the scale has been normalized to 32 pixels, therefore we need to add the
        // 32 pixel scale factor below
        // scale_factor := iconStyle.getSize()[0] / 32
        // iconStyle.getSize()[0] = 48 (always 48 pixel on old viewer)
        // scale_factor = 48/32 => 1.5
        iconStyle.setScale(iconStyle.getScale() * LEGACY_ICON_XML_SCALE_FACTOR)
    }
    const icon = iconArgs ? getIcon(iconArgs, iconStyle, availableIconSets) : null
    const iconSize = iconStyle ? getIconSize(iconStyle) : null
    const fillColor = getFillColor(style, kmlFeature.getGeometry().getType(), iconArgs)

    const geometry = new GeoJSON().writeGeometryObject(kmlFeature.getGeometry())
    const coordinates = getKmlFeatureCoordinates(kmlFeature)

    return EditableFeature.newFeature({
        id: featureId,
        featureType: featureType,
        title,
        description: description,
        coordinates,
        geometry,
        textColor,
        textSize,
        fillColor,
        icon,
        iconSize,
    })
}

/**
 * Parses a KML's data into OL Features
 *
 * @param {String} kmlData KML content to parse
 * @param {CoordinateSystem} projection Projection to use for the OL Feature
 * @param {DrawingIconSet[]} iconSets Icon sets to use for EditabeFeature deserialization
 * @returns {ol/Feature[]} List of OL Features
 */
export function parseKml(kmlData, projection, iconSets) {
    const features = new KML().readFeatures(kmlData, {
        dataProjection: WGS84.epsg, // KML files should always be in WGS84
        featureProjection: projection.epsg,
    })
    features.forEach((olFeature) => {
        const editableFeature = getEditableFeatureFromKmlFeature(olFeature, iconSets)

        if (editableFeature) {
            // Set the EditableFeature coordinates from the olFeature geometry
            editableFeature.setCoordinatesFromFeature(olFeature)
            olFeature.set('editableFeature', editableFeature)
            olFeature.setStyle(featureStyleFunction)

            if (editableFeature.isLineOrMeasure()) {
                /* The featureStyleFunction uses the geometries calculated in the geodesic object
                if present. The lines connecting the vertices of the geometry will appear
                geodesic (follow the shortest path) in this case instead of linear (be straight on
                the screen)  */
                olFeature.set('geodesic', new GeodesicGeometries(olFeature, projection))
            }
        }
    })

    return features
}

export class EmptyKMLError extends Error {}
