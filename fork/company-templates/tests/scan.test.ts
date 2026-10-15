import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { applyPlaceholders } from '../src/apply'
import { builtinTemplates } from '../src/builtin'
import { listTemplateCards, filledTemplate } from '../src/catalog'
import { buildDocx } from '../src/ooxml'
import { resolveInside } from '../src/paths'
import { folderFingerprint, scanTemplateDir } from '../src/scan'
import { unzipSync } from '../src/zip'
import { DRAFT_HWPX_BASE64 } from '../src/draft-hwpx'

function tempRoot(): string {
  const dir = join(tmpdir(), `ieum-templates-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('scanning a company templates folder', () => {
  it('reads a sidecar, a category folder, and markdown front matter', () => {
    const root = tempRoot()
    const reportDir = join(root, '보고서')
    mkdirSync(reportDir)
    writeFileSync(
      join(reportDir, '월간.docx'),
      buildDocx([{ kind: 'para', text: '{{작성자}} 실적' }]),
    )
    writeFileSync(
      join(reportDir, '월간.docx.json'),
      JSON.stringify({ name: '월간 보고', description: '실적 요약' }),
    )
    writeFileSync(
      join(root, '메모.md'),
      '---\nname: 간단 메모\ncategory: 기타\ndescription: 메모\n---\n{{회사명}}\n',
    )
    const found = scanTemplateDir(root)
    const report = found.find((file) => file.extension === 'docx')
    const memo = found.find((file) => file.extension === 'md')
    expect(report).toMatchObject({
      name: '월간 보고',
      category: 'report',
      description: '실적 요약',
      relativePath: '보고서/월간.docx',
    })
    expect(report?.placeholders).toContain('작성자')
    expect(memo).toMatchObject({ name: '간단 메모', category: 'other', description: '메모' })
    expect(memo?.placeholders).toEqual(['회사명'])
    expect(memo?.previewText.startsWith('---')).toBe(false)
  })

  it('skips hidden files, lock files, trash, and symlinks', () => {
    const root = tempRoot()
    writeFileSync(join(root, '.hidden.docx'), buildDocx([{ kind: 'para', text: '숨김' }]))
    writeFileSync(join(root, '~$lock.docx'), buildDocx([{ kind: 'para', text: '잠금' }]))
    const trash = join(root, '.nas-sync-trash')
    mkdirSync(trash)
    writeFileSync(join(trash, 'gone.docx'), buildDocx([{ kind: 'para', text: '버림' }]))
    const real = join(root, '보이는.md')
    writeFileSync(real, '보이는 본문')
    symlinkSync(real, join(root, '링크.md'))
    const found = scanTemplateDir(root)
    expect(found.map((file) => file.relativePath)).toEqual(['보이는.md'])
  })

  it('changes its fingerprint when a template is added', () => {
    const root = tempRoot()
    writeFileSync(join(root, 'a.txt'), '하나')
    const before = folderFingerprint(root)
    writeFileSync(join(root, 'b.txt'), '둘')
    expect(folderFingerprint(root)).not.toBe(before)
  })
})

describe('built-in templates and placeholder application', () => {
  it('ships the starter set with the shared placeholders', () => {
    const cards = listTemplateCards(null)
    expect(cards.map((card) => card.id).sort()).toEqual([
      'builtin:draft',
      'builtin:minutes',
      'builtin:official',
      'builtin:quote',
      'builtin:report',
      'builtin:slides',
    ])
    const report = cards.find((card) => card.id === 'builtin:report')
    expect(report?.extension).toBe('docx')
    expect(report?.placeholders).toEqual(
      expect.arrayContaining(['날짜', '작성자', '부서', '회사명']),
    )
    expect(cards.find((card) => card.id === 'builtin:quote')?.extension).toBe('xlsx')
    expect(cards.find((card) => card.id === 'builtin:slides')?.extension).toBe('pptx')
    const draft = builtinTemplates().find((item) => item.id === 'draft')
    const draftCard = cards.find((card) => card.id === 'builtin:draft')
    expect(draftCard?.placeholders).toEqual(
      expect.arrayContaining(['날짜', '작성자', '부서', '회사명']),
    )
    if (DRAFT_HWPX_BASE64) {
      expect(draft?.extension).toBe('hwpx')
      const entries = unzipSync(draft!.bytes)
      expect(entries.get('mimetype')?.toString('utf8')).toBe('application/hwp+zip')
      expect([...entries.keys()][0]).toBe('mimetype')
    } else {
      expect(draft?.extension).toBe('docx')
    }
    expect(cards.every((card) => card.thumbnailDataUrl?.startsWith('data:image/svg+xml'))).toBe(
      true,
    )
  })

  it('fills a docx and strips markdown front matter', () => {
    const filled = filledTemplate('builtin:report', null, {
      날짜: '2026-10-15',
      작성자: '김민수',
      부서: '기획',
      회사명: '이음',
    })
    expect(filled?.extension).toBe('docx')
    const xml = [...unzipSync(filled!.bytes).values()]
      .map((part) => part.toString('utf8'))
      .join('\n')
    expect(xml).toContain('김민수')
    expect(xml).not.toContain('{{작성자}}')
    const text = applyPlaceholders(
      Buffer.from('---\nname: 메모\ncategory: other\n---\n{{회사명}}'),
      'md',
      { 회사명: '이음' },
    )
    expect(text.toString('utf8')).toBe('이음')
  })

  it('refuses a company template path that leaves the folder', () => {
    const root = tempRoot()
    expect(resolveInside(root, '../secret.docx')).toBeNull()
    expect(resolveInside(root, '보고서/../../secret.docx')).toBeNull()
    expect(resolveInside(root, '/etc/passwd')).toBeNull()
    expect(filledTemplate('company:../secret.docx', root, {})).toBeNull()
  })
})
