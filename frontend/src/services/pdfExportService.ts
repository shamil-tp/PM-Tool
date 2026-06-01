import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { activityLogService } from './activityLogService';

/**
 * Enterprise PDF Export Service
 * Generates client-side PDF using jsPDF.
 */
export const exportToPDF = async (
  workspaceId: string,
  reportType: string,
  dataRaw: any
) => {
  // Track in observability
  activityLogService.appendLog({
    workspace_id: workspaceId,
    actor_id: 'system',
    action: 'pdf_generation_started',
    metadata: { reportType }
  }).catch(() => {});

  const doc = new jsPDF();
  const title = `${reportType.replace(/_/g, ' ')}`;
  
  doc.setFontSize(18);
  doc.text(title, 14, 22);
  doc.setFontSize(11);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);

  const data = dataRaw?.data || dataRaw; // handle wrapper object if present

  if (Array.isArray(data) && data.length > 0) {
    const headers = Object.keys(data[0]);
    const body = data.map(row => headers.map(h => String(row[h] || '')));
    
    (doc as any).autoTable({
      startY: 40,
      head: [headers],
      body: body,
      theme: 'grid',
      headStyles: { fillColor: [31, 41, 55] }, // Dark header
    });
  } else {
    doc.text('No data available for this report.', 14, 40);
  }

  doc.save(`${reportType}_${new Date().toISOString().split('T')[0]}.pdf`);

  // Track success
  activityLogService.appendLog({
    workspace_id: workspaceId,
    actor_id: 'system',
    action: 'pdf_generation_completed',
    metadata: { reportType, success: true }
  }).catch(() => {});

  return true;
};

export const exportToCSV = async (
  workspaceId: string,
  reportType: string,
  data: any[]
) => {
  activityLogService.appendLog({
    workspace_id: workspaceId,
    actor_id: 'system',
    action: 'csv_generation_started',
    metadata: { reportType }
  }).catch(() => {});

  await new Promise(resolve => setTimeout(resolve, 800));

  let csvContent = "";
  if (data && data.length > 0) {
    const headers = Object.keys(data[0]);
    csvContent += headers.join(",") + "\n";
    data.forEach(row => {
      const values = headers.map(h => {
        const val = row[h];
        return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
      });
      csvContent += values.join(",") + "\n";
    });
  } else {
    csvContent = "No data available";
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${reportType}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);

  activityLogService.appendLog({
    workspace_id: workspaceId,
    actor_id: 'system',
    action: 'csv_generation_completed',
    metadata: { reportType, success: true }
  }).catch(() => {});

  return true;
};
