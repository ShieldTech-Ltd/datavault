import { zipSync, strToU8 } from 'fflate';
export const groundTruth = 'DataVault fixture paragraph.';
export function pdfFixture(text = groundTruth, pages = 1) {
  const content = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : '';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({length:pages}, (_,i)=>`${5+i} 0 R`).join(' ')}] /Count ${pages} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, ...Array.from({length:pages},()=> '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>')];
  let result = '%PDF-1.4\n'; const offsets = [0];
  for (let i=0;i<objects.length;i++) { offsets.push(result.length); result += `${i+1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref=result.length;
  result += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n` + offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('') + `trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return strToU8(result);
}
export function docxFixture() {
  return zipSync({ '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'), 'word/document.xml': strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${groundTruth}</w:t></w:r></w:p></w:body></w:document>`) });
}
