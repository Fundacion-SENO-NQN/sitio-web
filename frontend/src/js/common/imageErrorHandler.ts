const MANAGED_IMAGE_SELECTOR =
  'img[data-image-error], img[data-fallback-src], img[data-news-image]'

const IMAGE_CONTAINER_SELECTOR =
  '[data-image-container], [data-news-image-container]'

const IMAGE_PLACEHOLDER_SELECTOR =
  '[data-image-placeholder], [data-news-image-placeholder]'

const attemptedSources = new WeakMap<HTMLImageElement, Set<string>>()
const documentCleanups = new WeakMap<Document, () => void>()

function normalizeUrl(rawUrl: string, baseUri: string): string {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    return ''
  }

  try {
    return new URL(trimmed, baseUri).href
  } catch {
    return trimmed
  }
}

function getAttemptedSet(image: HTMLImageElement): Set<string> {
  let set = attemptedSources.get(image)
  if (!set) {
    set = new Set<string>()
    attemptedSources.set(image, set)
  }
  return set
}

function isManagedImage(target: EventTarget | null): target is HTMLImageElement {
  return (
    target instanceof HTMLImageElement &&
    (target.hasAttribute('data-image-error') ||
      target.hasAttribute('data-fallback-src') ||
      target.hasAttribute('data-news-image'))
  )
}

function hasAlreadyFailed(image: HTMLImageElement): boolean {
  const rawSrc = image.getAttribute('src')?.trim() ?? ''
  if (!rawSrc) {
    return false
  }

  // Deferred `loading="lazy"` images remain `complete === false` until fetched,
  // so only images that already finished loading with zero width are treated as failed.
  return image.complete && image.naturalWidth === 0
}

function applyTerminalErrorBehavior(image: HTMLImageElement): void {
  const errorAction = image.dataset.imageError?.trim().toLowerCase()
  const shouldHide =
    errorAction === 'hide' ||
    image.hasAttribute('data-news-image') ||
    (!errorAction && image.closest(IMAGE_CONTAINER_SELECTOR) !== null)

  if (shouldHide) {
    image.hidden = true
  }

  const container = image.closest(IMAGE_CONTAINER_SELECTOR)
  const placeholder = container?.querySelector<HTMLElement>(
    IMAGE_PLACEHOLDER_SELECTOR
  )

  if (placeholder) {
    placeholder.hidden = false
  }
}

/**
 * Handles an image load error for a managed `<img>` element:
 * 1. Tries a one-time `data-fallback-src` URL while preventing infinite loops.
 * 2. Falls back to hiding the image and revealing an associated placeholder if present.
 */
export function handleImageError(image: HTMLImageElement): void {
  const baseUri = image.ownerDocument?.baseURI || document.baseURI
  const tried = getAttemptedSet(image)

  const rawCurrentAttr = image.getAttribute('src')?.trim() ?? ''
  const normalizedAttr = normalizeUrl(rawCurrentAttr, baseUri)
  const normalizedCurrentSrc = normalizeUrl(image.currentSrc || '', baseUri)

  if (normalizedAttr) {
    tried.add(normalizedAttr)
  }

  if (normalizedCurrentSrc) {
    tried.add(normalizedCurrentSrc)
  }

  const rawFallback = image.dataset.fallbackSrc?.trim() ?? ''
  if (image.hasAttribute('data-fallback-src')) {
    delete image.dataset.fallbackSrc
  }

  if (rawFallback) {
    const normalizedFallback = normalizeUrl(rawFallback, baseUri)

    if (normalizedFallback && !tried.has(normalizedFallback)) {
      tried.add(normalizedFallback)
      image.src = rawFallback
      return
    }
  }

  applyTerminalErrorBehavior(image)
}

/**
 * Reconciles managed images that may have already failed before script execution
 * or after client-side navigation swaps.
 */
export function reconcileFailedImages(root: ParentNode = document): void {
  const images = root.querySelectorAll<HTMLImageElement>(MANAGED_IMAGE_SELECTOR)

  for (const image of images) {
    if (hasAlreadyFailed(image)) {
      handleImageError(image)
    }
  }
}

/**
 * Registers a single capture-phase `error` listener on the document (because
 * image `error` events do not bubble) and reconciles any already-failed images.
 * Safe to call from multiple components without creating duplicate listeners.
 */
export function initImageErrorHandling(doc: Document = document): () => void {
  const existingCleanup = documentCleanups.get(doc)
  if (existingCleanup) {
    reconcileFailedImages(doc)
    return existingCleanup
  }

  const controller = new AbortController()
  const { signal } = controller

  const handleCaptureError = (event: Event): void => {
    if (isManagedImage(event.target)) {
      handleImageError(event.target)
    }
  }

  const handlePageLoad = (): void => {
    reconcileFailedImages(doc)
  }

  doc.addEventListener('error', handleCaptureError, {
    capture: true,
    signal
  })

  doc.addEventListener('astro:page-load', handlePageLoad, {
    signal
  })

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', handlePageLoad, {
      once: true,
      signal
    })
  } else {
    reconcileFailedImages(doc)
  }

  const cleanup = (): void => {
    controller.abort()
    documentCleanups.delete(doc)
  }

  documentCleanups.set(doc, cleanup)
  return cleanup
}

export function disposeImageErrorHandling(doc: Document = document): void {
  documentCleanups.get(doc)?.()
}
