/**
 * PDF generation helper for the Achievement Certificate.
 *
 * Uses html2canvas to snapshot the certificate DOM node, then jsPDF to
 * produce an A4-landscape file. Both libraries are dynamically imported
 * so they are not in the main /trading bundle — they only ship to the
 * client when the user actually clicks "Download Certificate".
 */

export async function generateCertificatePDF(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  // Lazy-load — adds ~150 KB gzipped only when the user actually exports
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  // Render the certificate node to a high-DPI canvas. Scale x2 makes the
  // PDF crisp on high-DPI screens and physical printing.
  const canvas = await html2canvas(element, {
    scale:           2,
    useCORS:         true,
    backgroundColor: '#0a0a0f',
    logging:         false,
  });

  // A4 landscape: 297 x 210 mm
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit:        'mm',
    format:      'a4',
  });

  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Fit the rendered image into the page while preserving aspect ratio
  const imgRatio    = canvas.width / canvas.height;
  const pageRatio   = pageWidth / pageHeight;
  let drawWidth, drawHeight;
  if (imgRatio > pageRatio) {
    drawWidth  = pageWidth;
    drawHeight = pageWidth / imgRatio;
  } else {
    drawHeight = pageHeight;
    drawWidth  = pageHeight * imgRatio;
  }
  const offsetX = (pageWidth  - drawWidth)  / 2;
  const offsetY = (pageHeight - drawHeight) / 2;

  pdf.addImage(
    canvas.toDataURL('image/png'),
    'PNG',
    offsetX,
    offsetY,
    drawWidth,
    drawHeight,
    undefined,
    'FAST',
  );

  pdf.save(filename);
}

/**
 * Generate a short stable certificate ID from the user's email + timestamp.
 * Format: SZK-XXXXXX (6 hex chars).
 */
export function makeCertificateId(seed: string): string {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) >>> 0;
  }
  return `SZK-${hash.toString(16).slice(0, 6).toUpperCase().padStart(6, '0')}`;
}
