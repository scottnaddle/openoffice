// Minimal ZIP reader and writer for OOXML and HWPX templates.
// No extra dependency: text parts are deflated, the HWPX mimetype entry stays stored.
import { deflateRawSync, inflateRawSync } from 'node:zlib'

export interface ZipEntry {
  name: string
  data: Buffer
  /** 0 stored, 8 deflate. Defaults to deflate except for a leading "mimetype". */
  method?: 0 | 8
}

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const EOCD = 0x06054b50
const UTF8_FLAG = 0x800

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function methodOf(entry: ZipEntry, index: number): 0 | 8 {
  if (entry.method === 0 || entry.method === 8) return entry.method
  if (index === 0 && entry.name === 'mimetype') return 0
  return 8
}

export function zipSync(entries: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  entries.forEach((entry, index) => {
    const name = Buffer.from(entry.name, 'utf8')
    const method = methodOf(entry, index)
    const data = method === 8 ? deflateRawSync(entry.data) : entry.data
    const crc = crc32(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(UTF8_FLAG, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(UTF8_FLAG, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += local.length + name.length + data.length
  })
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(EOCD, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, centralBuf, eocd])
}

export function unzipSync(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  let pos = 0
  while (pos + 30 <= buf.length) {
    const sig = buf.readUInt32LE(pos)
    if (sig === CENTRAL || sig === EOCD) break
    if (sig !== LOCAL) break
    const method = buf.readUInt16LE(pos + 8)
    const compSize = buf.readUInt32LE(pos + 18)
    const nameLen = buf.readUInt16LE(pos + 26)
    const extraLen = buf.readUInt16LE(pos + 28)
    const nameStart = pos + 30
    const dataStart = nameStart + nameLen + extraLen
    const dataEnd = dataStart + compSize
    if (dataEnd > buf.length) break
    const name = buf.subarray(nameStart, nameStart + nameLen).toString('utf8')
    const compressed = buf.subarray(dataStart, dataEnd)
    const data =
      method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : null
    if (data && name && !name.endsWith('/')) out.set(name, data)
    pos = dataEnd
  }
  return out
}
