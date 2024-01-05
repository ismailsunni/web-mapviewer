/// <reference types="cypress" />

describe('The Import File Tool', () => {
    beforeEach(() => {
        cy.goToMapView({}, true)
        cy.readStoreValue('state.layers.activeLayers').should('be.empty')
        cy.clickOnMenuButtonIfMobile()
        cy.get('[data-cy="menu-tray-tool-section"]:visible').click()
        cy.get('[data-cy="menu-advanced-tools-import-file"]:visible').click()
    })
    it('Import KML file', () => {
        //---------------------------------------------------------------------
        // Test the menu should be automatically closed on opening import tool box
        cy.log('the menu should be automatically closed on opening import tool box')
        cy.get('[data-cy="menu-tray"]').should('not.be.visible')
        cy.get('[data-cy="import-file-content"]').should('be.visible')
        cy.get('[data-cy="import-file-online-content"]').should('be.visible')

        //---------------------------------------------------------------------
        // Test the import of an online KML file
        cy.log('Test online import')
        const localKmlFile = 'import-tool/external-kml-file.kml'
        const validOnlineUrl = 'http://example.com/valid-kml-file.kml'
        cy.intercept('GET', validOnlineUrl, {
            fixture: localKmlFile,
        }).as('getKmlFile')

        // Type a valid online KML file URL
        cy.get('[data-cy="import-file-online-url-input"]:visible').type(validOnlineUrl)
        cy.get('[data-cy="import-file-load-button"]:visible').click()
        cy.wait('@getKmlFile')

        // Assertions for successful import
        cy.get('[data-cy="import-file-online-url-input"]')
            .find('[data-cy="text-input"]')
            .should('have.class', 'is-valid')
            .should('not.have.class', 'is-invalid')
        cy.get('[data-cy="import-file-load-button"]').should('be.visible').contains('Success')
        cy.get('[data-cy="import-file-load-button"]').should('be.visible').contains('Import')
        cy.get('[data-cy="import-file-local-content"]').should('not.be.visible')
        cy.readStoreValue('state.layers.activeLayers').should('have.length', 1)

        //---------------------------------------------------------------------
        // RE-click on the import button should not add the layer a second time
        cy.log('Test re-adding the layer, should not have effect')
        cy.get('[data-cy="import-file-load-button"]:visible').click()
        cy.wait('@getKmlFile')
        cy.readStoreValue('state.layers.activeLayers').should('have.length', 1)

        //----------------------------------------------------------------------
        cy.log('Test adding another external online KML layer')
        const secondLocalKmlFile = 'import-tool/second-external-kml-file.kml'
        const secondValidOnlineUrl = 'http://example.com/second-valid-kml-file.kml'
        cy.intercept('GET', secondValidOnlineUrl, {
            fixture: secondLocalKmlFile,
        }).as('getSecondKmlFile')

        cy.get('[data-cy="import-file-online-url-input"]:visible')
            .find('[data-cy="text-input-clear"]:visible')
            .click()
        cy.get('[data-cy="import-file-online-url-input"]:visible').type(secondValidOnlineUrl)
        cy.get('[data-cy="import-file-load-button"]:visible').click()
        cy.wait('@getSecondKmlFile')

        // Assertions for successful import
        cy.get('[data-cy="import-file-online-url-input"]')
            .find('[data-cy="text-input"]')
            .should('have.class', 'is-valid')
            .should('not.have.class', 'is-invalid')
        cy.get('[data-cy="import-file-load-button"]').should('be.visible').contains('Success')
        cy.get('[data-cy="import-file-load-button"]').should('be.visible').contains('Import')
        cy.get('[data-cy="import-file-local-content"]').should('not.be.visible')
        cy.readStoreValue('state.layers.activeLayers').should('have.length', 2)

        //----------------------------------------------------------------------
        // Test local import
        cy.log('Switch to local import')
        cy.get('[data-cy="import-file-local-btn"]:visible').click()
        cy.get('[data-cy="import-file-local-content"]').should('be.visible')

        //----------------------------------------------------------------------
        // Attach a local KML file
        cy.log('Test add a local KML file')
        cy.fixture(localKmlFile, null).as('kmlFixture')
        cy.get('[data-cy="import-file-local-input"]').selectFile('@kmlFixture', {
            force: true,
        })
        cy.get('[data-cy="import-file-load-button"]:visible').click()

        // Assertions for successful import
        cy.get('[data-cy="import-file-local-input-text"]')
            .should('have.class', 'is-valid')
            .should('not.have.class', 'is-invalid')
        cy.get('[data-cy="import-file-load-button"]').should('be.visible').contains('Success')
        cy.get('[data-cy="import-file-load-button"]').should('be.visible').contains('Import')
        cy.get('[data-cy="import-file-online-content"]').should('not.be.visible')
        cy.readStoreValue('state.layers.activeLayers').should('have.length', 3)

        //----------------------------------------------------------------------
        // RE-add the layer should have no effect (no duplicate layer)
        cy.log('Test re-adding the layer, should not have effect')
        cy.get('[data-cy="import-file-load-button"]:visible').click()
        cy.readStoreValue('state.layers.activeLayers').should('have.length', 3)

        //----------------------------------------------------------------------
        // Attach a another local KML file
        cy.log('Test add another local KML file')
        cy.fixture(secondLocalKmlFile, null).as('secondKmlFixture')
        cy.get('[data-cy="import-file-local-input"]').selectFile('@secondKmlFixture', {
            force: true,
        })
        cy.get('[data-cy="import-file-load-button"]:visible').click()

        // Assertions for successful import
        cy.get('[data-cy="import-file-local-input-text"]')
            .should('have.class', 'is-valid')
            .should('not.have.class', 'is-invalid')
        cy.get('[data-cy="import-file-load-button"]').should('be.visible').contains('Success')
        cy.get('[data-cy="import-file-load-button"]').should('be.visible').contains('Import')
        cy.get('[data-cy="import-file-online-content"]').should('not.be.visible')
        cy.readStoreValue('state.layers.activeLayers').should('have.length', 4)

        //----------------------------------------------------------------------
        cy.log('Switching back to online tab, should keep previous entry')
        // Switch back to the import of an online KML file
        cy.get('[data-cy="import-file-online-btn"]:visible').click()
        cy.get('[data-cy="import-file-online-content"]').should('be.visible')
        cy.get('[data-cy="import-file-online-url-input"]')
            .should('be.visible')
            .find('[data-cy="text-input"]')
            .should('have.class', 'is-valid')
            .should('have.value', secondValidOnlineUrl)

        //----------------------------------------------------------------------
        // Close the import tool
        cy.log('Test close import tool')
        cy.get('[data-cy="import-file-close-button"]:visible').click()
        cy.get('[data-cy="import-file-content"]').should('not.exist')

        //----------------------------------------------------------------------
        // Open the menu and check the layer list
        cy.log('Check that the external layers have been added to the active layers menu')
        cy.clickOnMenuButtonIfMobile()
        cy.get('[data-cy="menu-section-active-layers"]')
            .should('be.visible')
            .children()
            .should('have.length', 4)
            .each(($layer, index) => {
                cy.wrap($layer)
                    .find('[data-cy="menu-external-disclaimer-icon"]')
                    .should('be.visible')
                cy.wrap($layer)
                    .find('[data-cy="button-loading-metadata-spinner"]')
                    .should('not.exist')
                cy.wrap($layer)
                    .find('[data-cy^="button-loading-metadata-spinner-"]')
                    .should('not.exist')
                switch (index) {
                    case 0:
                        cy.wrap($layer).contains('Another KML')
                        break
                    case 1:
                        cy.wrap($layer).contains('Sample Placemark')
                        break
                    case 2:
                        cy.wrap($layer).contains('Another KML')
                        break
                    case 3:
                        cy.wrap($layer).contains('Sample Placemark')
                        break
                }
            })

        //---------------------------------------------------------------------
        // Test the disclaimer
        cy.log('Test the external layer disclaimer')
        cy.get('[data-cy="menu-section-active-layers"]')
            .children()
            .first()
            .find('[data-cy="menu-external-disclaimer-icon"]:visible')
            .click()
        cy.get('[data-cy="modal-content"]')
            .should('be.visible')
            .contains('Warning: Third party data')
            .contains(localKmlFile.replace(/.*?\//, ''))
        cy.get('[data-cy="modal-close-button"]:visible').click()

        //---------------------------------------------------------------------
        // Test removing a layer
        cy.log('Test removing an external layer')
        cy.get(`[data-cy="button-remove-layer-KML|${validOnlineUrl}"]:visible`).click()
        cy.readStoreValue('state.layers.activeLayers').should('have.length', 3)
        cy.get('[data-cy="menu-section-active-layers"]').children().should('have.length', 3)

        //---------------------------------------------------------------------
        // Test the disclaimer in the footer
        cy.log('Test the external layer disclaimer in the footer')
        cy.clickOnMenuButtonIfMobile()
        cy.get('[data-cy="layer-copyright-example.com"]').should('be.visible')

        //---------------------------------------------------------------------
        // Test reloading the page
        cy.log('Test reloading the page should only keep online external layers')
        cy.reload()
        cy.clickOnMenuButtonIfMobile()
        cy.get('[data-cy="menu-section-active-layers"]:visible').children().should('have.length', 1)
        cy.get(`[data-cy="active-layer-name-KML|${secondValidOnlineUrl}"]`).should('be.visible')
        cy.get('[data-cy="button-loading-metadata-spinner"]').should('not.exist')
    })
    it('Import KML file error handling', () => {
        //---------------------------------------------------------------------
        cy.log('Test online import invalid file')
        const invalidFileOnlineUrl = 'http://example.com/invalid-file.kml'
        cy.intercept('GET', invalidFileOnlineUrl, {
            body: `<html>Not a KML</html>`,
        }).as('getInvalidKmlFile')

        cy.get('[data-cy="import-file-online-url-input"]:visible').type(invalidFileOnlineUrl)
        cy.get('[data-cy="import-file-load-button"]:visible').click()
        cy.wait('@getInvalidKmlFile')

        cy.get('[data-cy="import-file-online-url-input"]')
            .find('[data-cy="text-input"]')
            .should('have.class', 'is-invalid')
            .should('not.have.class', 'is-valid')
        cy.get('[data-cy="import-file-online-url-input"]')
            .find('[data-cy="invalid-feedback-validation-error"]')
            .should('be.visible')
            .contains('Invalid file')
        cy.get('[data-cy="import-file-load-button"]:visible').should('not.be.disabled')

        //---------------------------------------------------------------------
        cy.log('Test online import invalid url')
        const invalidOnlineUrl = 'hello world'

        cy.get('[data-cy="import-file-online-url-input"]:visible')
            .find('[data-cy="text-input-clear"]:visible')
            .click()

        cy.get('[data-cy="import-file-online-url-input"]:visible').type(invalidOnlineUrl)

        cy.get('[data-cy="import-file-online-url-input"]')
            .find('[data-cy="text-input"]')
            .should('have.class', 'is-invalid')
            .should('not.have.class', 'is-valid')
        cy.get('[data-cy="import-file-online-url-input"]')
            .find('[data-cy="invalid-feedback-error"]')
            .should('be.visible')
            .contains('URL is not valid')
        cy.get('[data-cy="import-file-load-button"]:visible').should('be.disabled')

        //---------------------------------------------------------------------
        cy.log('Test online import url not reachable')
        const onlineUrlNotReachable = 'http://example.com/kml-file.kml'
        cy.intercept('GET', onlineUrlNotReachable, {
            statusCode: 403,
        }).as('getNoReachableKmlFile')

        cy.get('[data-cy="import-file-online-url-input"]:visible')
            .find('[data-cy="text-input-clear"]:visible')
            .click()

        cy.get('[data-cy="import-file-online-url-input"]:visible').type(onlineUrlNotReachable)
        cy.get('[data-cy="import-file-load-button"]:visible').click()
        cy.wait('@getNoReachableKmlFile')

        cy.get('[data-cy="import-file-online-url-input"]')
            .find('[data-cy="text-input"]')
            .should('have.class', 'is-invalid')
            .should('not.have.class', 'is-valid')
        cy.get('[data-cy="import-file-online-url-input"]')
            .find('[data-cy="invalid-feedback-validation-error"]')
            .should('be.visible')
            .contains('file not accessible')
        cy.get('[data-cy="import-file-load-button"]:visible').should('not.be.disabled')

        //----------------------------------------------------------------------
        // Test local import error handling
        cy.log('Switch to local import')
        cy.get('[data-cy="import-file-local-btn"]:visible').click()
        cy.get('[data-cy="import-file-local-content"]').should('be.visible')
        cy.get('[data-cy="import-file-load-button"]:visible').should('be.disabled')

        //----------------------------------------------------------------------
        // Attach a local invalid KML file
        cy.log('Test add a local invalid KML file')
        cy.get('[data-cy="import-file-local-input"]').selectFile(
            {
                contents: Cypress.Buffer.from('Invalid kml file contents'),
                fileName: 'file.txt',
                mimeType: 'text/plain',
                lastModified: Date.now(),
            },
            { force: true }
        )
        cy.get('[data-cy="import-file-load-button"]:visible').click()

        cy.get('[data-cy="import-file-local-input-text"]')
            .should('have.class', 'is-invalid')
            .should('not.have.class', 'is-valid')
        cy.get('[data-cy="import-file-local-invalid-feedback"]')
            .should('be.visible')
            .contains('Invalid file')
        cy.get('[data-cy="import-file-load-button"]:visible').should('be.disabled')

        //----------------------------------------------------------------------
        // Close the import tool
        cy.log('Test close import tool')
        cy.get('[data-cy="import-file-close-button"]:visible').click()
        cy.get('[data-cy="import-file-content"]').should('not.exist')

        cy.clickOnMenuButtonIfMobile()
        cy.get('[data-cy="menu-section-active-layers"]').should('not.be.visible')
        cy.get('[data-cy="menu-section-no-layers"]').should('be.visible')
    })
    it('Import GPX file', () => {
        // the menu should be automatically closed on opening import tool box
        cy.get('[data-cy="menu-tray"]').should('not.be.visible')
        cy.get('[data-cy="import-file-content"]').should('be.visible')
        cy.get('[data-cy="import-file-online-content"]').should('be.visible')

        // TODO test the import of an online KML file

        cy.get('[data-cy="import-file-local-btn"]:visible').click()
        cy.get('[data-cy="import-file-local-content"]').should('be.visible')

        // TODO test the import of a local KML file

        cy.get('[data-cy="import-file-close-button"]:visible').click()
        cy.get('[data-cy="import-file-content"]').should('not.exist')
    })
})
describe('The Import Maps Tool', () => {
    beforeEach(() => {
        cy.goToMapView({}, true)
        cy.clickOnMenuButtonIfMobile()
    })
    it('Import external wms layers', () => {
        cy.intercept(
            {
                https: true,
                hostname: 'wms.geo.admin.ch',
                query: { REQUEST: 'GetCapabilities' },
            },
            { fixture: 'import-tool/wms-geo-admin-get-capabilities.xml' }
        ).as('wms-get-capabilities')
        cy.intercept(
            {
                https: true,
                hostname: 'wms.geo.admin.ch',
                query: { REQUEST: 'GetMap' },
            },
            { statusCode: 200 }
        ).as('wms-get-map')
        cy.get('[data-cy="menu-tray-tool-section"]').click()
        cy.get('[data-cy="menu-advanced-tools-import-catalogue"]').click()
        cy.get('[data-cy="import-catalogue-input"]').type('wms.geo.admin')
        cy.get('[data-cy="import-provider-list"]')
            .children()
            .contains('https://wms.geo.admin.ch')
            .click()
        cy.wait('@wms-get-capabilities')
        // TODO test add layer
        // cy.get('[data-cy="import-add-layer-button"]').scrollIntoView()
        // cy.get('[data-cy="import-add-layer-button"]').should('be.visible')
        // cy.get('[data-cy="import-result-list"]').children().should('have.length', 3).first().click()
        // cy.wait('@wms-get-map')
        // cy.readStoreValue('state.layers.activeLayers').should('be.empty')
        // cy.get('[data-cy="import-add-layer-button"]').click()
        // cy.readStoreValue('state.layers.activeLayers').then((activeLayers) => {
        //     expect(activeLayers).to.be.an('Array').length(1)
        //     const externalLayer = activeLayers[0]
        //     expect(externalLayer.isExternal).to.be.true
        //     expect(externalLayer.visible).to.be.true
        //     expect(externalLayer.externalLayerId).to.eq('ch.vbs.armeelogistikcenter')
        //     expect(externalLayer.name).to.eq('Centres logistiques de l`armée CLA')
        // })

        // // Check the map attribution
        // cy.get('[data-cy="layer-copyright-Das Geoportal des Bundes"]')
        //     .should('be.visible')
        //     .contains('Das Geoportal des Bundes')
        // // Check the layer attribution
        // if (isMobile()) {
        //     cy.get('[data-cy="menu-button"]').click()
        //     cy.get('[data-cy="menu-active-layers"]').should('be.visible').click()
        // }
        // cy.get('[data-cy="menu-external-disclaimer-icon"]').should('be.visible').click()
        // cy.get('[data-cy="modal-content"]').contains(
        //     'Warning: Third party data and/or style shown (Das Geoportal des Bundes)'
        // )
    })
    it('Import external wmts layers', () => {
        // TODO
    })
})
