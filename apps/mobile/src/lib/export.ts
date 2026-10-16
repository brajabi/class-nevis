import * as Clipboard from 'expo-clipboard';
import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import { NOTE_CONTENT_CSS, vazirFontFaceCss } from '@/components/editor/editorHtml';
import { formatJalaliDate, formatTime, htmlToPlainText } from '@/lib/format';

export interface ExportableNote {
  title: string;
  contentHtml: string;
  updatedAt?: string;
}

const A4 = { width: 595, height: 842 };

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Turns a note title into a safe file name (keeps Persian letters). */
export function sanitizeFileName(title: string, ext = 'pdf') {
  const base =
    (title || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'جزوه';
  return `${base}.${ext}`;
}

/** A4, RTL print document for a note. */
export function buildPrintHtml(note: ExportableNote) {
  const title = escapeHtml(note.title || 'جزوه بدون عنوان');
  const date = note.updatedAt ? escapeHtml(`${formatJalaliDate(note.updatedAt)}، ${formatTime(note.updatedAt)}`) : '';
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${A4.width}" />
<style>
${vazirFontFaceCss()}
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
  font-family: 'Vazirmatn', 'Tahoma', 'Noto Naskh Arabic', sans-serif;
  color: #1A1C2B; font-size: 12.5pt; line-height: 2; direction: rtl; text-align: right;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.head { border-bottom: 2px solid #ECEAFB; padding-bottom: 10px; margin-bottom: 18px; position: relative; }
.head::after { content: ''; position: absolute; bottom: -2px; right: 0; width: 90px; height: 2px;
  background: linear-gradient(to left, #7C5CFF, #22D3EE); }
.brand { font-size: 9pt; color: #7C5CFF; font-weight: 700; letter-spacing: 0; }
.title { font-size: 22pt; font-weight: 700; line-height: 1.5; margin: 4px 0 2px; color: #1A1C2B; }
.date { font-size: 9.5pt; color: #6B7091; }
.content { word-wrap: break-word; overflow-wrap: anywhere; }
.content > :first-child { margin-top: 0; }
${NOTE_CONTENT_CSS}
h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
li, blockquote { page-break-inside: avoid; break-inside: avoid; }
p { orphans: 3; widows: 3; }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">کلاس‌نویس</div>
    <div class="title">${title}</div>
    ${date ? `<div class="date">آخرین ویرایش: ${date}</div>` : ''}
  </div>
  <div class="content">${note.contentHtml || '<p style="color:#A5A8BC">(این جزوه خالی است)</p>'}</div>
</body>
</html>`;
}

export interface PdfResult {
  /** file:// URI of the PDF in the cache directory, named after the note. */
  uri: string;
  fileName: string;
  numberOfPages: number;
}

/** Renders the note to an A4 PDF in the cache directory. */
export async function createNotePdf(note: ExportableNote): Promise<PdfResult> {
  const fileName = sanitizeFileName(note.title, 'pdf');
  const res = await Print.printToFileAsync({
    html: buildPrintHtml(note),
    width: A4.width,
    height: A4.height,
    // Android honours the CSS @page margins; iOS needs explicit margins.
    ...(Platform.OS === 'ios' ? { margins: { top: 46, bottom: 52, left: 42, right: 42 } } : {}),
  });
  // Rename into a predictable folder so shared/saved files carry the note title.
  try {
    const dir = new Directory(Paths.cache, 'exports');
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, fileName);
    if (dest.exists) dest.delete();
    new File(res.uri).moveSync(dest);
    return { uri: dest.uri, fileName, numberOfPages: res.numberOfPages };
  } catch {
    return { uri: res.uri, fileName, numberOfPages: res.numberOfPages };
  }
}

export async function sharePdf(pdf: PdfResult) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('اشتراک‌گذاری روی این دستگاه در دسترس نیست');
  await Sharing.shareAsync(pdf.uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'اشتراک‌گذاری جزوه',
    UTI: 'com.adobe.pdf',
  });
}

/** Whether "save to folder" (Storage Access Framework) is supported. */
export const canSaveToFolder = Platform.OS === 'android';

/**
 * Android: lets the user pick a folder (SAF) and writes the PDF into it.
 * Resolves `false` if the user cancelled the picker.
 */
export async function savePdfToFolder(pdf: PdfResult): Promise<boolean> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return false; // picker cancelled
  }
  if (!dir) return false;
  const base64 = await new File(pdf.uri).base64();
  const target = dir.createFile(pdf.fileName, 'application/pdf');
  await target.write(base64, { encoding: 'base64' });
  return true;
}

export function noteToPlainText(note: ExportableNote) {
  const body = htmlToPlainText(note.contentHtml || '');
  return note.title ? `${note.title}\n\n${body}` : body;
}

export async function copyNoteText(note: ExportableNote) {
  await Clipboard.setStringAsync(noteToPlainText(note));
}

export async function shareNoteText(note: ExportableNote) {
  await Share.share({ message: noteToPlainText(note), title: note.title });
}
