// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFormAutosaveController } from './formAutosave.js'
import { createFormModalController } from './modalController.js'

describe('createFormAutosaveController & modalController integration', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = `
      <div id="modal-bingo" class="modal oculto" aria-hidden="true">
        <div class="modalBackdrop" data-cerrar-modal="bingo"></div>
        <h2 id="modal-bingo-titulo">Nuevo bingo</h2>
        <button id="btn-cerrar-modal-bingo" type="button">×</button>
        <form id="form-bingo">
          <input id="bingo-nro_bingo" name="nro_bingo" type="number" value="" />
          <input id="bingo-name" name="name" type="text" value="" />
          <select id="bingo-start_month" name="start_month">
            <option value="1">Enero 2026</option>
            <option value="11" selected>Noviembre 2026</option>
          </select>
          <button id="btn-limpiar-bingo" class="oculto" type="button">Limpiar formulario</button>
          <button id="btn-cancelar-bingo" type="button">Cancelar</button>
          <button id="btn-guardar-bingo" type="submit">Guardar</button>
        </form>
      </div>
    `
  })

  it('saves form fields and extra state on input/change and restores them on restore()', () => {
    let extraQuote = 0
    const form = document.querySelector('#form-bingo')
    const autosave = createFormAutosaveController({
      key: 'bingo',
      form,
      getExtraState: () => ({ quote: extraQuote }),
      applyExtraState: (extra) => {
        extraQuote = extra?.quote ?? 0
      }
    }).initialize()

    const nroInput = form.elements.namedItem('nro_bingo')
    const nameInput = form.elements.namedItem('name')
    const monthSelect = form.elements.namedItem('start_month')

    nroInput.value = '104'
    nroInput.dispatchEvent(new Event('input', { bubbles: true }))

    nameInput.value = 'María'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))

    monthSelect.value = '1'
    extraQuote = 25
    monthSelect.dispatchEvent(new Event('change', { bubbles: true }))

    expect(autosave.hasDraft()).toBe(true)

    // Simulate page refresh / form reset
    form.reset()
    extraQuote = 0
    expect(nroInput.value).toBe('')
    expect(nameInput.value).toBe('')

    // Restore draft
    expect(autosave.restore()).toBe(true)
    expect(nroInput.value).toBe('104')
    expect(nameInput.value).toBe('María')
    expect(monthSelect.value).toBe('1')
    expect(extraQuote).toBe(25)

    // Clear draft
    autosave.clear()
    expect(autosave.hasDraft()).toBe(false)
    autosave.destroy()
  })

  it('keeps draft when modal is closed with X, Cancel, Escape, or backdrop, and clears it only on submit or Clear button', async () => {
    let customQuote = 0
    const createMock = vi.fn().mockResolvedValue({ id: 1 })
    const updateMock = vi.fn().mockResolvedValue({ id: 1 })

    const modal = createFormModalController({
      modal: '#modal-bingo',
      form: '#form-bingo',
      titleElement: '#modal-bingo-titulo',
      saveButton: '#btn-guardar-bingo',
      closeButtons: ['#btn-cerrar-modal-bingo'],
      cancelButtons: ['#btn-cancelar-bingo'],
      clearDraftButtons: ['#btn-limpiar-bingo'],
      backdrop: '[data-cerrar-modal="bingo"]',
      create: createMock,
      update: updateMock,
      notify: () => {},
      clear(form) {
        form.reset()
        customQuote = 0
      },
      autosave: {
        key: 'bingo',
        getExtraState: () => ({ quote: customQuote }),
        applyExtraState: (extra) => {
          customQuote = extra?.quote ?? 0
        }
      }
    }).initialize()

    const form = document.querySelector('#form-bingo')
    const nroInput = form.elements.namedItem('nro_bingo')
    const nameInput = form.elements.namedItem('name')
    const clearBtn = document.querySelector('#btn-limpiar-bingo')
    const cancelBtn = document.querySelector('#btn-cancelar-bingo')

    await modal.openCreate()
    expect(clearBtn.classList.contains('oculto')).toBe(false)

    // User fills fields in create mode
    nroInput.value = '205'
    nroInput.dispatchEvent(new Event('input', { bubbles: true }))
    nameInput.value = 'Carlos'
    customQuote = 9
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))

    // Close modal via Cancel button (accidental close)
    cancelBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(modal.opened).toBe(false)

    // Open Edit mode -> should NOT overwrite or restore create draft, and should hide clear button
    await modal.openEdit({ id: 99, nro_bingo: 10, name: 'Otro', start_month: 1 })
    expect(clearBtn.classList.contains('oculto')).toBe(true)
    expect(nroInput.value).toBe('10')
    await modal.close()

    // Reopen Create mode -> draft must still be there!
    await modal.openCreate()
    expect(nroInput.value).toBe('205')
    expect(nameInput.value).toBe('Carlos')
    expect(customQuote).toBe(9)

    // Click "Limpiar formulario" -> clears draft and resets fields
    clearBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(nroInput.value).toBe('')
    expect(nameInput.value).toBe('')
    expect(customQuote).toBe(0)
    expect(modal.autosave.hasDraft()).toBe(false)

    // Type new draft and submit successfully -> clears draft
    nroInput.value = '300'
    nroInput.dispatchEvent(new Event('input', { bubbles: true }))
    expect(modal.autosave.hasDraft()).toBe(true)

    await modal.submit()
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(modal.autosave.hasDraft()).toBe(false)

    modal.destroy()
  })
})
