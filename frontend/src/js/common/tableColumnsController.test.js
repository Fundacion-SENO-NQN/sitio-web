// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTableColumnsController } from './tableColumnsController.js'
import {
  getCachedModuleSettings,
  loadModuleSettings,
  resetProfileSettingsMemoryCache,
  saveModuleSettings
} from './profileSettings.js'

describe('profileSettings & createTableColumnsController', () => {
  beforeEach(() => {
    localStorage.clear()
    resetProfileSettingsMemoryCache()
    localStorage.setItem('token', 'test-jwt-token')
    localStorage.setItem('username', 'admin_test')

    document.body.innerHTML = `
      <div id="selector-columnas-bingo" data-column-selector="bingo">
        <button id="btn-columnas-bingo" type="button" data-column-selector-toggle aria-expanded="false">
          Columnas
          <span data-column-selector-badge></span>
        </button>
        <div id="menu-columnas-bingo" class="oculto" data-column-selector-menu>
          <button type="button" data-column-selector-reset>Restablecer</button>
          <div data-column-selector-list></div>
        </div>
      </div>

      <div id="tabla-wrapper-bingo">
        <table class="table tableWide tablaComponente__table--ancha">
          <thead>
            <tr>
              <th data-col-index="0" data-col-key="nroBingo" data-col-label="Nro">Nro</th>
              <th data-col-index="1" data-col-key="name" data-col-label="Nombre">Nombre</th>
              <th data-col-index="2" data-col-key="phone" data-col-label="Teléfono">Teléfono</th>
              <th data-col-index="3" data-col-key="quotes" data-col-label="Cuotas">Cuotas</th>
              <th data-col-index="4" data-col-key="acciones" data-col-label="Acciones" data-col-fixed="true">Acciones</th>
            </tr>
          </thead>
          <tbody id="tbody-bingo">
            <tr>
              <td data-col-index="0">104</td>
              <td data-col-index="1">María</td>
              <td data-col-index="2">299 412-3456</td>
              <td data-col-index="3">[cuotas]</td>
              <td data-col-index="4"><button>Editar</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    `
  })

  it('persists and loads module settings attached to user profile', async () => {
    const patchMock = vi.fn().mockImplementation(async (payload) => ({
      ...payload
    }))

    await saveModuleSettings(
      'bingo',
      { visibleColumns: ['nroBingo', 'name', 'acciones'] },
      { patchSettings: patchMock }
    )

    expect(patchMock).toHaveBeenCalledWith({
      bingo: { visibleColumns: ['nroBingo', 'name', 'acciones'] }
    })

    expect(getCachedModuleSettings('bingo')).toEqual({
      visibleColumns: ['nroBingo', 'name', 'acciones']
    })

    resetProfileSettingsMemoryCache()

    const loaded = await loadModuleSettings('bingo', {
      fetchSettings: async () => ({
        bingo: { visibleColumns: ['nroBingo', 'quotes', 'acciones'] }
      })
    })

    expect(loaded).toEqual({
      visibleColumns: ['nroBingo', 'quotes', 'acciones']
    })
  })

  it('toggles columns in thead and tbody, keeps Acciones fixed, and persists changes to profile', async () => {
    const savedCalls = []
    const controller = createTableColumnsController({
      moduleKey: 'bingo',
      getCachedSettings: () => null,
      loadSettings: async () => ({
        visibleColumns: ['nroBingo', 'name', 'quotes', 'acciones']
      }),
      saveSettings: async (key, data) => {
        savedCalls.push({ key, data })
      }
    })

    await controller.initialize()

    // Remote profile settings hid 'phone' (col index 2)
    const phoneTh = document.querySelector('thead th[data-col-index="2"]')
    const phoneTd = document.querySelector('tbody td[data-col-index="2"]')
    const actionsTh = document.querySelector('thead th[data-col-index="4"]')
    const badge = document.querySelector('[data-column-selector-badge]')

    expect(phoneTh.hidden).toBe(true)
    expect(phoneTd.hidden).toBe(true)
    expect(actionsTh.hidden).toBe(false)
    expect(badge.textContent).toBe('3/4')

    // Hide 'name' and 'quotes' via controller
    await controller.setColumnVisible('name', false)
    await controller.setColumnVisible('quotes', false)

    // Only 'nroBingo' remains among toggleable columns -> cannot hide the last toggleable column
    const hidLast = await controller.setColumnVisible('nroBingo', false)
    expect(hidLast).toBe(false)
    expect(controller.isColumnVisible('nroBingo')).toBe(true)
    expect(controller.isColumnVisible('acciones')).toBe(true)

    // Fixed column 'acciones' cannot be hidden even if requested
    expect(await controller.setColumnVisible('acciones', false)).toBe(false)
    expect(actionsTh.hidden).toBe(false)

    // Reset to defaults restores all columns
    await controller.resetToDefaults()
    expect(phoneTh.hidden).toBe(false)
    expect(phoneTd.hidden).toBe(false)
    expect(badge.textContent).toBe('4/4')
    expect(savedCalls.length).toBeGreaterThanOrEqual(3)

    controller.destroy()
  })
})
