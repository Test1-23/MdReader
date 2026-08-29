import { writeFile, rename, unlink } from 'fs/promises'
import { randomBytes } from 'crypto'

// Shared atomic file write — tmp + rename so a mid-write crash can never leave
// a truncated file. Used by conversation persistence and file:write.
export async function writeFileAtomic(target: string, data: string): Promise<void> {
  const tmp = `${target}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, data, 'utf-8')
  try {
    await rename(tmp, target)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
}
