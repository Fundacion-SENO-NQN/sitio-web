export function toIsoDate(
  value: string | Date | null | undefined
): string | null {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)

  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function plainText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function createSeoDescription(
  value: string | null | undefined,
  fallback: string,
  maximumLength = 170
): string {
  const normalized = plainText(value)

  if (!normalized) return fallback
  if (normalized.length <= maximumLength) return normalized

  const shortened = normalized
    .slice(0, maximumLength - 1)
    .replace(/\s+\S*$/, '')
    .trim()

  return `${shortened}…`
}
