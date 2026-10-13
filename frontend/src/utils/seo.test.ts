import { describe, it, expect } from 'vitest'
import { plainText } from './seo'

describe('plainText', () => {
  it('returns empty string for null, undefined, or empty string', () => {
    expect(plainText(null)).toBe('')
    expect(plainText(undefined)).toBe('')
    expect(plainText('')).toBe('')
  })

  it('returns the same string if no html or extra spaces', () => {
    expect(plainText('hello world')).toBe('hello world')
  })

  it('strips html tags and replaces them with spaces', () => {
    expect(plainText('<p>Hello <b>world</b></p>')).toBe('Hello world')
  })

  it('replaces multiple spaces and newlines with a single space', () => {
    expect(plainText('hello    world\n\n\n!')).toBe('hello world !')
  })

  it('trims leading and trailing spaces', () => {
    expect(plainText('  hello world  ')).toBe('hello world')
  })

  it('handles complex cases with html, newlines, and spaces', () => {
    expect(plainText('\n  <div class="test">\n    <h1>Title</h1>\n    <p>Some   text</p>\n  </div>\n')).toBe('Title Some text')
  })
})
