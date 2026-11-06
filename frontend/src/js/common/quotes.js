import { createCustomColumn } from './table.js'
import { resolveElement } from './dom.js'

/* ==========================================================
   CONSTANTS
========================================================== */

export const QUOTE_COUNT = 8

export const QUOTE_STATE = Object.freeze({
  UNPAID: 0,
  CASH: 1,
  TRANSFER: 2
})

export const MONTH_NAMES = Object.freeze([
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
])

export const MONTH_OPTIONS = Object.freeze(
  MONTH_NAMES.map((label, index) => ({
    value: index + 1,
    label
  }))
)

/* ==========================================================
   BITMASK ENCODING / DECODING

   Each quote uses 2 bits in a 16-bit integer:
   - 00 (0): unpaid
   - 01 (1): paid with cash (E)
   - 10 (2): paid by bank transfer (T)
   - 11 (3): invalid
========================================================== */

export function decodeQuotes(rawQuote, count = QUOTE_COUNT) {
  const numeric = Number(rawQuote)
  const bits = Number.isFinite(numeric) ? numeric & 0xffff : 0

  const states = []

  for (let index = 0; index < count; index++) {
    const state = (bits >> (index * 2)) & 0b11

    states.push(state === 0b11 ? QUOTE_STATE.UNPAID : state)
  }

  return states
}

export function encodeQuotes(states, count = QUOTE_COUNT) {
  if (!Array.isArray(states) || states.length !== count) {
    throw new Error(`Deben especificarse exactamente ${count} cuotas.`)
  }

  let bits = 0

  for (let index = 0; index < count; index++) {
    const state = Number(states[index])

    if (
      !Number.isInteger(state) ||
      state < QUOTE_STATE.UNPAID ||
      state > QUOTE_STATE.TRANSFER
    ) {
      throw new Error('El estado de una de las cuotas no es válido.')
    }

    bits |= (state & 0b11) << (index * 2)
  }

  return bits
}

/* ==========================================================
   MONTHS & LATE QUOTE CALCULATION
========================================================== */

export function getMonthName(monthNumber) {
  const index = Number(monthNumber) - 1

  if (!Number.isInteger(index) || index < 0 || index >= MONTH_NAMES.length) {
    return ''
  }

  return MONTH_NAMES[index]
}

export function getQuoteMonthNumber(startMonth, quoteIndex) {
  const normalizedStart = Number(startMonth)
  const normalizedIndex = Number(quoteIndex)

  if (
    !Number.isInteger(normalizedStart) ||
    normalizedStart < 1 ||
    normalizedStart > 12 ||
    !Number.isInteger(normalizedIndex) ||
    normalizedIndex < 0
  ) {
    return null
  }

  return ((((normalizedStart - 1 + normalizedIndex) % 12) + 12) % 12) + 1
}

export function getQuoteMonthName(startMonth, quoteIndex) {
  const monthNumber = getQuoteMonthNumber(startMonth, quoteIndex)

  return monthNumber ? getMonthName(monthNumber) : ''
}

export function resolveStartYear({ createdAt = null, now = new Date() } = {}) {
  if (createdAt) {
    const parsed = createdAt instanceof Date ? createdAt : new Date(createdAt)

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getFullYear()
    }
  }

  return now.getFullYear()
}

/**
 * Determines whether a quote's month has already passed relative to `now`.
 * Example: if `startMonth` is 3 (March), quote 0 is March and becomes late
 * once April begins (`quoteTotalMonths < currentTotalMonths`).
 */
export function isQuoteLate({
  startMonth,
  quoteIndex,
  createdAt = null,
  now = new Date()
} = {}) {
  const normalizedStart = Number(startMonth)
  const normalizedIndex = Number(quoteIndex)

  if (
    !Number.isInteger(normalizedStart) ||
    normalizedStart < 1 ||
    normalizedStart > 12 ||
    !Number.isInteger(normalizedIndex) ||
    normalizedIndex < 0
  ) {
    return false
  }

  const referenceDate = now instanceof Date ? now : new Date(now)
  const startYear = resolveStartYear({ createdAt, now: referenceDate })

  const quoteTotalMonths =
    startYear * 12 + (normalizedStart - 1) + normalizedIndex

  const currentTotalMonths =
    referenceDate.getFullYear() * 12 + referenceDate.getMonth()

  return quoteTotalMonths < currentTotalMonths
}

export function getQuoteVisualInfo({
  paymentState,
  startMonth,
  quoteIndex,
  createdAt = null,
  now = new Date()
} = {}) {
  const quoteNumber = Number(quoteIndex) + 1
  const monthName = getQuoteMonthName(startMonth, quoteIndex)
  const monthSuffix = monthName ? ` (${monthName})` : ''

  if (paymentState === QUOTE_STATE.CASH) {
    return {
      status: 'paid',
      shortLabel: 'E',
      statusLabel: 'Pagada · Efectivo',
      monthName,
      tooltip: `Cuota ${quoteNumber}${monthSuffix}: Pagada · Efectivo`
    }
  }

  if (paymentState === QUOTE_STATE.TRANSFER) {
    return {
      status: 'paid',
      shortLabel: 'T',
      statusLabel: 'Pagada · Transferencia',
      monthName,
      tooltip: `Cuota ${quoteNumber}${monthSuffix}: Pagada · Transferencia`
    }
  }

  const late = isQuoteLate({
    startMonth,
    quoteIndex,
    createdAt,
    now
  })

  if (late) {
    return {
      status: 'late',
      shortLabel: '',
      statusLabel: 'Sin pagar · Fuera de término',
      monthName,
      tooltip: `Cuota ${quoteNumber}${monthSuffix}: Sin pagar · Fuera de término`
    }
  }

  return {
    status: 'pending',
    shortLabel: '',
    statusLabel: 'Sin pagar',
    monthName,
    tooltip: `Cuota ${quoteNumber}${monthSuffix}: Sin pagar`
  }
}

/* ==========================================================
   TABLE SQUARES RENDERER & COLUMN FACTORY
========================================================== */

export function createQuotesSquaresElement({
  quote = 0,
  startMonth = 1,
  createdAt = null,
  count = QUOTE_COUNT,
  now = new Date()
} = {}) {
  const states = decodeQuotes(quote, count)

  const container = document.createElement('div')
  container.className = 'cuotasSquares'
  container.setAttribute('role', 'group')

  const paidCount = states.filter((state) => state !== QUOTE_STATE.UNPAID).length
  container.setAttribute(
    'aria-label',
    `${paidCount} de ${count} cuotas pagadas`
  )

  states.forEach((paymentState, quoteIndex) => {
    const info = getQuoteVisualInfo({
      paymentState,
      startMonth,
      quoteIndex,
      createdAt,
      now
    })

    const square = document.createElement('span')
    square.className = `cuotaSquare cuotaSquare--${info.status}`
    square.textContent = info.shortLabel
    square.title = info.tooltip
    square.setAttribute('aria-label', info.tooltip)
    square.dataset.quoteIndex = String(quoteIndex)
    square.dataset.quoteStatus = info.status

    container.appendChild(square)
  })

  return container
}

export function createQuotesColumn({
  getQuote = (item) => item.quote,
  getStartMonth = (item) => item.start_month,
  getCreatedAt = (item) => item.created_at,
  count = QUOTE_COUNT,
  className = 'celda-cuotas',
  getNow = () => new Date()
} = {}) {
  return createCustomColumn({
    className,

    render(item) {
      return createQuotesSquaresElement({
        quote: getQuote(item),
        startMonth: getStartMonth(item),
        createdAt: getCreatedAt(item),
        count,
        now: getNow()
      })
    }
  })
}

/* ==========================================================
   MODAL EDITOR CONTROLLER

   Pairs with Plataforma/SelectorCuotas.astro
========================================================== */

export function createQuotesEditorController({
  container,
  startMonthInput = null,
  count = QUOTE_COUNT,
  getNow = () => new Date()
} = {}) {
  const root = resolveElement(container)

  if (!root) {
    throw new Error('No se encontró el editor de cuotas.')
  }

  const monthSelect = resolveElement(startMonthInput)

  const cards = [...root.querySelectorAll('[data-cuota-card]')]
  const squares = [...root.querySelectorAll('[data-cuota-square]')]
  const selects = [...root.querySelectorAll('[data-cuota-select]')]
  const monthLabels = [...root.querySelectorAll('[data-cuota-month]')]

  let states = Array(count).fill(QUOTE_STATE.UNPAID)
  let currentStartMonth = Number(monthSelect?.value) || 1
  let currentCreatedAt = null
  let eventController = null

  function initialize() {
    if (eventController) return controller

    eventController = new AbortController()
    const { signal } = eventController

    selects.forEach((select, index) => {
      select.addEventListener(
        'change',
        () => {
          states[index] = normalizeSingleState(select.value)
          refreshVisuals()
        },
        { signal }
      )
    })

    squares.forEach((square, index) => {
      square.addEventListener(
        'click',
        () => {
          states[index] = (states[index] + 1) % 3
          if (selects[index]) {
            selects[index].value = String(states[index])
          }
          refreshVisuals()
        },
        { signal }
      )
    })

    monthSelect?.addEventListener(
      'change',
      () => {
        currentStartMonth = Number(monthSelect.value) || 1
        refreshVisuals()
      },
      { signal }
    )

    refreshVisuals()

    return controller
  }

  function destroy() {
    eventController?.abort()
    eventController = null
  }

  function refreshVisuals() {
    const now = getNow()

    for (let index = 0; index < count; index++) {
      const paymentState = states[index] ?? QUOTE_STATE.UNPAID

      if (selects[index] && selects[index].value !== String(paymentState)) {
        selects[index].value = String(paymentState)
      }

      const info = getQuoteVisualInfo({
        paymentState,
        startMonth: currentStartMonth,
        quoteIndex: index,
        createdAt: currentCreatedAt,
        now
      })

      const square = squares[index]
      if (square) {
        square.classList.remove(
          'cuotaSquare--paid',
          'cuotaSquare--pending',
          'cuotaSquare--late'
        )
        square.classList.add(`cuotaSquare--${info.status}`)
        square.textContent = info.shortLabel
        square.title = `${info.tooltip} (clic para cambiar)`
        square.setAttribute('aria-label', `${info.tooltip}. Clic para cambiar`)
      }

      const monthLabel = monthLabels[index]
      if (monthLabel) {
        monthLabel.textContent = info.monthName || `Mes ${index + 1}`
      }

      const card = cards[index]
      if (card) {
        card.dataset.status = info.status
      }
    }
  }

  function setValue(rawQuote, { startMonth = null, createdAt = null } = {}) {
    states = decodeQuotes(rawQuote, count)

    if (startMonth !== null && startMonth !== undefined) {
      currentStartMonth = Number(startMonth) || 1
    } else if (monthSelect) {
      currentStartMonth = Number(monthSelect.value) || 1
    }

    currentCreatedAt = createdAt
    refreshVisuals()
  }

  function setStartMonth(startMonth, { createdAt = undefined } = {}) {
    currentStartMonth = Number(startMonth) || 1
    if (createdAt !== undefined) {
      currentCreatedAt = createdAt
    }
    refreshVisuals()
  }

  function reset({ startMonth = null } = {}) {
    states = Array(count).fill(QUOTE_STATE.UNPAID)
    currentCreatedAt = null
    currentStartMonth =
      startMonth !== null && startMonth !== undefined
        ? Number(startMonth) || 1
        : Number(monthSelect?.value) || 1
    refreshVisuals()
  }

  function setDisabled(disabled) {
    const flag = Boolean(disabled)
    squares.forEach((square) => {
      square.disabled = flag
    })
    selects.forEach((select) => {
      select.disabled = flag
    })
  }

  function getValue() {
    return encodeQuotes(states, count)
  }

  function getStates() {
    return [...states]
  }

  const controller = {
    initialize,
    destroy,
    getValue,
    getStates,
    setValue,
    setStartMonth,
    reset,
    setDisabled,
    refreshVisuals
  }

  return controller
}

function normalizeSingleState(value) {
  const numeric = Number(value)

  if (numeric === QUOTE_STATE.CASH || numeric === QUOTE_STATE.TRANSFER) {
    return numeric
  }

  return QUOTE_STATE.UNPAID
}
