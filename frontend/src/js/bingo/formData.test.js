import { describe, expect, it } from 'vitest'
import {
  LATE_PAYMENT_NOTICE_OPTIONS,
  formatLatePaymentNotice
} from './constants.js'
import { buildBingoFormData, findDuplicateBingoNumber } from './formData.js'

const validInput = {
  nroBingo: '42',
  name: '  María  ',
  lastName: '  González ',
  seller: '  Nancy  ',
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
    expect(formData.get('seller')).toBe('Nancy')
    expect(formData.get('phone')).toBe('299 412-3456')
    expect(formData.get('address')).toBe('Av. Argentina 450')
    expect(formData.get('neighborhood')).toBe('Centro')
    expect(formData.get('locality')).toBe('Neuquén Capital')
    expect(formData.get('collection_locate')).toBe('Domicilio')
    expect(formData.get('collection_date')).toBe('Del 1 al 10')
    expect(formData.get('start_month')).toBe('3')
    expect(formData.get('quote')).toBe('25')
    expect(formData.get('late_payment_notice')).toBe('31')
    expect(formData.get('cancelled')).toBe('false')
  })

  it('serializes cancelled flag as true or false and rejects invalid values', () => {
    expect(
      buildBingoFormData({ ...validInput, cancelled: true }).get('cancelled')
    ).toBe('true')
    expect(
      buildBingoFormData({ ...validInput, cancelled: false }).get('cancelled')
    ).toBe('false')
    expect(
      buildBingoFormData({ ...validInput, cancelled: 'true' }).get('cancelled')
    ).toBe('true')
    expect(
      buildBingoFormData({ ...validInput, cancelled: undefined }).get(
        'cancelled'
      )
    ).toBe('false')
    expect(() =>
      buildBingoFormData({ ...validInput, cancelled: 'invalid' })
    ).toThrow('cancelación')
  })

  it('accepts optional or omitted seller, address, neighborhood, locality, collectionLocate and collectionDate', () => {
    const formDataWithOptionalsEmpty = buildBingoFormData({
      ...validInput,
      seller: undefined,
      address: '',
      neighborhood: '   ',
      locality: undefined,
      collectionLocate: '',
      collectionDate: undefined
    })

    expect(formDataWithOptionalsEmpty.get('seller')).toBe('')
    expect(formDataWithOptionalsEmpty.get('address')).toBe('')
    expect(formDataWithOptionalsEmpty.get('neighborhood')).toBe('')
    expect(formDataWithOptionalsEmpty.get('locality')).toBe('')
    expect(formDataWithOptionalsEmpty.get('collection_locate')).toBe('')
    expect(formDataWithOptionalsEmpty.get('collection_date')).toBe('')
  })

  it('rejects negative or missing nro_bingo', () => {
    expect(() => buildBingoFormData({ ...validInput, nroBingo: '-1' })).toThrow(
      'número de bingo'
    )
    expect(() => buildBingoFormData({ ...validInput, nroBingo: '' })).toThrow(
      'número de bingo'
    )
  })

  it('rejects missing required text fields (name, lastName, phone)', () => {
    expect(() => buildBingoFormData({ ...validInput, name: '   ' })).toThrow(
      'nombre'
    )
    expect(() =>
      buildBingoFormData({ ...validInput, lastName: '   ' })
    ).toThrow('apellido')
    expect(() => buildBingoFormData({ ...validInput, phone: '' })).toThrow(
      'teléfono'
    )
  })

  it('accepts start_month values for 2026 (1..12) and up to April 2027 (13..16)', () => {
    const formData2027 = buildBingoFormData({ ...validInput, startMonth: '13' })
    expect(formData2027.get('start_month')).toBe('13')

    const formDataApr2027 = buildBingoFormData({
      ...validInput,
      startMonth: '16'
    })
    expect(formDataApr2027.get('start_month')).toBe('16')
  })

  it('rejects invalid start_month values outside 1..16', () => {
    expect(() => buildBingoFormData({ ...validInput, startMonth: 0 })).toThrow(
      'mes de inicio'
    )
    expect(() => buildBingoFormData({ ...validInput, startMonth: 17 })).toThrow(
      'mes de inicio'
    )
  })

  it('accepts quote bitmasks with 0b11 unknown payment method state and rejects out of 2-byte range', () => {
    const formDataWithUnknown = buildBingoFormData({ ...validInput, quote: 3 })
    expect(formDataWithUnknown.get('quote')).toBe('3')

    const formDataWithMixedUnknown = buildBingoFormData({
      ...validInput,
      quote: 27
    })
    expect(formDataWithMixedUnknown.get('quote')).toBe('27')

    expect(() => buildBingoFormData({ ...validInput, quote: 70000 })).toThrow(
      'cuotas'
    )
  })

  it('detects duplicate nro_bingo in create mode and ignores self in edit mode', () => {
    const existingBingos = [
      { id: 10, nro_bingo: 104, name: 'María', last_name: 'González' },
      { id: 11, nro_bingo: 205, name: 'Carlos', last_name: 'Pérez' }
    ]

    // Create mode: 104 is taken
    expect(findDuplicateBingoNumber('104', existingBingos)).toEqual(
      existingBingos[0]
    )
    // Create mode: 999 is free
    expect(findDuplicateBingoNumber('999', existingBingos)).toBeNull()

    // Edit mode for id=10: 104 is its own number -> not a duplicate
    expect(findDuplicateBingoNumber('104', existingBingos, 10)).toBeNull()
    // Edit mode for id=10: 205 belongs to id=11 -> duplicate!
    expect(findDuplicateBingoNumber('205', existingBingos, 10)).toEqual(
      existingBingos[1]
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
