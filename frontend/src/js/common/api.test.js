import { describe, it, expect } from 'vitest'
import { parseResponse, validateId } from './api.js'

describe('parseResponse', () => {
  it('returns null for status 204 (No Content)', async () => {
    const response = new Response(null, { status: 204 })
    const result = await parseResponse(response)
    expect(result).toBeNull()
  })

  it('returns null for status 205 (Reset Content)', async () => {
    const response = new Response(null, { status: 205 })
    const result = await parseResponse(response)
    expect(result).toBeNull()
  })

  it('parses as JSON when Content-Type is application/json', async () => {
    const data = { id: 1, name: 'Test' }
    const response = new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
    const result = await parseResponse(response)
    expect(result).toEqual(data)
  })

  it('parses as JSON when Content-Type includes application/json with charset', async () => {
    const data = { success: true }
    const response = new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    })
    const result = await parseResponse(response)
    expect(result).toEqual(data)
  })

  it('returns text when Content-Type is not JSON', async () => {
    const textData = 'Hello world'
    const response = new Response(textData, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })
    const result = await parseResponse(response)
    expect(result).toBe(textData)
  })

  it('returns text when Content-Type is missing', async () => {
    const textData = 'Missing content type'
    const response = new Response(textData, {
      status: 200
    })
    // Ensure we actually don't have the header
    response.headers.delete('Content-Type')

    const result = await parseResponse(response)
    expect(result).toBe(textData)
  })

  it('returns null when text is empty and Content-Type is not JSON', async () => {
    const response = new Response('', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })
    const result = await parseResponse(response)
    expect(result).toBeNull()
  })
})

describe('validateId', () => {
  it('returns numeric id for positive integers', () => {
    expect(validateId(1)).toBe(1)
    expect(validateId(42)).toBe(42)
  })

  it('returns numeric id for strings representing positive integers', () => {
    expect(validateId('1')).toBe(1)
    expect(validateId('42')).toBe(42)
  })

  it('throws TypeError for 0', () => {
    expect(() => validateId(0)).toThrow(TypeError)
    expect(() => validateId(0)).toThrow('El id no es válido.')
  })

  it('throws TypeError for negative integers', () => {
    expect(() => validateId(-1)).toThrow(TypeError)
    expect(() => validateId('-1')).toThrow('El id no es válido.')
  })

  it('throws TypeError for non-integer numbers', () => {
    expect(() => validateId(1.5)).toThrow(TypeError)
    expect(() => validateId('1.5')).toThrow('El id no es válido.')
  })

  it('throws TypeError for non-numeric strings', () => {
    expect(() => validateId('abc')).toThrow(TypeError)
    expect(() => validateId('123a')).toThrow('El id no es válido.')
  })

  it('throws TypeError for null and undefined', () => {
    expect(() => validateId(null)).toThrow(TypeError)
    expect(() => validateId(undefined)).toThrow('El id no es válido.')
  })

  it('throws TypeError for objects and arrays', () => {
    expect(() => validateId({})).toThrow(TypeError)
    expect(() => validateId([])).toThrow('El id no es válido.')
    expect(() => validateId([1, 2])).toThrow('El id no es válido.')
  })
})
