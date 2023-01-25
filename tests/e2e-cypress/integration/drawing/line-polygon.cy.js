/// <reference types="cypress" />

import { EditableFeatureTypes } from '@/api/features.api'

const olSelector = '.ol-viewport'

const drawingStyleLineButton = '[data-cy="drawing-style-line-button"]'
const drawingStyleLinePopup = '[data-cy="drawing-style-line-popup"]'
const drawingDeleteLastPointButton = '[data-cy="drawing-delete-last-point-button"]'

describe('Line/Polygon tool', () => {
    beforeEach(() => {
        cy.goToDrawing()
        cy.clickDrawingTool(EditableFeatureTypes.LINEPOLYGON)
        cy.get(olSelector).click(100, 200)
        cy.get(olSelector).click(150, 200)
    })
    it('creates a polygon by re-clicking first point', () => {
        cy.get(olSelector).click(150, 230)
        cy.get(olSelector).click(100, 200)
        cy.readDrawingFeatures('Polygon')
        cy.wait('@post-kml').then((interception) =>
            cy.checkKMLRequest(interception, [
                EditableFeatureTypes.LINEPOLYGON,
                /"fillColor":{[^}]*"fill":"#ff0000"/,
            ])
        )
    })
    it('changes color of line/ polygon', () => {
        let kmlId = null
        cy.get(olSelector).click(150, 230)
        cy.get(olSelector).click(100, 200)
        cy.readDrawingFeatures('Polygon')
        // Who says that the order in json will stay the same? this does not work, also fix unit test
        cy.wait('@post-kml').then((interception) => {
            cy.checkKMLRequest(interception, [
                EditableFeatureTypes.LINEPOLYGON,
                /"fillColor":{[^}]*"fill":"#ff0000"/,
            ])
            kmlId = interception.response.body.id
        })

        // Opening line popup
        cy.get(drawingStyleLineButton).click()

        cy.get(`${drawingStyleLinePopup} [data-cy="color-selector-black"]`).click({ force: true })
        cy.checkDrawnGeoJsonProperty('fillColor.fill', '#000000')
        cy.wait('@update-kml').then((interception) =>
            cy.checkKMLRequest(interception, [/"fillColor":{[^}]*"fill":"#000000"/], kmlId)
        )
    })
    it('creates a line with double click', () => {
        cy.get(olSelector).should('be.visible').dblclick(120, 240, { force: true })
        cy.wait('@post-kml')
        cy.readDrawingFeatures('LineString', (features) => {
            const coos = features[0].getGeometry().getCoordinates()
            expect(coos.length).to.equal(3)
        })
    })
    it('delete last point', () => {
        cy.get(olSelector).click(180, 200)
        cy.get(drawingDeleteLastPointButton).click()
        cy.get(olSelector).should('be.visible').dblclick(120, 240, { force: true })
        cy.wait('@post-kml')
        cy.readDrawingFeatures('LineString', (features) => {
            const coos = features[0].getGeometry().getCoordinates()
            expect(coos.length).to.equal(3)
        })
    })
})
