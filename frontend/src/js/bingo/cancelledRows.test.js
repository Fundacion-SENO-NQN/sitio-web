// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createListController } from '../common/listController.js'
import { createTableRenderer } from '../common/table.js'
import { createBingoColumns } from './table.js'

const sampleBingos = [
  {
    id: 1,
    nro_bingo: 101,
    name: 'María',
    last_name: 'González',
    phone: '299 412-3456',
    address: 'Av. Argentina 450',
    neighborhood: 'Centro',
    seller: 'Nancy',
    locality: 'Neuquén',
    collection_locate: 'Domicilio',
    collection_date: 'Del 1 al 10',
    start_month: 3,
    quote: 25,
    late_payment_notice: 10,
    cancelled: false,
    created_at: '2026-03-01T12:00:00Z'
  },
  {
    id: 2,
    nro_bingo: 102,
    name: 'Carlos',
    last_name: 'Pérez',
    phone: '299 500-1122',
    address: 'Belgrano 210',
    neighborhood: 'Oeste',
    seller: 'Ana',
    locality: 'Neuquén',
    collection_locate: 'Sede',
    collection_date: 'Del 5 al 15',
    start_month: 4,
    quote: 0,
    late_payment_notice: 0,
    cancelled: true,
    created_at: '2026-04-01T12:00:00Z'
  }
]

describe('Bingo cancelled rows rendering and filtering', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input id="buscar-bingos" type="search" />
      <label for="mostrar-cancelados-bingo">
        <input id="mostrar-cancelados-bingo" type="checkbox" checked />
        <span>Mostrar cancelados</span>
      </label>
      <span id="cantidad-bingos"></span>
      <div id="estado-cargando-bingo" class="oculto"></div>
      <div id="estado-error-bingo" class="oculto"></div>
      <div id="estado-vacio-bingo" class="oculto">
        <h2></h2>
        <p></p>
        <button id="btn-primer-bingo" type="button">Crear bingo</button>
      </div>
      <div id="tabla-wrapper-bingo" class="oculto">
        <table>
          <tbody id="tbody-bingo"></tbody>
        </table>
      </div>
    `
  })

  it('marks cancelled rows with filaCancelada class without adding an extra Cancelado column', async () => {
    const columns = createBingoColumns({ onEdit: () => {}, onDelete: () => {} })
    expect(columns).toHaveLength(14)

    const checkbox = document.querySelector('#mostrar-cancelados-bingo')
    let showCancelled = checkbox.checked

    const renderTable = createTableRenderer({
      body: '#tbody-bingo',
      columns,
      getRowClassName: (bingo) => ({
        filaCancelada: Boolean(bingo.cancelled)
      }),
      getRowDataset: (bingo) => ({
        cancelled: bingo.cancelled ? 'true' : 'false'
      })
    })

    const listController = createListController({
      load: async () => sampleBingos,
      render: renderTable,
      searchInput: '#buscar-bingos',
      countElement: '#cantidad-bingos',
      loadingElement: '#estado-cargando-bingo',
      errorElement: '#estado-error-bingo',
      emptyElement: '#estado-vacio-bingo',
      tableElement: '#tabla-wrapper-bingo',
      filter: (bingo) => showCancelled || !Boolean(bingo.cancelled),
      singular: 'bingo',
      plural: 'bingos'
    })

    checkbox.addEventListener('change', () => {
      showCancelled = checkbox.checked
      listController.applyFilters()
    })

    await listController.initialize()

    // Initially checked: both rows shown, only cancelled row has filaCancelada
    let rows = [...document.querySelectorAll('#tbody-bingo tr')]
    expect(rows).toHaveLength(2)
    expect(rows[0].classList.contains('filaCancelada')).toBe(false)
    expect(rows[0].dataset.cancelled).toBe('false')
    expect(rows[1].classList.contains('filaCancelada')).toBe(true)
    expect(rows[1].dataset.cancelled).toBe('true')
    expect(document.querySelector('#cantidad-bingos').textContent).toBe(
      '2 bingos'
    )

    // Uncheck: cancelled row is hidden and counter reflects visible/total
    checkbox.checked = false
    checkbox.dispatchEvent(new Event('change'))

    rows = [...document.querySelectorAll('#tbody-bingo tr')]
    expect(rows).toHaveLength(1)
    expect(rows[0].dataset.itemId).toBe('1')
    expect(rows[0].classList.contains('filaCancelada')).toBe(false)
    expect(document.querySelector('#cantidad-bingos').textContent).toBe(
      '1 de 2 bingos'
    )

    // Re-check: cancelled row returns with filaCancelada styling
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))

    rows = [...document.querySelectorAll('#tbody-bingo tr')]
    expect(rows).toHaveLength(2)
    expect(rows[1].classList.contains('filaCancelada')).toBe(true)
    expect(document.querySelector('#cantidad-bingos').textContent).toBe(
      '2 bingos'
    )

    listController.destroy()
  })

  it('shows no-results state when all bingos are cancelled and filter hides them', async () => {
    const onlyCancelled = [sampleBingos[1]]
    let showCancelled = false

    const listController = createListController({
      load: async () => onlyCancelled,
      render: () => {},
      searchInput: '#buscar-bingos',
      countElement: '#cantidad-bingos',
      loadingElement: '#estado-cargando-bingo',
      errorElement: '#estado-error-bingo',
      emptyElement: '#estado-vacio-bingo',
      tableElement: '#tabla-wrapper-bingo',
      createButtons: ['#btn-primer-bingo'],
      filter: (bingo) => showCancelled || !Boolean(bingo.cancelled),
      singular: 'bingo',
      plural: 'bingos'
    })

    await listController.initialize()

    expect(
      document
        .querySelector('#estado-vacio-bingo')
        .classList.contains('oculto')
    ).toBe(false)
    expect(
      document
        .querySelector('#tabla-wrapper-bingo')
        .classList.contains('oculto')
    ).toBe(true)
    expect(
      document
        .querySelector('#btn-primer-bingo')
        .classList.contains('oculto')
    ).toBe(true)
    expect(document.querySelector('#cantidad-bingos').textContent).toBe(
      '0 de 1 bingos'
    )

    listController.destroy()
  })
})
