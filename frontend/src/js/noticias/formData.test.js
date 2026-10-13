import { describe, it, expect } from 'vitest'
import { validateNewsImage } from './formData.js'

describe('validateNewsImage', () => {
  it('returns the image if it is a valid File (jpg, < 12 MB)', () => {
    const file = new File(['mock content'], 'test.jpg', { type: 'image/jpeg' })
    expect(validateNewsImage(file)).toBe(file)
  })

  it('returns the image if it is a valid File (png, < 12 MB)', () => {
    const file = new File(['mock content'], 'test.png', { type: 'image/png' })
    expect(validateNewsImage(file)).toBe(file)
  })

  it('returns the image if it is a valid File (avif, empty mime-type)', () => {
    // Simulating some browsers that do not assign a mime type to .avif files
    const file = new File(['mock content'], 'test.avif', { type: '' })
    expect(validateNewsImage(file)).toBe(file)
  })

  it('throws TypeError if the image is not a File instance', () => {
    const notFiles = [
      null,
      undefined,
      'string',
      123,
      {},
      { name: 'test.jpg', size: 1000, type: 'image/jpeg' }
    ]

    for (const notFile of notFiles) {
      expect(() => validateNewsImage(notFile)).toThrowError(
        new TypeError('Una de las imágenes no es un archivo válido.')
      )
    }
  })

  it('throws Error if the image size is 0', () => {
    const emptyFile = new File([], 'empty.jpg', { type: 'image/jpeg' })
    expect(() => validateNewsImage(emptyFile)).toThrowError(
      new Error('La imagen “empty.jpg” está vacía.')
    )
  })

  it('throws Error if the image exceeds the maximum size (12 MB)', () => {
    // 12 MB + 1 byte
    const largeSize = 12 * 1024 * 1024 + 1

    // We cannot easily create a 12MB string in memory just to construct a File,
    // so we mock the size property using Object.defineProperty
    const largeFile = new File(['content'], 'large.jpg', { type: 'image/jpeg' })
    Object.defineProperty(largeFile, 'size', { value: largeSize })

    expect(() => validateNewsImage(largeFile)).toThrowError(
      new Error('La imagen “large.jpg” supera el límite de 12 MB.')
    )
  })

  it('throws Error if the image format is not valid (invalid extension)', () => {
    const invalidFormatFile = new File(['mock content'], 'test.txt', { type: 'text/plain' })

    expect(() => validateNewsImage(invalidFormatFile)).toThrowError(
      new Error('La imagen “test.txt” debe ser JPG, PNG, WebP o AVIF.')
    )
  })
})
