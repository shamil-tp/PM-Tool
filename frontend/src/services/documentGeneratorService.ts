import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { DocumentTemplate } from './documentTemplateService';

export const documentGenerator = async (
  template: DocumentTemplate,
  data: Record<string, any>
): Promise<Blob> => {
  // 1. Replace variables in template body
  let bodyContent = template.template_body || '';
  
  // Replace {{variable}} with data[variable]
  // Supports dot notation basic replacement like {{client.name}}
  const replaceVars = (text: string, context: Record<string, any>) => {
    return text.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
      const keys = path.split('.');
      let val = context;
      for (const key of keys) {
        if (val === undefined || val === null) break;
        val = val[key];
      }
      return val !== undefined && val !== null ? String(val) : match;
    });
  };

  bodyContent = replaceVars(bodyContent, data);
  const headerContent = template.header_config?.content ? replaceVars(template.header_config.content, data) : '';
  const footerContent = template.footer_config?.content ? replaceVars(template.footer_config.content, data) : '';

  // 2. Create hidden DOM node for rendering
  const container = document.createElement('div');
  // Fixed A4 dimensions at 96 DPI: 794px x 1123px (A4 is 210x297mm)
  container.style.width = '794px';
  container.style.minHeight = '1123px';
  container.style.padding = '40px';
  container.style.backgroundColor = 'white';
  container.style.color = 'black';
  container.style.fontFamily = template.styles?.fontFamily || 'Helvetica, Arial, sans-serif';
  container.style.fontSize = template.styles?.fontSize || '14px';
  container.style.position = 'absolute';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.boxSizing = 'border-box';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  // Apply custom styles
  if (template.styles?.color) container.style.color = template.styles.color;

  let innerHTML = '';

  // Header
  if (template.logo_url) {
    innerHTML += `<div style="margin-bottom: 20px; text-align: ${template.header_config?.align || 'left'};"><img src="${template.logo_url}" style="max-height: 80px; max-width: 200px;" crossorigin="anonymous"/></div>`;
  }
  if (headerContent) {
    innerHTML += `<div style="margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px; text-align: ${template.header_config?.align || 'left'};">${headerContent}</div>`;
  }

  // Body
  innerHTML += `<div style="flex-grow: 1; white-space: pre-wrap; line-height: 1.5;">${bodyContent}</div>`;

  // Footer
  if (footerContent) {
    innerHTML += `<div style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 10px; font-size: 0.85em; color: #666; text-align: ${template.footer_config?.align || 'center'};">${footerContent}</div>`;
  }

  container.innerHTML = innerHTML;
  document.body.appendChild(container);

  try {
    // 3. Render with html2canvas
    const canvas = await html2canvas(container, {
      scale: 2, // Higher resolution
      useCORS: true,
      logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    
    // 4. Generate PDF using jsPDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    // Check if it fits on one page, otherwise we might need multi-page logic
    // For simplicity, we scale to fit one page width, and if height > A4 height, it flows over (simple image split)
    let heightLeft = pdfHeight;
    let position = 0;
    const pageHeight = pdf.internal.pageSize.getHeight();

    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position = heightLeft - pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
    }

    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
};
