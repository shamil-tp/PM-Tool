import { supabase } from '../lib/supabase';
import type { PostgrestError } from '../lib/supabase';

export interface CompanyBillingProfile {
  id: string;
  workspace_id: string;
  legal_name: string;
  gstin: string | null;
  pan: string | null;
  billing_address: string | null;
  state: string;
  country: string;
  bank_details: any;
  invoice_prefix: string;
}

export interface Client {
  id: string;
  workspace_id: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  billing_address: string;
  status: 'active' | 'inactive';
  gstin?: string;
  billing_state?: string;
  billing_country?: string;
  tax_type?: 'registered' | 'unregistered';
  currency?: string;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  rate: number;
  tax_percentage: number;
  amount: number;
}

export interface Invoice {
  id: string;
  workspace_id: string;
  client_id: string;
  project_id: string | null;
  invoice_number: string;
  amount: number; // Legacy total amount
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
  grand_total: number;
  balance_due: number;
  billing_state_snapshot: string | null;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'partial';
  issue_date: string;
  due_date: string;
  paid_date: string | null;
  created_at: string;
  line_items?: InvoiceLineItem[];
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference_number: string;
}

export interface Expense {
  id: string;
  workspace_id: string;
  category: 'salary' | 'software' | 'infrastructure' | 'office' | 'misc';
  amount: number;
  date: string;
  description: string;
}

export interface FinancialPeriod {
  id: string;
  workspace_id: string;
  month: number;
  year: number;
  status: 'open' | 'closed';
  closed_by?: string;
  closed_at?: string;
}

export interface FinancialSnapshot {
  id: string;
  workspace_id: string;
  period_id: string;
  total_revenue: number;
  total_salary_expense: number;
  total_other_expenses: number;
  net_profit: number;
  employee_count: number;
  client_count: number;
  project_count: number;
}

export interface FinancialAdjustment {
  id: string;
  period_id: string;
  type: 'revenue' | 'salary' | 'expense';
  amount: number;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export async function fetchFinanceData(workspaceId: string) {
  const [companyProfile, clients, invoices, expenses, salaries, periods, snapshots] = await Promise.all([
    supabase.from('company_billing_profile').select('*').eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('clients').select('*').eq('workspace_id', workspaceId),
    supabase.from('invoices').select('*, invoice_line_items(*)').eq('workspace_id', workspaceId),
    supabase.from('expenses').select('*').eq('workspace_id', workspaceId),
    supabase.from('salaries').select('base_salary').eq('workspace_id', workspaceId),
    supabase.from('financial_periods').select('*').eq('workspace_id', workspaceId),
    supabase.from('financial_snapshots').select('*').eq('workspace_id', workspaceId)
  ]);

  if (companyProfile.error && companyProfile.error.code !== 'PGRST116') throw companyProfile.error;
  if (clients.error) throw clients.error;
  if (invoices.error) throw invoices.error;
  if (expenses.error) throw expenses.error;
  if (salaries.error) throw salaries.error;
  if (periods.error && periods.error.code !== '42P01') throw periods.error;
  if (snapshots.error && snapshots.error.code !== '42P01') throw snapshots.error;

  const invoicesList = invoices.data || [];
  const periodsList = periods.data || [];

  const invoiceIds = invoicesList.map(i => i.id);
  const periodIds = periodsList.map(p => p.id);

  const [payments, adjustments] = await Promise.all([
    invoiceIds.length > 0 
      ? supabase.from('payments').select('*').in('invoice_id', invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    periodIds.length > 0 
      ? supabase.from('financial_adjustments').select('*').in('period_id', periodIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (payments.error) throw payments.error;
  if (adjustments.error && adjustments.error.code !== '42P01') throw adjustments.error;

  return {
    companyProfile: companyProfile.data as CompanyBillingProfile | null,
    clients: clients.data as Client[],
    invoices: invoicesList as Invoice[],
    payments: payments.data as Payment[],
    expenses: expenses.data as Expense[],
    salaries: salaries.data as { base_salary: number }[],
    periods: periodsList as FinancialPeriod[],
    snapshots: (snapshots.data || []) as FinancialSnapshot[],
    adjustments: (adjustments.data || []) as FinancialAdjustment[],
  };
}

export const createClient = async (workspaceId: string, client: Partial<Client>): Promise<Client> => {
  const { data, error } = await supabase.from('clients').insert([{ ...client, workspace_id: workspaceId }]).select().single();
  if (error) throw error;
  return data as Client;
};

export const fetchClients = async (workspaceId: string): Promise<Client[]> => {
  const { data, error } = await supabase.from('clients').select('*').eq('workspace_id', workspaceId);
  if (error) throw error;
  return data as Client[];
};

export async function generateInvoice(workspaceId: string, invoice: Partial<Invoice>, lineItems: Partial<InvoiceLineItem>[], prefix: string = 'RPM') {
  // 1. Generate Invoice Number via RPC
  const { data: invNumber, error: rpcError } = await supabase.rpc('generate_invoice_number', {
    p_workspace_id: workspaceId,
    p_prefix: prefix
  });
  if (rpcError) throw rpcError;

  // 2. Insert Invoice
  const { data: newInvoice, error: invError } = await supabase.from('invoices').insert([{ 
    ...invoice, 
    workspace_id: workspaceId,
    invoice_number: invNumber 
  }]).select().single();
  
  if (invError) throw invError;

  // 3. Insert Line Items
  if (lineItems && lineItems.length > 0) {
    const itemsToInsert = lineItems.map(item => ({ ...item, invoice_id: newInvoice.id }));
    const { error: lineItemsError } = await supabase.from('invoice_line_items').insert(itemsToInsert);
    if (lineItemsError) {
      console.error("Failed to insert line items", lineItemsError);
    }
  }

  return newInvoice;
}

export async function recordPayment(payment: Partial<Payment>) {
  const { data, error } = await supabase.from('payments').insert([payment]).select().single();
  if (error) throw error;
  return data;
}

export async function createExpense(workspaceId: string, expense: Partial<Expense>) {
  const { data, error } = await supabase.from('expenses').insert([{ ...expense, workspace_id: workspaceId }]).select().single();
  if (error) throw error;
  return data;
}

export async function closeFinancialPeriod(workspaceId: string, month: number, year: number, userId: string) {
  const { data, error } = await supabase.rpc('close_financial_period', {
    p_workspace_id: workspaceId,
    p_month: month,
    p_year: year,
    p_user_id: userId
  });
  if (error) throw error;
  return data;
}

export async function createFinancialAdjustment(adjustment: Partial<FinancialAdjustment>) {
  const { data, error } = await supabase.from('financial_adjustments').insert([adjustment]).select().single();
  if (error) throw error;
  return data;
}
