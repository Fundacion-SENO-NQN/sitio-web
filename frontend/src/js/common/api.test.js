import { describe, it, expect } from 'vitest'
import { parseResponse } from './api.js'

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
