// Hand-written starter documents. They stay small and keep each placeholder inside one text run.
import { zipSync } from './zip'

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export type DocBlock =
  | { kind: 'title'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'field'; label: string; value: string }

function run(text: string, size: number, bold: boolean): string {
  const fonts =
    '<w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic" w:cs="Malgun Gothic"/>'
  const boldTag = bold ? '<w:b/>' : ''
  return `<w:r><w:rPr>${fonts}${boldTag}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

function paragraph(block: DocBlock): string {
  if (block.kind === 'title') {
    return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr>${run(block.text, 36, true)}</w:p>`
  }
  if (block.kind === 'heading') {
    return `<w:p><w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr>${run(block.text, 24, true)}</w:p>`
  }
  if (block.kind === 'field') {
    return `<w:p>${run(`${block.label}  `, 21, true)}${run(block.value, 21, false)}</w:p>`
  }
  return `<w:p>${run(block.text || ' ', 21, false)}</w:p>`
}

export function buildDocx(blocks: readonly DocBlock[]): Buffer {
  const body = blocks.map(paragraph).join('')
  const document =
    XML +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}` +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567"/>' +
    '</w:sectPr></w:body></w:document>'
  const styles =
    XML +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/>' +
    '<w:sz w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>'
  const contentTypes =
    XML +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>'
  const rels =
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>'
  const docRels =
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>'
  return zipSync([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
    { name: '_rels/.rels', data: Buffer.from(rels) },
    { name: 'word/document.xml', data: Buffer.from(document) },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(docRels) },
    { name: 'word/styles.xml', data: Buffer.from(styles) },
  ])
}

export interface SheetCell {
  col: number
  row: number
  text: string
}

function colName(index: number): string {
  let n = index
  let name = ''
  do {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return name
}

export function buildXlsx(sheetName: string, cells: readonly SheetCell[]): Buffer {
  const byRow = new Map<number, SheetCell[]>()
  for (const cell of cells) {
    const list = byRow.get(cell.row) ?? []
    list.push(cell)
    byRow.set(cell.row, list)
  }
  const rows = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([row, list]) => {
      const cols = [...list]
        .sort((a, b) => a.col - b.col)
        .map(
          (cell) =>
            `<c r="${colName(cell.col)}${row}" t="inlineStr"><is><t>${esc(cell.text)}</t></is></c>`,
        )
        .join('')
      return `<row r="${row}">${cols}</row>`
    })
    .join('')
  const sheet =
    XML +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${rows}</sheetData></worksheet>`
  const workbook =
    XML +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
  const contentTypes =
    XML +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>'
  const rels =
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'
  const bookRels =
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>'
  return zipSync([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
    { name: '_rels/.rels', data: Buffer.from(rels) },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(bookRels) },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet) },
  ])
}

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'

export interface SlideBox {
  text: string
  x: number
  y: number
  cx: number
  cy: number
  size: number
  bold?: boolean
}

function slideXml(boxes: readonly SlideBox[]): string {
  const shapes = boxes
    .map((box, index) => {
      const id = index + 2
      const bold = box.bold ? ' b="1"' : ''
      return (
        '<p:sp>' +
        `<p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
        '<p:spPr><a:xfrm>' +
        `<a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/>` +
        '</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
        '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"/>' +
        '<a:lstStyle/><a:p><a:r>' +
        `<a:rPr lang="ko-KR" sz="${box.size}"${bold} dirty="0">` +
        '<a:latin typeface="Malgun Gothic"/><a:ea typeface="Malgun Gothic"/>' +
        `</a:rPr><a:t>${esc(box.text)}</a:t></a:r></a:p></p:txBody></p:sp>`
      )
    })
    .join('')
  const tree =
    '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    `${shapes}</p:spTree>`
  return (
    XML +
    `<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    `<p:cSld>${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  )
}

const EMPTY_TREE =
  '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
  '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>'

export function buildPptx(slides: readonly (readonly SlideBox[])[]): Buffer {
  const contentOverrides = slides
    .map(
      (_, index) =>
        `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join('')
  const contentTypes =
    XML +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
    contentOverrides +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    '</Types>'
  const sldIds = slides
    .map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`)
    .join('')
  const presentation =
    XML +
    `<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    `<p:sldIdLst>${sldIds}</p:sldIdLst>` +
    '<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>' +
    '</p:presentation>'
  const presRels =
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
    slides
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`,
      )
      .join('') +
    '</Relationships>'
  const rootRels =
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
    '</Relationships>'
  const slideRels =
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
    '</Relationships>'
  const layout =
    XML +
    `<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank">` +
    `<p:cSld name="Blank">${EMPTY_TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  const layoutRels =
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
    '</Relationships>'
  const master =
    XML +
    `<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    `<p:cSld>${EMPTY_TREE}</p:cSld>` +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    '<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>'
  const masterRels =
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
    '</Relationships>'
  const theme =
    XML +
    `<a:theme xmlns:a="${NS_A}" name="Office"><a:themeElements>` +
    '<a:clrScheme name="Office">' +
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
    '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="8C3A2F"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
    '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="4472C4"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>' +
    '</a:clrScheme>' +
    '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface="Malgun Gothic"/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="Malgun Gothic"/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
    '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
    '</a:fmtScheme></a:themeElements></a:theme>'

  const entries = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
    { name: '_rels/.rels', data: Buffer.from(rootRels) },
    { name: 'ppt/presentation.xml', data: Buffer.from(presentation) },
    { name: 'ppt/_rels/presentation.xml.rels', data: Buffer.from(presRels) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: Buffer.from(layout) },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: Buffer.from(layoutRels) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: Buffer.from(master) },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: Buffer.from(masterRels) },
    { name: 'ppt/theme/theme1.xml', data: Buffer.from(theme) },
    ...slides.map((boxes, index) => ({
      name: `ppt/slides/slide${index + 1}.xml`,
      data: Buffer.from(slideXml(boxes)),
    })),
    ...slides.map((_, index) => ({
      name: `ppt/slides/_rels/slide${index + 1}.xml.rels`,
      data: Buffer.from(slideRels),
    })),
  ]
  return zipSync(entries)
}
