// Stable category ids. Folder names and sidecar values accept the Korean labels too.

export const CATEGORY_IDS = [
  'report',
  'draft',
  'minutes',
  'quote',
  'official',
  'slides',
  'other',
] as const

export type CategoryId = (typeof CATEGORY_IDS)[number]

const ALIASES: Record<string, CategoryId> = {
  report: 'report',
  보고서: 'report',
  draft: 'draft',
  기안문: 'draft',
  기안: 'draft',
  minutes: 'minutes',
  회의록: 'minutes',
  quote: 'quote',
  견적서: 'quote',
  견적: 'quote',
  official: 'official',
  공문: 'official',
  slides: 'slides',
  발표자료: 'slides',
  발표: 'slides',
  other: 'other',
  기타: 'other',
}

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && (CATEGORY_IDS as readonly string[]).includes(value)
}

export function normalizeCategory(
  raw: string | undefined,
  fallback: CategoryId = 'other',
): CategoryId {
  if (!raw) return fallback
  const trimmed = raw.trim()
  return ALIASES[trimmed] ?? ALIASES[trimmed.toLowerCase()] ?? fallback
}

/** Subfolder written under the company templates folder. Korean so a shared NAS tree reads clearly. */
export function categoryFolder(id: CategoryId): string {
  switch (id) {
    case 'report':
      return '보고서'
    case 'draft':
      return '기안문'
    case 'minutes':
      return '회의록'
    case 'quote':
      return '견적서'
    case 'official':
      return '공문'
    case 'slides':
      return '발표자료'
    default:
      return '기타'
  }
}
