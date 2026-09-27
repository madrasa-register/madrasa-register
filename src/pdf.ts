// PDF output. Pages are built as normal screen elements and rasterized into
// the PDF, because PDF text engines break Nastaliq ligatures (Spec §9).
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { Capacitor } from '@capacitor/core'

export async function rasterize(el: HTMLElement): Promise<string> {
  await document.fonts.ready
  return toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
}

/** Build an A4 PDF, one page per element (landscape or portrait). */
export async function pagesToPdf(els: HTMLElement[], orientation: 'landscape' | 'portrait' = 'landscape') {
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
  const W = orientation === 'landscape' ? 297 : 210, H = orientation === 'landscape' ? 210 : 297
  const images: string[] = []
  for (let i = 0; i < els.length; i++) {
    const png = await rasterize(els[i])
    images.push(png)
    if (i > 0) pdf.addPage('a4', orientation)
    const r = els[i].offsetHeight / els[i].offsetWidth
    let w = W - 10, h = w * r
    if (h > H - 10) { h = H - 10; w = h / r }
    pdf.addImage(png, 'PNG', (W - w) / 2, (H - h) / 2, w, h)
  }
  return { pdf, images }
}

/** Save the PDF: native share sheet in the phone app, a normal download in a browser. */
export async function savePdf(pdf: jsPDF, filename: string): Promise<'shared' | 'downloaded'> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const data = pdf.output('datauristring').split(',')[1]
    const res = await Filesystem.writeFile({ path: filename, data, directory: Directory.Documents, recursive: true })
    await Share.share({ title: filename, url: res.uri })
    return 'shared'
  }
  pdf.save(filename)
  return 'downloaded'
}
