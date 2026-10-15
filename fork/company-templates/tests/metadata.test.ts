import { describe, expect, it } from 'vitest'
import {
  metaFromFrontMatter,
  parseSidecar,
  readFrontMatter,
  serializeSidecar,
} from '../src/metadata'

describe('template metadata', () => {
  it('reads a sidecar and falls back to the file name', () => {
    const meta = parseSidecar(
      JSON.stringify({
        name: '주간 보고',
        category: '보고서',
        description: '한 주 요약',
        thumbnail: 'cover.thumb.png',
        placeholders: ['날짜', ''],
      }),
      'ignored',
    )
    expect(meta).toMatchObject({
      name: '주간 보고',
      category: 'report',
      description: '한 주 요약',
      thumbnail: 'cover.thumb.png',
      placeholders: ['날짜'],
    })
  })

  it('rejects a sidecar that is not an object', () => {
    expect(parseSidecar('[1]', '파일')).toBeNull()
    expect(parseSidecar('{', '파일')).toBeNull()
    expect(parseSidecar('{}', '파일')).toMatchObject({ name: '파일', category: 'other' })
  })

  it('uses the parent folder when the sidecar omits a category', () => {
    const meta = parseSidecar('{"description":"메모"}', '회의', 'minutes')
    expect(meta?.category).toBe('minutes')
    expect(meta?.name).toBe('회의')
  })

  it('reads front matter and leaves the body', () => {
    const text = '---\nname: 회의록\ncategory: minutes\ndescription: 안건\n---\n{{날짜}} 본문\n'
    const parsed = readFrontMatter(text)
    expect(parsed.meta).toEqual({ name: '회의록', category: 'minutes', description: '안건' })
    expect(parsed.body).toBe('{{날짜}} 본문\n')
    const meta = metaFromFrontMatter(text, 'fallback')
    expect(meta.meta.category).toBe('minutes')
    expect(meta.body).toBe('{{날짜}} 본문\n')
  })

  it('passes a file through when it has no front matter', () => {
    expect(readFrontMatter('# 제목\n').body).toBe('# 제목\n')
  })

  it('writes the sidecar fields the scanner reads back', () => {
    const raw = serializeSidecar({ name: '견적', category: 'quote', description: '금액' })
    expect(parseSidecar(raw, 'x')).toMatchObject({
      name: '견적',
      category: 'quote',
      description: '금액',
    })
  })
})
