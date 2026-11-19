// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  MONTH_OPTIONS,
  QUOTE_STATE,
  compareQuotesProgress,
  createQuotesEditorController,
  createQuotesSquaresElement,
  decodeQuotes,
  encodeQuotes,
  getAvailableStartMonthOptions,
  getDefaultStartMonth,
  getMonthName,
  getQuoteMonthName,
  getQuoteMonthNumber,
  getQuoteVisualInfo,
  getQuotesSummary,
  isQuoteLate
} from './quotes.js'

describe('decodeQuotes & encodeQuotes', () => {
  it('decodes 0 into 8 unpaid quotes', () => {
    expect(decodeQuotes(0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('matches backend example 25 (cash, transfer, cash, then unpaid)', () => {
    const states = [1, 2, 1, 0, 0, 0, 0, 0]
    expect(encodeQuotes(states)).toBe(25)
    expect(decodeQuotes(25)).toEqual(states)
  })

  it('encodes and decodes all 8 cash quotes (21845)', () => {
    const allCash = Array(8).fill(QUOTE_STATE.CASH)
    expect(encodeQuotes(allCash)).toBe(21845)
    expect(decodeQuotes(21845)).toEqual(allCash)
  })

  it('handles negative signed i16 (-21846) from backend for 8 bank transfers', () => {
    const allTransfer = Array(8).fill(QUOTE_STATE.TRANSFER)
    expect(encodeQuotes(allTransfer)).toBe(43690)
    expect(decodeQuotes(43690)).toEqual(allTransfer)
    expect(decodeQuotes(-21846)).toEqual(allTransfer)
  })

  it('encodes and decodes unknown payment method state 0b11 (3 -> "?")', () => {
    const states = [3, 1, 2, 0, 3, 0, 0, 0]
    const encoded = encodeQuotes(states)
    expect(decodeQuotes(encoded)).toEqual(states)

    const allUnknown = Array(8).fill(QUOTE_STATE.UNKNOWN)
    expect(encodeQuotes(allUnknown)).toBe(65535)
    expect(decodeQuotes(65535)).toEqual(allUnknown)
    expect(decodeQuotes(-1)).toEqual(allUnknown)
  })

  it('rejects invalid state values during encoding', () => {
    expect(() => encodeQuotes([4, 0, 0, 0, 0, 0, 0, 0])).toThrow()
    expect(() => encodeQuotes([-1, 0, 0, 0, 0, 0, 0, 0])).toThrow()
    expect(() => encodeQuotes([0, 0, 0])).toThrow()
  })
})

describe('quote months & late detection', () => {
  it('computes month numbers and names wrapping across December -> January for 2026 and up to April 2027', () => {
    expect(MONTH_OPTIONS).toHaveLength(16)
    expect(MONTH_OPTIONS[0]).toEqual({ value: 1, label: 'Enero 2026' })
    expect(MONTH_OPTIONS[11]).toEqual({ value: 12, label: 'Diciembre 2026' })
    expect(MONTH_OPTIONS[12]).toEqual({ value: 13, label: 'Enero 2027' })
    expect(MONTH_OPTIONS[15]).toEqual({ value: 16, label: 'Abril 2027' })

    expect(getMonthName(3)).toBe('Marzo 2026')
    expect(getMonthName(13)).toBe('Enero 2027')
    expect(getMonthName(16)).toBe('Abril 2027')
    expect(getMonthName(17)).toBe('')

    expect(getDefaultStartMonth(new Date(2026, 10, 19))).toBe(11)
    expect(getDefaultStartMonth(new Date(2027, 0, 10))).toBe(13)
    expect(getDefaultStartMonth(new Date(2027, 6, 10))).toBe(16)

    // Creating a new bingo in Nov 2026 shows only Enero 2026 .. Noviembre 2026 (1..11)
    const createOptionsNov2026 = getAvailableStartMonthOptions({
      editing: false,
      now: new Date(2026, 10, 19)
    })
    expect(createOptionsNov2026).toHaveLength(11)
    expect(createOptionsNov2026[0]).toEqual({ value: 1, label: 'Enero 2026' })
    expect(createOptionsNov2026[10]).toEqual({
      value: 11,
      label: 'Noviembre 2026'
    })

    // Editing shows all months (1..16, Enero 2026 .. Abril 2027)
    const editOptions = getAvailableStartMonthOptions({
      editing: true,
      now: new Date(2026, 10, 19)
    })
    expect(editOptions).toHaveLength(16)
    expect(editOptions[15]).toEqual({ value: 16, label: 'Abril 2027' })

    expect(getQuoteMonthNumber(10, 0)).toBe(10)
    expect(getQuoteMonthName(10, 0)).toBe('Octubre')
    expect(getQuoteMonthNumber(10, 3)).toBe(1)
    expect(getQuoteMonthName(10, 3)).toBe('Enero')
    expect(getQuoteMonthNumber(13, 0)).toBe(1)
    expect(getQuoteMonthName(13, 0)).toBe('Enero')
    expect(getQuoteMonthNumber(13, 1)).toBe(2)
    expect(getQuoteMonthName(13, 1)).toBe('Febrero')
  })

  it('does not mark 2027 start_month (13..24) as late during 2026', () => {
    const nov2026 = new Date(2026, 10, 19)
    const feb2027 = new Date(2027, 1, 5)
    const createdAt = '2026-11-15T12:00:00Z'

    // Start month = 13 (January 2027)
    expect(
      isQuoteLate({
        startMonth: 13,
        quoteIndex: 0,
        createdAt,
        now: nov2026
      })
    ).toBe(false)

    // In Feb 2027, Quote 0 (Jan 2027) is late, Quote 1 (Feb 2027) is not
    expect(
      isQuoteLate({
        startMonth: 13,
        quoteIndex: 0,
        createdAt,
        now: feb2027
      })
    ).toBe(true)

    expect(
      isQuoteLate({
        startMonth: 13,
        quoteIndex: 1,
        createdAt,
        now: feb2027
      })
    ).toBe(false)
  })

  it('marks an unpaid quote as late only after its month has passed', () => {
    const april2026 = new Date(2026, 3, 10) // April 2026 (0-indexed month 3)
    const createdAt = '2026-03-01T12:00:00Z'

    // Start month = 3 (March):
    // Quote 0 -> March (past -> late)
    expect(
      isQuoteLate({
        startMonth: 3,
        quoteIndex: 0,
        createdAt,
        now: april2026
      })
    ).toBe(true)

    // Quote 1 -> April (current month -> still on time)
    expect(
      isQuoteLate({
        startMonth: 3,
        quoteIndex: 1,
        createdAt,
        now: april2026
      })
    ).toBe(false)

    // Quote 2 -> May (future month -> on time)
    expect(
      isQuoteLate({
        startMonth: 3,
        quoteIndex: 2,
        createdAt,
        now: april2026
      })
    ).toBe(false)
  })

  it('returns green paid status with E/T even if month already passed', () => {
    const june2026 = new Date(2026, 5, 15)
    const createdAt = '2026-03-01T12:00:00Z'

    const cashInfo = getQuoteVisualInfo({
      paymentState: QUOTE_STATE.CASH,
      startMonth: 3,
      quoteIndex: 0,
      createdAt,
      now: june2026
    })
    expect(cashInfo.status).toBe('paid')
    expect(cashInfo.shortLabel).toBe('E')

    const transferInfo = getQuoteVisualInfo({
      paymentState: QUOTE_STATE.TRANSFER,
      startMonth: 3,
      quoteIndex: 1,
      createdAt,
      now: june2026
    })
    expect(transferInfo.status).toBe('paid')
    expect(transferInfo.shortLabel).toBe('T')

    const unknownInfo = getQuoteVisualInfo({
      paymentState: QUOTE_STATE.UNKNOWN,
      startMonth: 3,
      quoteIndex: 2,
      createdAt,
      now: june2026
    })
    expect(unknownInfo.status).toBe('paid')
    expect(unknownInfo.shortLabel).toBe('?')
  })
})

describe('DOM rendering & editor controller', () => {
  it('renders 8 squares with paid, late, and pending classes', () => {
    const may2026 = new Date(2026, 4, 5) // May 2026
    // Start month = 3 (March):
    // Quote 0 (March) = Cash (paid -> green, E)
    // Quote 1 (April) = Unpaid (past -> late -> yellow)
    // Quote 2 (May)   = Unpaid (current -> pending -> gray)
    // Quote 3 (June)  = Transfer (paid -> green, T)
    const quoteBits = encodeQuotes([1, 0, 0, 2, 0, 0, 0, 0])

    const strip = createQuotesSquaresElement({
      quote: quoteBits,
      startMonth: 3,
      createdAt: '2026-03-01T00:00:00Z',
      now: may2026
    })

    const squares = strip.querySelectorAll('.cuotaSquare')
    expect(squares).toHaveLength(8)
    expect(squares[0].classList.contains('cuotaSquare--paid')).toBe(true)
    expect(squares[0].textContent).toBe('E')
    expect(squares[1].classList.contains('cuotaSquare--late')).toBe(true)
    expect(squares[1].textContent).toBe('')
    expect(squares[2].classList.contains('cuotaSquare--pending')).toBe(true)
    expect(squares[3].classList.contains('cuotaSquare--paid')).toBe(true)
    expect(squares[3].textContent).toBe('T')
  })

  it('cycles quote states when clicking squares in the editor controller', () => {
    document.body.innerHTML = `
      <select id="bingo-start_month">
        <option value="3" selected>Marzo</option>
      </select>
      <section data-cuotas-editor="bingo">
        ${Array.from(
          { length: 8 },
          (_, i) => `
            <div data-cuota-card="${i}">
              <button type="button" data-cuota-square="${i}"></button>
              <small data-cuota-month="${i}"></small>
              <select data-cuota-select="${i}">
                <option value="0">Sin pagar</option>
                <option value="1">Efectivo (E)</option>
                <option value="2">Transferencia (T)</option>
                <option value="3">Desconocido (?)</option>
              </select>
            </div>
          `
        ).join('')}
      </section>
    `

    const editor = createQuotesEditorController({
      container: '[data-cuotas-editor="bingo"]',
      startMonthInput: '#bingo-start_month',
      getNow: () => new Date(2026, 4, 5)
    }).initialize()

    const firstButton = document.querySelector('[data-cuota-square="0"]')
    firstButton.click() // 0 -> 1 (Cash)
    expect(editor.getStates()[0]).toBe(1)

    const secondButton = document.querySelector('[data-cuota-square="1"]')
    secondButton.click() // 0 -> 1 (Cash)
    secondButton.click() // 1 -> 2 (Transfer)
    expect(editor.getStates()[1]).toBe(2)

    const thirdButton = document.querySelector('[data-cuota-square="2"]')
    thirdButton.click() // 0 -> 1
    thirdButton.click() // 1 -> 2
    thirdButton.click() // 2 -> 3 (Unknown "?")
    expect(editor.getStates()[2]).toBe(3)
    expect(thirdButton.textContent).toBe('?')

    thirdButton.click() // 3 -> 0 (back to Unpaid)
    expect(editor.getStates()[2]).toBe(0)

    expect(editor.getValue()).toBe(encodeQuotes([1, 2, 0, 0, 0, 0, 0, 0]))
    editor.destroy()
  })

  it('summarizes paid and late counts and sorts by paid count then late count', () => {
    const may2026 = new Date(2026, 4, 5) // May 2026
    // Item A: 1 paid, 1 late (start month 3 = March)
    const itemA = {
      quote: encodeQuotes([1, 0, 0, 0, 0, 0, 0, 0]),
      start_month: 3
    }
    // Item B: 3 paid, 0 late
    const itemB = {
      quote: encodeQuotes([1, 2, 1, 0, 0, 0, 0, 0]),
      start_month: 3
    }
    // Item C: 1 paid, 0 late (start month 5 = May)
    const itemC = {
      quote: encodeQuotes([1, 0, 0, 0, 0, 0, 0, 0]),
      start_month: 5
    }

    expect(
      getQuotesSummary({
        quote: itemA.quote,
        startMonth: itemA.start_month,
        now: may2026
      })
    ).toEqual({
      paidCount: 1,
      lateCount: 1,
      pendingCount: 6,
      total: 8
    })

    // Fewer paid comes before more paid in ascending order
    expect(compareQuotesProgress(itemA, itemB, { now: may2026 })).toBeLessThan(0)
    // Equal paid (1), but itemA has 1 late while itemC has 0 late -> itemA comes before itemC
    expect(compareQuotesProgress(itemA, itemC, { now: may2026 })).toBeLessThan(0)
  })
})
