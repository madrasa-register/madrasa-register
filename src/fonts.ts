// Optional Urdu font supplied by the user (e.g. Jameel Noori Nastaleeq).
// Spec §12: Jameel Noori is bundled only after its redistribution licence is
// confirmed. Until then the app ships Noto Nastaliq Urdu, and a maktab that
// owns a copy can load the font file on each device; it is kept locally.
const DB = 'maktab-fonts', STORE = 'fonts', KEY = 'urdu'

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb()
  return new Promise((res, rej) => {
    const q = fn(db.transaction(STORE, mode).objectStore(STORE))
    q.onsuccess = () => res(q.result)
    q.onerror = () => rej(q.error)
  })
}

export let customUrduFontName: string | null = null

async function apply(name: string, data: ArrayBuffer) {
  const face = new FontFace('MaktabUrduCustom', data)
  await face.load()
  document.fonts.add(face)
  document.documentElement.style.setProperty('--ur-face', "'MaktabUrduCustom'")
  customUrduFontName = name
}

export async function loadStoredUrduFont() {
  try {
    const rec = await tx<{ name: string; data: ArrayBuffer } | undefined>('readonly', (s) => s.get(KEY))
    if (rec) await apply(rec.name, rec.data)
  } catch (e) { console.warn('custom font not loaded', e) }
}
export async function saveUrduFont(file: File) {
  const data = await file.arrayBuffer()
  await apply(file.name, data) // throws if the file is not a valid font
  await tx('readwrite', (s) => s.put({ name: file.name, data }, KEY))
}
export async function removeUrduFont() {
  await tx('readwrite', (s) => s.delete(KEY))
  document.documentElement.style.removeProperty('--ur-face')
  customUrduFontName = null
}
