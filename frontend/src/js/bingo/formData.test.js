import { describe, expect, it } from 'vitest'
import {
  LATE_PAYMENT_NOTICE_OPTIONS,
  formatLatePaymentNotice
} from './constants.js'
import { buildBingoFormData } from './formData.js'

const validInput = {
  nroBingo: '42',
  name: '  María  ',
  lastName: '  González ',
  phone: ' 299 412-3456 ',
  address: ' Av. Argentina 450 ',
  neighborhood: ' Centro ',
  locality: ' Neuquén Capital ',
  collectionLocate: ' Domicilio ',
  collectionDate: ' Del 1 al 10 ',
  startMonth: '3',
  quote: 25,
  latePaymentNotice: '31'
}

describe('buildBingoFormData', () => {
  it('builds valid trimmed multipart FormData with all backend fields', () => {
    const formData = buildBingoFormData(validInput)

    expect(formData.get('nro_bingo')).toBe('42')
    expect(formData.get('name')).toBe('María')
    expect(formData.get('last_name')).toBe('González')
    expect(formData.get('phone')).toBe('299 412-3456')
    expect(formData.get('address')).toBe('Av. Argentina 450')
    expect(formData.get('neighborhood')).toBe('Centro')
    expect(formData.get('locality')).toBe('Neuquén Capital')
    expect(formData.get('collection_locate')).toBe('Domicilio')
    expect(formData.get('collection_date')).toBe('Del 1 al 10')
    expect(formData.get('start_month')).toBe('3')
    expect(formData.get('quote')).toBe('25')
    expect(formData.get('late_payment_notice')).toBe('31')
  })

  it('rejects negative or missing nro_bingo', () => {
    expect(() => buildBingoFormData({ ...validInput, nroBingo: '-1' })).toThrow(
      'número de bingo'
    )
    expect(() => buildBingoFormData({ ...validInput, nroBingo: '' })).toThrow(
      'número de bingo'
    )
  })

  it('rejects missing required text fields', () => {
    expect(() => buildBingoFormData({ ...validInput, name: '   ' })).toThrow(
      'nombre'
    )
    expect(() => buildBingoFormData({ ...validInput, address: '' })).toThrow(
      'dirección'
    )
  })

  it('rejects invalid start_month values outside 1..12', () => {
    expect(() => buildBingoFormData({ ...validInput, startMonth: 0 })).toThrow(
      'mes de inicio'
    )
    expect(() => buildBingoFormData({ ...validInput, startMonth: 13 })).toThrow(
      'mes de inicio'
    )
  })

  it('rejects invalid quote bitmasks (0b11 state or out of 2-byte range)', () => {
    expect(() => buildBingoFormData({ ...validInput, quote: 3 })).toThrow(
      'cuotas'
    )
    expect(() => buildBingoFormData({ ...validInput, quote: 27 })).toThrow(
      'cuotas'
    )
    expect(() => buildBingoFormData({ ...validInput, quote: 70000 })).toThrow(
      'cuotas'
    )
  })

  it('rejects invalid late_payment_notice outside 0..31', () => {
    expect(() =>
      buildBingoFormData({ ...validInput, latePaymentNotice: -1 })
    ).toThrow('aviso automático')
    expect(() =>
      buildBingoFormData({ ...validInput, latePaymentNotice: 32 })
    ).toThrow('aviso automático')
  })
})

describe('formatLatePaymentNotice & LATE_PAYMENT_NOTICE_OPTIONS', () => {
  it('exposes friendly labels without raw special codes', () => {
    expect(LATE_PAYMENT_NOTICE_OPTIONS).toHaveLength(32)
    expect(formatLatePaymentNotice(0)).toBe('Nunca')
    expect(formatLatePaymentNotice(1)).toBe('Día 1')
    expect(formatLatePaymentNotice(15)).toBe('Día 15')
    expect(formatLatePaymentNotice(28)).toBe('Día 28')
    expect(formatLatePaymentNotice(29)).toBe('Antepenúltimo día')
    expect(formatLatePaymentNotice(30)).toBe('Penúltimo día')
    expect(formatLatePaymentNotice(31)).toBe('Último día')
  })
})
