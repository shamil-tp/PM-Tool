import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Download } from 'lucide-react';
import { Client, Invoice, InvoiceLineItem, generateInvoice, CompanyBillingProfile } from '../../services/financeService';
import { generateInvoicePDF } from '../../services/invoicePdfService';
import { fetchDocumentTemplates, DocumentTemplate } from '../../services/documentTemplateService';
import { documentGenerator } from '../../services/documentGeneratorService';

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  clients: Client[];
  companyProfile: CompanyBillingProfile | null;
  onSuccess: () => void;
}

export function CreateInvoiceModal({ isOpen, onClose, workspaceId, clients, companyProfile, onSuccess }: CreateInvoiceModalProps) {
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [lineItems, setLineItems] = useState<Partial<InvoiceLineItem>[]>([
    { description: '', quantity: 1, rate: 0, tax_percentage: 18, amount: 0 }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('default');

  useEffect(() => {
    if (isOpen) {
      fetchDocumentTemplates(workspaceId).then(data => {
        const invoiceTemplates = data.filter(t => t.type === 'invoice');
        setTemplates(invoiceTemplates);
        const defaultTemplate = invoiceTemplates.find(t => t.is_default);
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
        }
      });
    }
  }, [isOpen, workspaceId]);

  if (!isOpen) return null;

  const client = clients.find(c => c.id === selectedClient);
  const isInterState = companyProfile && client 
    ? companyProfile.state.toLowerCase().trim() !== (client.billing_state || '').toLowerCase().trim()
    : false;

  const handleLineItemChange = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    const newItems = [...lineItems];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'rate') {
      newItems[index].amount = Number(newItems[index].quantity || 0) * Number(newItems[index].rate || 0);
    }
    
    setLineItems(newItems);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, rate: 0, tax_percentage: 18, amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  // Calculations
  const subtotal = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const discount_amount = 0; // Simplified for now
  const taxable_amount = subtotal - discount_amount;
  
  let cgst_amount = 0;
  let sgst_amount = 0;
  let igst_amount = 0;

  lineItems.forEach(item => {
    const itemTax = (item.amount || 0) * ((item.tax_percentage || 0) / 100);
    if (isInterState) {
      igst_amount += itemTax;
    } else {
      cgst_amount += itemTax / 2;
      sgst_amount += itemTax / 2;
    }
  });

  const total_tax = cgst_amount + sgst_amount + igst_amount;
  const grand_total = taxable_amount + total_tax;

  const handleSubmit = async () => {
    if (!companyProfile) {
      alert("Company Billing Profile is missing. Please ask a Super Admin to configure it.");
      return;
    }
    if (!selectedClient) {
      alert("Please select a client.");
      return;
    }

    setIsSubmitting(true);
    try {
      const invoiceData: Partial<Invoice> = {
        client_id: selectedClient,
        amount: grand_total, // legacy field fallback
        subtotal,
        discount_amount,
        taxable_amount,
        cgst_amount,
        sgst_amount,
        igst_amount,
        total_tax,
        grand_total,
        balance_due: grand_total,
        billing_state_snapshot: client?.billing_state || null,
        currency: 'INR',
        status: 'sent',
        issue_date: issueDate,
        due_date: dueDate,
      };

      const newInvoice = await generateInvoice(workspaceId, invoiceData, lineItems, companyProfile.invoice_prefix);
      
      if (selectedTemplateId === 'default') {
        // Auto-generate PDF using hardcoded default
        await generateInvoicePDF(companyProfile, client!, newInvoice as Invoice, lineItems as InvoiceLineItem[]);
      } else {
        // Auto-generate using custom template
        const template = templates.find(t => t.id === selectedTemplateId);
        if (template) {
          const templateData = {
            company_name: companyProfile.legal_name,
            client_name: client?.company_name || '',
            invoice_number: (newInvoice as Invoice).invoice_number,
            amount: grand_total,
            gst: total_tax,
            date: issueDate,
            signature: companyProfile.legal_name,
          };
          const blob = await documentGenerator(template, templateData);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${(newInvoice as Invoice).invoice_number.replace(/\//g, '_')}_Invoice.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
      
      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err.message || "Failed to generate invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col font-geist">
        <div className="flex justify-between items-center p-6 border-b border-border/50">
          <h2 className="text-xl font-semibold text-text-primary">Create GST Invoice</h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-sm text-text-secondary">
          {/* Client & Dates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1 md:col-span-1">
              <label className="font-medium text-text-primary">Client</label>
              <select 
                value={selectedClient} 
                onChange={e => setSelectedClient(e.target.value)}
                className="w-full bg-surface-highest border border-border/50 rounded-lg px-4 py-2.5 outline-none focus:border-accent-primary"
              >
                <option value="">Select a client...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.company_name} {c.gstin ? `(GST: ${c.gstin})` : ''}</option>
                ))}
              </select>
              {client && (
                <div className="text-xs mt-2 text-text-tertiary">
                  State: {client.billing_state || 'Not set'} | Type: {isInterState ? 'Inter-state (IGST)' : 'Intra-state (CGST+SGST)'}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className="font-medium text-text-primary">Issue Date</label>
              <input 
                type="date" 
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
                className="w-full bg-surface-highest border border-border/50 rounded-lg px-4 py-2.5 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium text-text-primary">Due Date</label>
              <input 
                type="date" 
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-surface-highest border border-border/50 rounded-lg px-4 py-2.5 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium text-text-primary">Template</label>
              <select 
                value={selectedTemplateId}
                onChange={e => setSelectedTemplateId(e.target.value)}
                className="w-full bg-surface-highest border border-border/50 rounded-lg px-4 py-2.5 outline-none focus:border-accent-primary"
              >
                <option value="default">System Default PDF</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name} {t.is_default ? '(Default)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="font-medium text-text-primary text-base">Line Items</label>
              <button onClick={addLineItem} className="text-accent-primary hover:text-emerald-400 font-medium flex items-center gap-1 text-sm">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>
            
            <div className="border border-border/50 rounded-lg overflow-hidden">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-surface-highest border-b border-border/50 text-xs text-text-tertiary uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 w-1/2">Description</th>
                    <th className="px-4 py-3 w-20">Qty</th>
                    <th className="px-4 py-3 w-32">Rate (₹)</th>
                    <th className="px-4 py-3 w-24">Tax %</th>
                    <th className="px-4 py-3 w-32 text-right">Amount (₹)</th>
                    <th className="px-4 py-3 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {lineItems.map((item, index) => (
                    <tr key={index}>
                      <td className="p-2">
                        <input type="text" value={item.description} onChange={e => handleLineItemChange(index, 'description', e.target.value)} placeholder="Item description" className="w-full bg-transparent border-none outline-none px-2 text-sm text-text-primary" />
                      </td>
                      <td className="p-2">
                        <input type="number" min="1" value={item.quantity} onChange={e => handleLineItemChange(index, 'quantity', Number(e.target.value))} className="w-full bg-transparent border-none outline-none px-2 text-sm text-text-primary" />
                      </td>
                      <td className="p-2">
                        <input type="number" min="0" value={item.rate} onChange={e => handleLineItemChange(index, 'rate', Number(e.target.value))} className="w-full bg-transparent border-none outline-none px-2 text-sm text-text-primary" />
                      </td>
                      <td className="p-2">
                        <select value={item.tax_percentage} onChange={e => handleLineItemChange(index, 'tax_percentage', Number(e.target.value))} className="w-full bg-transparent border-none outline-none px-2 text-sm text-text-primary">
                          <option value="0">0%</option>
                          <option value="5">5%</option>
                          <option value="12">12%</option>
                          <option value="18">18%</option>
                          <option value="28">28%</option>
                        </select>
                      </td>
                      <td className="p-2 text-right font-mono text-sm text-text-primary pr-4">
                        {(item.amount || 0).toFixed(2)}
                      </td>
                      <td className="p-2 text-center">
                        <button onClick={() => removeLineItem(index)} className="text-text-tertiary hover:text-rose-500 transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals Calculation */}
          <div className="flex justify-end pt-4">
            <div className="w-72 space-y-3 font-mono text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>Subtotal:</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              
              {isInterState ? (
                <div className="flex justify-between text-text-secondary">
                  <span>IGST:</span>
                  <span>₹{igst_amount.toFixed(2)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-text-secondary">
                    <span>CGST:</span>
                    <span>₹{cgst_amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-text-secondary">
                    <span>SGST:</span>
                    <span>₹{sgst_amount.toFixed(2)}</span>
                  </div>
                </>
              )}
              
              <div className="border-t border-border/50 pt-3 flex justify-between font-bold text-lg text-text-primary">
                <span>Grand Total:</span>
                <span>₹{grand_total.toFixed(2)}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border/50 bg-surface-highest/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !selectedClient || subtotal <= 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-accent-primary text-black font-semibold rounded-lg text-sm transition-all hover:bg-emerald-400 disabled:opacity-50"
          >
            {isSubmitting ? 'Generating...' : (
              <>
                <Download className="w-4 h-4" />
                Generate Invoice & PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
