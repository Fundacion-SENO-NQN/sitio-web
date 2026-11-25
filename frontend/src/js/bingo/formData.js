import { MAX_START_MONTH, QUOTE_COUNT } from '../common/quotes.js'

/* ==========================================================
   BINGO FORM DATA BUILDER & VALIDATOR

   Builds a multipart FormData payload matching
   backend/src/handlers/bingo.rs (`create_bingo` & `patch_bingo`).
========================================================== */

export function buildBingoFormData({
  nroBingo = undefined,
  nro_bingo = undefined,
  name,
  lastName = undefined,
  last_name = undefined,
  seller = undefined,
  phone,
  address,
  neighborhood,
  locality,
  collectionLocate = undefined,
  collection_locate = undefined,
  collectionDate = undefined,
  collection_date = undefined,
  startMonth = undefined,
  start_month = undefined,
  quote = 0,
  latePaymentNotice = undefined,
  late_payment_notice = undefined,
  cancelled = false
} = {}) {
  const validatedNroBingo = validateBingoNumber(nroBingo ?? nro_bingo)
  const cleanName = cleanRequiredText(name, 'El nombre es requerido.')
  const cleanLastName = cleanRequiredText(
    lastName ?? last_name,
    'El apellido es requerido.'
  )
  const cleanSeller = cleanOptionalText(seller)
  const cleanPhone = cleanRequiredText(phone, 'El teléfono es requerido.')
  const cleanAddress = cleanOptionalText(address)
  const cleanNeighborhood = cleanOptionalText(neighborhood)
  const cleanLocality = cleanOptionalText(locality)
  const cleanCollectionLocate = cleanOptionalText(
    collectionLocate ?? collection_locate
  )
  const cleanCollectionDate = cleanOptionalText(
    collectionDate ?? collection_date
  )
  const validatedStartMonth = validateStartMonth(startMonth ?? start_month)
  const validatedQuote = validateQuotesBitmask(quote)
  const validatedNotice = validateLatePaymentNotice(
    latePaymentNotice ?? late_payment_notice ?? 0
  )
  const validatedCancelled = validateCancelled(cancelled)

  const formData = new FormData()

  formData.append('nro_bingo', String(validatedNroBingo))
  formData.append('name', cleanName)
  formData.append('last_name', cleanLastName)
  formData.append('seller', cleanSeller)
  formData.append('phone', cleanPhone)
  formData.append('address', cleanAddress)
  formData.append('neighborhood', cleanNeighborhood)
  formData.append('locality', cleanLocality)
  formData.append('collection_locate', cleanCollectionLocate)
  formData.append('collection_date', cleanCollectionDate)
  formData.append('start_month', String(validatedStartMonth))
  formData.append('quote', String(validatedQuote))
  formData.append('late_payment_notice', String(validatedNotice))
  formData.append('cancelled', String(validatedCancelled))

  return formData
}

/* ==========================================================
   VALIDATORS
========================================================== */

export function findDuplicateBingoNumber(
  rawValue,
  bingos = [],
  currentBingoId = null
) {
  const cleaned = String(rawValue ?? '').trim()
  if (!cleaned) return null

  const parsed = Number(cleaned)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 32767) {
    return null
  }

  if (!Array.isArray(bingos)) return null

  const hasCurrentId =
    currentBingoId !== null &&
    currentBingoId !== undefined &&
    String(currentBingoId).trim() !== ''
  const normalizedCurrentId = hasCurrentId ? Number(currentBingoId) : null

  return (
    bingos.find((item) => {
      if (!item || typeof item !== 'object') return false
      if (
        normalizedCurrentId !== null &&
        Number(item.id) === normalizedCurrentId
      ) {
        return false
      }
      return Number(item.nro_bingo) === parsed
    }) ?? null
  )
}

export function validateBingoNumber(rawValue) {
  const cleaned = String(rawValue ?? '').trim()

  if (!cleaned) {
    throw new Error('El número de bingo es requerido.')
  }

  const parsed = Number(cleaned)

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 32767) {
    throw new Error('El número de bingo debe ser un entero mayor o igual a 0.')
  }

  return parsed
}

export function validateStartMonth(rawValue) {
  const parsed = Number(String(rawValue ?? '').trim())

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_START_MONTH) {
    throw new Error(
      `El mes de inicio debe estar entre 1 y ${MAX_START_MONTH}.`
    )
  }

  return parsed
}

export function validateLatePaymentNotice(rawValue) {
  const cleaned = String(rawValue ?? '0').trim()
  const parsed = Number(cleaned === '' ? '0' : cleaned)

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 31) {
    throw new Error('El aviso automático seleccionado no es válido.')
  }

  return parsed
}

export function validateQuotesBitmask(rawValue) {
  const parsed = Number(String(rawValue ?? '0').trim())

  if (!Number.isInteger(parsed) || parsed < -32768 || parsed > 65535) {
    throw new Error('El valor de las cuotas no es válido.')
  }

  return parsed & 0xffff
}

export function validateCancelled(rawValue) {
  if (typeof rawValue === 'boolean') return rawValue
  if (rawValue === null || rawValue === undefined) return false

  const normalized = String(rawValue).trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0' || normalized === '') {
    return false
  }

  throw new Error('El estado de cancelación no es válido.')
}

function cleanRequiredText(value, errorMessage) {
  const cleaned = String(value ?? '').trim()

  if (!cleaned) {
    throw new Error(errorMessage)
  }

  return cleaned
}

function cleanOptionalText(value) {
  return String(value ?? '').trim()
}
