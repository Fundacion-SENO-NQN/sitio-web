// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  QUOTE_STATE,
  createQuotesEditorController,
  createQuotesSquaresElement,
  decodeQuotes,
  encodeQuotes,
  getQuoteMonthName,
  getQuoteMonthNumber,
  getQuoteVisualInfo,
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

  it('rejects invalid state values during encoding', () => {
    expect(() => encodeQuotes([3, 0, 0, 0, 0, 0, 0, 0])).toThrow()
    expect(() => encodeQuotes([0, 0, 0])).toThrow()
  })
})

describe('quote months & late detection', () => {
  it('computes month numbers and names wrapping across December -> January', () => {
    expect(getQuoteMonthNumber(10, 0)).toBe(10)
    expect(getQuoteMonthName(10, 0)).toBe('Octubre')
    expect(getQuoteMonthNumber(10, 3)).toBe(1)
    expect(getQuoteMonthName(10, 3)).toBe('Enero')
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
    secondButton.click() // 0 -> 1
    secondButton.click() // 1 -> 2 (Transfer)
    expect(editor.getStates()[1]).toBe(2)

    expect(editor.getValue()).toBe(encodeQuotes([1, 2, 0, 0, 0, 0, 0, 0]))
    editor.destroy()
  })
})
