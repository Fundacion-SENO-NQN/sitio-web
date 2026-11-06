import {
  MONTH_NAMES,
  MONTH_OPTIONS,
  QUOTE_COUNT,
  QUOTE_STATE,
  getMonthName
} from '../common/quotes.js'

export { MONTH_NAMES, MONTH_OPTIONS, QUOTE_COUNT, QUOTE_STATE, getMonthName }

/* ==========================================================
   AUTOMATIC LATE PAYMENT NOTICE (WHATSAPP)

   Backend stores `late_payment_notice` as `i16`:
   - 0      -> "Nunca"
   - 1..28  -> "1" .. "28" (day of the month)
   - 29     -> "Antepenúltimo día"
   - 30     -> "Penúltimo día"
   - 31     -> "Último día"
========================================================== */

export const LATE_PAYMENT_NOTICE_SPECIAL_LABELS = Object.freeze({
  0: 'Nunca',
  29: 'Antepenúltimo día',
  30: 'Penúltimo día',
  31: 'Último día'
})

export const LATE_PAYMENT_NOTICE_OPTIONS = Object.freeze([
  { value: 0, label: 'Nunca' },
  ...Array.from({ length: 28 }, (_, index) => {
    const day = index + 1
    return {
      value: day,
      label: String(day)
    }
  }),
  { value: 29, label: 'Antepenúltimo día' },
  { value: 30, label: 'Penúltimo día' },
  { value: 31, label: 'Último día' }
])

export function formatLatePaymentNotice(value) {
  const numeric = Number(value)

  if (!Number.isInteger(numeric) || numeric <= 0) {
    return LATE_PAYMENT_NOTICE_SPECIAL_LABELS[0]
  }

  if (Object.hasOwn(LATE_PAYMENT_NOTICE_SPECIAL_LABELS, numeric)) {
    return LATE_PAYMENT_NOTICE_SPECIAL_LABELS[numeric]
  }

  if (numeric >= 1 && numeric <= 28) {
    return `Día ${numeric}`
  }

  return String(numeric)
}
