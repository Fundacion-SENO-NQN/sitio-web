import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  disposeImageErrorHandling,
  handleImageError,
  initImageErrorHandling,
  reconcileFailedImages
} from './imageErrorHandler'

function setImageLoadState(
  image: HTMLImageElement,
  { complete, naturalWidth }: { complete: boolean; naturalWidth: number }
): void {
  Object.defineProperty(image, 'complete', {
    configurable: true,
    value: complete
  })
  Object.defineProperty(image, 'naturalWidth', {
    configurable: true,
    value: naturalWidth
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  disposeImageErrorHandling(document)
})

afterEach(() => {
  disposeImageErrorHandling(document)
  document.body.innerHTML = ''
})

describe('imageErrorHandler', () => {
  it('hides achievement images on non-bubbling error events via capture-phase delegation', () => {
    document.body.innerHTML = `
      <details class="achievement">
        <summary class="achievement__summary">
          <img
            class="achievement__image"
            src="https://media.fundacionseno.org/img_logros/36.avif"
            alt=""
            loading="lazy"
            data-image-error="hide"
          />
        </summary>
      </details>
    `

    const image = document.querySelector<HTMLImageElement>('img.achievement__image')!
    setImageLoadState(image, { complete: false, naturalWidth: 0 })

    initImageErrorHandling(document)
    expect(image.hidden).toBe(false)

    // Native image error events do not bubble (`bubbles: false`).
    image.dispatchEvent(new Event('error', { bubbles: false }))

    expect(image.hidden).toBe(true)
  })

  it('reconciles images that already failed before initialization while preserving deferred lazy images', () => {
    document.body.innerHTML = `
      <img
        id="already-failed"
        src="https://media.fundacionseno.org/img_logros/99.avif"
        alt=""
        data-image-error="hide"
      />
      <img
        id="deferred-lazy"
        src="https://media.fundacionseno.org/img_logros/100.avif"
        alt=""
        loading="lazy"
        data-image-error="hide"
      />
      <img
        id="already-loaded"
        src="https://media.fundacionseno.org/img_logros/1.avif"
        alt=""
        data-image-error="hide"
      />
      <img
        id="empty-src"
        src=""
        alt=""
        data-image-error="hide"
      />
    `

    const failed = document.getElementById('already-failed') as HTMLImageElement
    const lazy = document.getElementById('deferred-lazy') as HTMLImageElement
    const loaded = document.getElementById('already-loaded') as HTMLImageElement
    const empty = document.getElementById('empty-src') as HTMLImageElement

    setImageLoadState(failed, { complete: true, naturalWidth: 0 })
    setImageLoadState(lazy, { complete: false, naturalWidth: 0 })
    setImageLoadState(loaded, { complete: true, naturalWidth: 600 })
    setImageLoadState(empty, { complete: true, naturalWidth: 0 })

    initImageErrorHandling(document)

    expect(failed.hidden).toBe(true)
    expect(lazy.hidden).toBe(false)
    expect(loaded.hidden).toBe(false)
    expect(empty.hidden).toBe(false)
  })

  it('handles dynamically inserted images automatically', () => {
    initImageErrorHandling(document)

    const dynamicImage = document.createElement('img')
    dynamicImage.src = 'https://media.fundacionseno.org/img_logros/404.avif'
    dynamicImage.dataset.imageError = 'hide'
    setImageLoadState(dynamicImage, { complete: false, naturalWidth: 0 })

    document.body.appendChild(dynamicImage)
    dynamicImage.dispatchEvent(new Event('error', { bubbles: false }))

    expect(dynamicImage.hidden).toBe(true)
  })

  it('tries data-fallback-src once and reveals placeholder if fallback also fails', () => {
    document.body.innerHTML = `
      <a data-news-image-container>
        <img
          src="https://media.fundacionseno.org/img_noticias/5/0.avif"
          data-news-image
          data-fallback-src="https://media.fundacionseno.org/img_noticias/5.avif"
          alt=""
        />
        <span data-news-image-placeholder hidden>Imagen no disponible</span>
      </a>
    `

    const image = document.querySelector<HTMLImageElement>('[data-news-image]')!
    const placeholder = document.querySelector<HTMLElement>(
      '[data-news-image-placeholder]'
    )!
    setImageLoadState(image, { complete: false, naturalWidth: 0 })

    initImageErrorHandling(document)

    // First error switches to fallback URL without hiding.
    image.dispatchEvent(new Event('error', { bubbles: false }))

    expect(image.src).toBe('https://media.fundacionseno.org/img_noticias/5.avif')
    expect(image.dataset.fallbackSrc).toBeUndefined()
    expect(image.hidden).toBe(false)
    expect(placeholder.hidden).toBe(true)

    // Second error hides image and reveals placeholder.
    image.dispatchEvent(new Event('error', { bubbles: false }))

    expect(image.hidden).toBe(true)
    expect(placeholder.hidden).toBe(false)
  })

  it('prevents infinite fallback loops when fallback matches the failed URL', () => {
    document.body.innerHTML = `
      <figure data-news-image-container>
        <img
          src="/img_noticias/7.avif"
          data-news-image
          data-fallback-src="/img_noticias/7.avif"
          alt=""
        />
        <span data-news-image-placeholder hidden>Imagen no disponible</span>
      </figure>
    `

    const image = document.querySelector<HTMLImageElement>('[data-news-image]')!
    const placeholder = document.querySelector<HTMLElement>(
      '[data-news-image-placeholder]'
    )!
    const srcSetterSpy = vi.spyOn(image, 'src', 'set')

    handleImageError(image)

    expect(srcSetterSpy).not.toHaveBeenCalled()
    expect(image.dataset.fallbackSrc).toBeUndefined()
    expect(image.hidden).toBe(true)
    expect(placeholder.hidden).toBe(false)
  })

  it('avoids registering duplicate listeners across repeated init calls', () => {
    const addListenerSpy = vi.spyOn(document, 'addEventListener')

    initImageErrorHandling(document)
    initImageErrorHandling(document)
    initImageErrorHandling(document)

    const errorListenerCalls = addListenerSpy.mock.calls.filter(
      ([type]) => type === 'error'
    )
    const pageLoadCalls = addListenerSpy.mock.calls.filter(
      ([type]) => type === 'astro:page-load'
    )

    expect(errorListenerCalls).toHaveLength(1)
    expect(pageLoadCalls).toHaveLength(1)

    addListenerSpy.mockRestore()
  })

  it('reconciles failed images on astro:page-load navigation events', () => {
    initImageErrorHandling(document)

    document.body.innerHTML = `
      <img
        class="achievement__image"
        src="https://media.fundacionseno.org/img_logros/42.avif"
        alt=""
        data-image-error="hide"
      />
    `

    const image = document.querySelector<HTMLImageElement>('img.achievement__image')!
    setImageLoadState(image, { complete: true, naturalWidth: 0 })

    document.dispatchEvent(new Event('astro:page-load'))

    expect(image.hidden).toBe(true)
  })

  it('ignores unmanaged images', () => {
    document.body.innerHTML = `
      <img id="plain" src="https://media.fundacionseno.org/other.avif" alt="" />
    `

    const plain = document.getElementById('plain') as HTMLImageElement
    setImageLoadState(plain, { complete: true, naturalWidth: 0 })

    initImageErrorHandling(document)
    plain.dispatchEvent(new Event('error', { bubbles: false }))
    reconcileFailedImages(document)

    expect(plain.hidden).toBe(false)
  })
})
