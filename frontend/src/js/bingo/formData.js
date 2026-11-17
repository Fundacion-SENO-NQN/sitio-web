import { QUOTE_COUNT } from '../common/quotes.js'

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
  late_payment_notice = undefined
} = {}) {
  const validatedNroBingo = validateBingoNumber(nroBingo ?? nro_bingo)
  const cleanName = cleanRequiredText(name, 'El nombre es requerido.')
  const cleanLastName = cleanRequiredText(
    lastName ?? last_name,
    'El apellido es requerido.'
  )
  const cleanPhone = cleanRequiredText(phone, 'El teléfono es requerido.')
  const cleanAddress = cleanRequiredText(address, 'La dirección es requerida.')
  const cleanNeighborhood = cleanRequiredText(
    neighborhood,
    'El barrio es requerido.'
  )
  const cleanLocality = cleanRequiredText(
    locality,
    'La localidad es requerida.'
  )
  const cleanCollectionLocate = cleanRequiredText(
    collectionLocate ?? collection_locate,
    'El lugar de cobro es requerido.'
  )
  const cleanCollectionDate = cleanRequiredText(
    collectionDate ?? collection_date,
    'La fecha de cobro es requerida.'
  )
  const validatedStartMonth = validateStartMonth(startMonth ?? start_month)
  const validatedQuote = validateQuotesBitmask(quote)
  const validatedNotice = validateLatePaymentNotice(
    latePaymentNotice ?? late_payment_notice ?? 0
  )

  const formData = new FormData()

  formData.append('nro_bingo', String(validatedNroBingo))
  formData.append('name', cleanName)
  formData.append('last_name', cleanLastName)
  formData.append('phone', cleanPhone)
  formData.append('address', cleanAddress)
  formData.append('neighborhood', cleanNeighborhood)
  formData.append('locality', cleanLocality)
  formData.append('collection_locate', cleanCollectionLocate)
  formData.append('collection_date', cleanCollectionDate)
  formData.append('start_month', String(validatedStartMonth))
  formData.append('quote', String(validatedQuote))
  formData.append('late_payment_notice', String(validatedNotice))

  return formData
}

/* ==========================================================
   VALIDATORS
========================================================== */

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

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    throw new Error('El mes de inicio debe estar entre 1 y 12.')
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

  const bits = parsed & 0xffff

  for (let index = 0; index < QUOTE_COUNT; index++) {
    const state = (bits >> (index * 2)) & 0b11

    if (state === 0b11) {
      throw new Error('El estado de una de las cuotas no es válido.')
    }
  }

  return bits
}

function cleanRequiredText(value, errorMessage) {
  const cleaned = String(value ?? '').trim()

  if (!cleaned) {
    throw new Error(errorMessage)
  }

  return cleaned
}
