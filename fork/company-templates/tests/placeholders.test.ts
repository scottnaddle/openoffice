import { describe, expect, it } from 'vitest'
import {
  extractPlaceholders,
  formatTemplateDate,
  prefillPlaceholders,
  replacePlaceholders,
  replacePlaceholdersInXml,
  sanitizeValues,
  visibleText,
} from '../src/placeholders'

describe('placeholders', () => {
  it('extracts unique names and keeps spaces inside the braces trimmed', () => {
    expect(extractPlaceholders('{{날짜}} and {{ 작성자 }} and {{날짜}}')).toEqual([
      '날짜',
      '작성자',
    ])
  })

  it('replaces known names and leaves unknown names in place', () => {
    expect(replacePlaceholders('{{날짜}} {{없는값}}', { 날짜: '2026-10-15' })).toBe(
      '2026-10-15 {{없는값}}',
    )
  })

  it('prefills date, author, department and company from aliases', () => {
    const values = prefillPlaceholders(
      ['날짜', '작성일', '작성자', '기안자', '부서', '회사명', '제목'],
      { name: '김민수', department: '기획', company: '이음' },
      new Date(2026, 9, 15),
    )
    expect(formatTemplateDate(new Date(2026, 9, 15))).toBe('2026-10-15')
    expect(values).toEqual({
      날짜: '2026-10-15',
      작성일: '2026-10-15',
      작성자: '김민수',
      기안자: '김민수',
      부서: '기획',
      회사명: '이음',
      제목: '',
    })
  })

  it('escapes values written into XML text nodes', () => {
    const xml = '<w:t>{{작성자}}</w:t>'
    const filled = replacePlaceholdersInXml(xml, { 작성자: 'A & B <팀>' })
    expect(filled).toBe('<w:t>A &amp; B &lt;팀&gt;</w:t>')
    expect(visibleText(filled)).toBe('A & B <팀>')
  })

  it('fills a placeholder that Word split across runs', () => {
    const xml = '<w:r><w:t>{{작</w:t></w:r><w:r><w:t>성자}}</w:t></w:r><w:r><w:t>끝</w:t></w:r>'
    const filled = replacePlaceholdersInXml(xml, { 작성자: '김민수' })
    expect(visibleText(filled)).toBe('김민수끝')
    expect(filled).toContain('>김민수</w:t>')
    expect(filled).toContain('>끝</w:t>')
  })

  it('caps the number and length of submitted values', () => {
    const input: Record<string, string> = {
      '  날짜  ': 'x'.repeat(800),
      drop: 1 as unknown as string,
    }
    for (let i = 0; i < 50; i++) input[`k${i}`] = 'v'
    const values = sanitizeValues(input)
    expect(values['날짜']).toHaveLength(500)
    expect(Object.keys(values).length).toBeLessThanOrEqual(40)
    expect(values.drop).toBeUndefined()
    expect(sanitizeValues(null)).toEqual({})
  })
})
