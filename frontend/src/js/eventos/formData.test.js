import { describe, it, expect } from 'vitest'
import { validateEventImages } from './formData.js'

describe('validateEventImages', () => {
  it('does not throw if images are valid Files and returns the array', () => {
    const file1 = new File(['mock content'], 'test1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['mock content'], 'test2.png', { type: 'image/png' })
    const images = [file1, file2]
    expect(() => validateEventImages(images)).not.toThrow()
    expect(validateEventImages(images)).toBe(images)
  })

  it('throws Error if images is not an array or is empty', () => {
    const notArraysOrEmpty = [
      null,
      undefined,
      'string',
      123,
      {},
      new File(['content'], 'test.jpg', { type: 'image/jpeg' }),
      []
    ]

    for (const notArray of notArraysOrEmpty) {
      expect(() => validateEventImages(notArray)).toThrowError(
        new Error('Debe proporcionar al menos una imagen del evento.')
      )
    }
  })

  it('throws Error if more than 10 images are provided', () => {
    const images = Array.from({ length: 11 }, (_, i) =>
      new File(['mock content'], `test${i}.jpg`, { type: 'image/jpeg' })
    )

    expect(() => validateEventImages(images)).toThrowError(
      new Error('Podés seleccionar como máximo 10 imágenes.')
    )
  })

  it('throws TypeError if an item in the array is not a File instance', () => {
    const file1 = new File(['mock content'], 'test1.jpg', { type: 'image/jpeg' })
    const notAFile = { name: 'test.jpg', size: 1000, type: 'image/jpeg' }

    expect(() => validateEventImages([file1, notAFile])).toThrowError(
      new TypeError('La imagen 2 no es un archivo válido.')
    )
  })

  it('throws Error if an image format is not valid', () => {
    const validFile = new File(['mock content'], 'test1.jpg', { type: 'image/jpeg' })
    const invalidFormatFile = new File(['mock content'], 'test.txt', { type: 'text/plain' })

    expect(() => validateEventImages([validFile, invalidFormatFile])).toThrowError(
      new Error('La imagen 2 no tiene un formato permitido.')
    )
  })

  it('throws Error if an image size is 0', () => {
    const validFile = new File(['mock content'], 'test1.jpg', { type: 'image/jpeg' })
    const emptyFile = new File([], 'empty.jpg', { type: 'image/jpeg' })

    expect(() => validateEventImages([validFile, emptyFile])).toThrowError(
      new Error('La imagen 2 está vacía.')
    )
  })

  it('throws Error if an image exceeds the maximum size (12 MB)', () => {
    const validFile = new File(['mock content'], 'test1.jpg', { type: 'image/jpeg' })

    // 12 MB + 1 byte
    const largeSize = 12 * 1024 * 1024 + 1
    const largeFile = new File(['content'], 'large.jpg', { type: 'image/jpeg' })
    Object.defineProperty(largeFile, 'size', { value: largeSize })

    expect(() => validateEventImages([validFile, largeFile])).toThrowError(
      new Error('La imagen 2 supera el límite de 12 MB.')
    )
  })
})
