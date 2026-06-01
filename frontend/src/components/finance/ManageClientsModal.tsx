import React, { useState } from 'react';
import { X, Plus, Trash2, Save, Edit2 } from 'lucide-react';
import { Client } from '../../services/financeService';
import { supabase } from '../../lib/supabase';

interface ManageClientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  clients: Client[];
  onSuccess: () => void;
}

export function ManageClientsModal({ isOpen, onClose, workspaceId, clients, onSuccess }: ManageClientsModalProps) {
  const [editingClient, setEditingClient] = useState<Partial<Client> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!editingClient?.company_name) return;
    setIsSubmitting(true);
    try {
      if (editingClient.id) {
        await supabase.from('clients').update(editingClient).eq('id', editingClient.id);
      } else {
        await supabase.from('clients').insert([{ ...editingClient, workspace_id: workspaceId }]);
      }
      onSuccess();
      setEditingClient(null);
    } catch (e: any) {
      alert(e.message || 'Failed to save client');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this client?')) return;
    try {
      await supabase.from('clients').delete().eq('id', id);
      onSuccess();
    } catch (e: any) {
      alert(e.message || 'Failed to delete client');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--pm-surface)] border border-[var(--pm-border)] rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col font-geist">
        <div className="flex justify-between items-center p-6 border-b border-[var(--pm-border)]">
          <h2 className="text-xl font-semibold text-[var(--pm-text)]">Manage Clients</h2>
          <button onClick={onClose} className="p-2 text-[var(--pm-text-secondary)] hover:text-[var(--pm-text)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Client List */}
          <div className="w-1/2 border-r border-[var(--pm-border)] flex flex-col">
            <div className="p-4 border-b border-[var(--pm-border)] bg-[var(--pm-surface-hover)]">
              <button onClick={() => setEditingClient({ company_name: '', currency: 'INR', tax_type: 'unregistered' })} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                <Plus className="w-4 h-4" /> Add New Client
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {clients.map(client => (
                <div key={client.id} className="p-3 mb-2 rounded-lg border border-[var(--pm-border)] hover:bg-[var(--pm-surface-hover)] flex justify-between items-center transition-colors">
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--pm-text)]">{client.company_name}</h4>
                    <p className="text-xs text-[var(--pm-text-tertiary)]">{client.email || 'No email'} | {client.currency || 'INR'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingClient(client)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(client.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Editor */}
          <div className="w-1/2 flex flex-col bg-[var(--pm-surface-highest)]">
            {editingClient ? (
              <div className="p-6 flex-1 overflow-y-auto space-y-4">
                <h3 className="text-lg font-medium mb-4 text-[var(--pm-text)]">{editingClient.id ? 'Edit Client' : 'New Client'}</h3>
                
                <div>
                  <label className="block text-xs font-medium text-[var(--pm-text-secondary)] mb-1">Company Name</label>
                  <input type="text" value={editingClient.company_name || ''} onChange={e => setEditingClient({...editingClient, company_name: e.target.value})} className="w-full px-3 py-2 bg-[var(--pm-surface)] border border-[var(--pm-border)] rounded-md text-sm text-[var(--pm-text)]" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--pm-text-secondary)] mb-1">Email</label>
                    <input type="email" value={editingClient.email || ''} onChange={e => setEditingClient({...editingClient, email: e.target.value})} className="w-full px-3 py-2 bg-[var(--pm-surface)] border border-[var(--pm-border)] rounded-md text-sm text-[var(--pm-text)]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--pm-text-secondary)] mb-1">Phone</label>
                    <input type="text" value={editingClient.phone || ''} onChange={e => setEditingClient({...editingClient, phone: e.target.value})} className="w-full px-3 py-2 bg-[var(--pm-surface)] border border-[var(--pm-border)] rounded-md text-sm text-[var(--pm-text)]" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--pm-text-secondary)] mb-1">Currency (e.g. USD, EUR, INR)</label>
                    <select value={editingClient.currency || 'INR'} onChange={e => setEditingClient({...editingClient, currency: e.target.value})} className="w-full px-3 py-2 bg-[var(--pm-surface)] border border-[var(--pm-border)] rounded-md text-sm text-[var(--pm-text)]">
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="AUD">AUD (A$)</option>
                      <option value="CAD">CAD (C$)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--pm-text-secondary)] mb-1">GST / Tax ID</label>
                    <input type="text" value={editingClient.gstin || ''} onChange={e => setEditingClient({...editingClient, gstin: e.target.value})} className="w-full px-3 py-2 bg-[var(--pm-surface)] border border-[var(--pm-border)] rounded-md text-sm text-[var(--pm-text)]" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--pm-text-secondary)] mb-1">Billing Address</label>
                  <textarea value={editingClient.billing_address || ''} onChange={e => setEditingClient({...editingClient, billing_address: e.target.value})} className="w-full px-3 py-2 bg-[var(--pm-surface)] border border-[var(--pm-border)] rounded-md text-sm text-[var(--pm-text)] h-20" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--pm-text-secondary)] mb-1">State</label>
                    <input type="text" value={editingClient.billing_state || ''} onChange={e => setEditingClient({...editingClient, billing_state: e.target.value})} className="w-full px-3 py-2 bg-[var(--pm-surface)] border border-[var(--pm-border)] rounded-md text-sm text-[var(--pm-text)]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--pm-text-secondary)] mb-1">Country</label>
                    <input type="text" value={editingClient.billing_country || 'India'} onChange={e => setEditingClient({...editingClient, billing_country: e.target.value})} className="w-full px-3 py-2 bg-[var(--pm-surface)] border border-[var(--pm-border)] rounded-md text-sm text-[var(--pm-text)]" />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button onClick={() => setEditingClient(null)} className="px-4 py-2 text-sm border border-[var(--pm-border)] rounded-md">Cancel</button>
                  <button onClick={handleSave} disabled={isSubmitting} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2">
                    <Save className="w-4 h-4" /> Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[var(--pm-text-tertiary)] flex-col gap-2">
                <Plus className="w-12 h-12 opacity-20" />
                <p className="text-sm">Select a client to edit or create a new one.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
