// Starter templates shipped with the app. Bytes are built in memory so the
// packaged shell does not need an extra resource path.
import type { CategoryId } from './categories'
import { DRAFT_HWPX_BASE64 } from './draft-hwpx'
import { buildDocx, buildPptx, buildXlsx } from './ooxml'
import type { DocBlock, SlideBox } from './ooxml'
import { extractPlaceholders, visibleText } from './placeholders'
import { unzipSync } from './zip'

export interface BuiltinTemplate {
  id: string
  name: string
  category: CategoryId
  description: string
  extension: string
  bytes: Buffer
}

export function documentThumbnail(title: string, extension: string): string {
  const safe = [...title.replace(/[<>&]/g, '')].slice(0, 16).join('')
  const label = extension.toUpperCase()
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">` +
    `<rect width="320" height="200" fill="#f4f1ea"/>` +
    `<rect x="28" y="18" width="264" height="164" rx="6" fill="#ffffff" stroke="#d9d3c7"/>` +
    `<rect x="28" y="18" width="264" height="36" rx="6" fill="#8c3a2f"/>` +
    `<rect x="28" y="40" width="264" height="14" fill="#8c3a2f"/>` +
    `<text x="44" y="42" fill="#ffffff" font-size="14" font-family="sans-serif">${safe}</text>` +
    `<rect x="44" y="72" width="190" height="7" rx="3" fill="#e4ddd2"/>` +
    `<rect x="44" y="90" width="220" height="7" rx="3" fill="#eee8df"/>` +
    `<rect x="44" y="108" width="160" height="7" rx="3" fill="#eee8df"/>` +
    `<text x="44" y="164" fill="#8a8175" font-size="12" font-family="sans-serif">${label}</text>` +
    `</svg>`
  )
}

export function thumbnailDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const reportBlocks: DocBlock[] = [
  { kind: 'title', text: '월간 업무 보고서' },
  { kind: 'field', label: '회사명', value: '{{회사명}}' },
  { kind: 'field', label: '부서', value: '{{부서}}' },
  { kind: 'field', label: '작성자', value: '{{작성자}}' },
  { kind: 'field', label: '작성일', value: '{{날짜}}' },
  { kind: 'heading', text: '1. 이번 달 실적' },
  { kind: 'para', text: '실적 요약을 적습니다.' },
  { kind: 'heading', text: '2. 이슈와 대응' },
  { kind: 'para', text: '이슈와 대응을 적습니다.' },
  { kind: 'heading', text: '3. 다음 달 계획' },
  { kind: 'para', text: '계획을 적습니다.' },
]

const minutesBlocks: DocBlock[] = [
  { kind: 'title', text: '회의록' },
  { kind: 'field', label: '일시', value: '{{날짜}}' },
  { kind: 'field', label: '회사', value: '{{회사명}}' },
  { kind: 'field', label: '부서', value: '{{부서}}' },
  { kind: 'field', label: '작성', value: '{{작성자}}' },
  { kind: 'heading', text: '안건' },
  { kind: 'para', text: '안건을 적습니다.' },
  { kind: 'heading', text: '논의' },
  { kind: 'para', text: '논의한 내용을 적습니다.' },
  { kind: 'heading', text: '결정' },
  { kind: 'para', text: '결정 사항을 적습니다.' },
]

const draftBlocks: DocBlock[] = [
  { kind: 'title', text: '기안문' },
  { kind: 'field', label: '회사명', value: '{{회사명}}' },
  { kind: 'field', label: '부서', value: '{{부서}}' },
  { kind: 'field', label: '기안자', value: '{{작성자}}' },
  { kind: 'field', label: '기안일', value: '{{날짜}}' },
  { kind: 'heading', text: '1. 목적' },
  { kind: 'para', text: '기안 목적을 적습니다.' },
  { kind: 'heading', text: '2. 내용' },
  { kind: 'para', text: '내용을 적습니다.' },
  { kind: 'heading', text: '3. 요청사항' },
  { kind: 'para', text: '요청을 적습니다.' },
]

const officialBlocks: DocBlock[] = [
  { kind: 'title', text: '공문' },
  { kind: 'para', text: '{{회사명}}' },
  { kind: 'field', label: '수신', value: '' },
  { kind: 'field', label: '제목', value: '' },
  { kind: 'field', label: '날짜', value: '{{날짜}}' },
  { kind: 'field', label: '작성자', value: '{{작성자}}' },
  { kind: 'field', label: '부서', value: '{{부서}}' },
  { kind: 'heading', text: '내용' },
  { kind: 'para', text: '본문을 적습니다.' },
]

function slide(
  text: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
  size: number,
  bold = false,
): SlideBox {
  return { text, x, y, cx, cy, size, bold }
}

function presentation(): Buffer {
  const title: SlideBox[] = [
    slide('{{회사명}}', 640080, 1400000, 10900000, 900000, 4000, true),
    slide('발표자료', 640080, 2400000, 10900000, 700000, 2800, true),
    slide('{{날짜}}', 640080, 3600000, 10900000, 500000, 2000),
    slide('{{작성자}}  {{부서}}', 640080, 4200000, 10900000, 500000, 2000),
  ]
  const agenda: SlideBox[] = [
    slide('목차', 640080, 600000, 10900000, 700000, 3200, true),
    slide('1. 배경', 800000, 1800000, 10000000, 500000, 2200),
    slide('2. 현황', 800000, 2500000, 10000000, 500000, 2200),
    slide('3. 제안', 800000, 3200000, 10000000, 500000, 2200),
    slide('4. 일정', 800000, 3900000, 10000000, 500000, 2200),
  ]
  return buildPptx([title, agenda])
}

function quoteSheet(): Buffer {
  const cells = [
    { col: 0, row: 1, text: '{{회사명}} 견적서' },
    { col: 0, row: 2, text: '작성일 {{날짜}}' },
    { col: 2, row: 2, text: '부서 {{부서}}' },
    { col: 4, row: 2, text: '작성자 {{작성자}}' },
    { col: 0, row: 4, text: '품목' },
    { col: 1, row: 4, text: '규격' },
    { col: 2, row: 4, text: '수량' },
    { col: 3, row: 4, text: '단가' },
    { col: 4, row: 4, text: '금액' },
    { col: 0, row: 5, text: '' },
    { col: 0, row: 10, text: '합계' },
  ]
  return buildXlsx('견적서', cells)
}

function loadEmbeddedHwpx(): Buffer | null {
  if (!DRAFT_HWPX_BASE64) return null
  return Buffer.from(DRAFT_HWPX_BASE64, 'base64')
}

export function builtinTemplates(): BuiltinTemplate[] {
  const hwpx = loadEmbeddedHwpx()
  const draft: BuiltinTemplate = hwpx
    ? {
        id: 'draft',
        name: '기안문',
        category: 'draft',
        description: '목적, 내용, 요청을 적는 기안문입니다.',
        extension: 'hwpx',
        bytes: hwpx,
      }
    : {
        id: 'draft',
        name: '기안문',
        category: 'draft',
        description: '목적, 내용, 요청을 적는 기안문입니다.',
        extension: 'docx',
        bytes: buildDocx(draftBlocks),
      }
  return [
    {
      id: 'report',
      name: '월간 업무 보고서',
      category: 'report',
      description: '실적, 이슈, 다음 계획을 적는 보고서입니다.',
      extension: 'docx',
      bytes: buildDocx(reportBlocks),
    },
    {
      id: 'minutes',
      name: '회의록',
      category: 'minutes',
      description: '안건, 논의, 결정을 적는 회의록입니다.',
      extension: 'docx',
      bytes: buildDocx(minutesBlocks),
    },
    draft,
    {
      id: 'quote',
      name: '견적서',
      category: 'quote',
      description: '품목과 금액을 적는 견적서입니다.',
      extension: 'xlsx',
      bytes: quoteSheet(),
    },
    {
      id: 'official',
      name: '공문',
      category: 'official',
      description: '수신과 제목을 적는 공문입니다.',
      extension: 'docx',
      bytes: buildDocx(officialBlocks),
    },
    {
      id: 'slides',
      name: '발표자료',
      category: 'slides',
      description: '표지와 목차가 있는 발표자료입니다.',
      extension: 'pptx',
      bytes: presentation(),
    },
  ]
}

export function builtinById(id: string): BuiltinTemplate | undefined {
  return builtinTemplates().find((item) => item.id === id)
}

export function builtinPlaceholderNames(item: BuiltinTemplate): string[] {
  if (
    item.extension === 'docx' ||
    item.extension === 'xlsx' ||
    item.extension === 'pptx' ||
    item.extension === 'hwpx'
  ) {
    try {
      const text = [...unzipSync(item.bytes).values()]
        .map((part) => part.toString('utf8'))
        .join('\n')
      return extractPlaceholders(visibleText(text) || text)
    } catch {
      return []
    }
  }
  return extractPlaceholders(item.bytes.toString('utf8'))
}
