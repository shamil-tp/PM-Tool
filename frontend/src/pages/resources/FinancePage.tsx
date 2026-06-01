import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
  fetchFinanceData, closeFinancialPeriod, createFinancialAdjustment, 
  Client, Invoice, Payment, Expense, FinancialPeriod, FinancialSnapshot, FinancialAdjustment, CompanyBillingProfile, fetchClients
} from '../../services/financeService';
import { 
  Plus, Landmark, Receipt, CreditCard, TrendingUp, TrendingDown, 
  Wallet, Building2, ChevronLeft, ChevronRight, Lock, 
  AlertCircle, History, Download, X 
} from 'lucide-react';
import { CreateInvoiceModal } from '../../components/finance/CreateInvoiceModal';
import { ManageClientsModal } from '../../components/finance/ManageClientsModal';
import { generateInvoicePDF } from '../../services/invoicePdfService';

export default function FinancePage() {
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1); // 1-12
  const [viewYear, setViewYear] = useState(new Date().getFullYear());

  const [data, setData] = useState<{
    clients: Client[];
    invoices: Invoice[];
    payments: Payment[];
    expenses: Expense[];
    salaries: { base_salary: number }[];
    periods: FinancialPeriod[];
    snapshots: FinancialSnapshot[];
    adjustments: FinancialAdjustment[];
    companyProfile: CompanyBillingProfile;
  } | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showManageClientsModal, setShowManageClientsModal] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({ type: 'expense', amount: '', reason: '' });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace?.id) return;
    loadData();
    fetchClients(workspace.id).then(setClients);

    // Realtime subscriptions
    const periodsSub = supabase.channel('financial_periods_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_periods', filter: `workspace_id=eq.${workspace.id}` }, () => {
        loadData();
      }).subscribe();
      
    const snapshotsSub = supabase.channel('financial_snapshots_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_snapshots', filter: `workspace_id=eq.${workspace.id}` }, () => {
        loadData();
      }).subscribe();

    // Adjustments doesn't have workspace_id directly, but changes usually trigger load
    const adjustmentsSub = supabase.channel('financial_adjustments_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_adjustments' }, () => {
        loadData();
      }).subscribe();

    return () => {
      supabase.removeChannel(periodsSub);
      supabase.removeChannel(snapshotsSub);
      supabase.removeChannel(adjustmentsSub);
    };
  }, [workspace?.id]);

  const loadData = async () => {
    try {
      if (!data) setLoading(true);
      const result = await fetchFinanceData(workspace!.id);
      setData(result as any);
    } catch (err) {
      console.error('Failed to load finance data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseMonth = async () => {
    if (!workspace?.id || !user?.id) return;
    if (confirm(`Are you sure you want to close ${getMonthName(viewMonth)} ${viewYear}? This will lock records and store a permanent snapshot.`)) {
      try {
        await closeFinancialPeriod(workspace.id, viewMonth, viewYear, user.id);
      } catch (err: any) {
        handleDbError(err);
      }
    }
  };

  const handleDbError = (err: any) => {
    if (err?.message?.includes('Cannot modify financial records in a closed period')) {
      setErrorMsg("This financial period is closed. Add an adjustment instead.");
    } else {
      setErrorMsg(err?.message || "An unexpected error occurred.");
    }
    setTimeout(() => setErrorMsg(null), 5000);
  };

  const submitAdjustment = async () => {
    const period = data?.periods.find(p => p.month === viewMonth && p.year === viewYear);
    if (!period || !user?.id) return;

    if (!adjustmentForm.amount || !adjustmentForm.reason) {
      alert("Amount and Reason are required.");
      return;
    }

    try {
      await createFinancialAdjustment({
        period_id: period.id,
        type: adjustmentForm.type as 'revenue'|'salary'|'expense',
        amount: Number(adjustmentForm.amount),
        reason: adjustmentForm.reason,
        created_by: user.id
      });
      setShowAdjustmentModal(false);
      setAdjustmentForm({ type: 'expense', amount: '', reason: '' });
      loadData();
    } catch (err) {
      handleDbError(err);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-text-tertiary" style={{ color: 'var(--pm-on-surface-variant)' }}>
        Loading ledgers...
      </div>
    );
  }

  const period = data.periods.find(p => p.month === viewMonth && p.year === viewYear);
  const snapshot = period ? data.snapshots.find(s => s.period_id === period.id) : null;
  const isClosed = period?.status === 'closed';

  const periodAdjustments = period ? data.adjustments.filter(a => a.period_id === period.id) : [];

  const isCurrentMonth = (dateString: string) => {
    const d = new Date(dateString);
    return (d.getMonth() + 1) === viewMonth && d.getFullYear() === viewYear;
  };

  // Payment/Revenue mapping with GST extraction
  let currentMonthRevenue = 0;
  let currentMonthGST = 0;

  data.payments.filter(p => isCurrentMonth(p.payment_date)).forEach(p => {
    const inv = data.invoices.find(i => i.id === p.invoice_id);
    if (inv && (inv.grand_total > 0 || inv.amount > 0)) {
      const gTotal = inv.grand_total || inv.amount;
      const taxAmt = inv.total_tax || 0;
      const taxRatio = taxAmt / gTotal;
      const paymentGST = Number(p.amount) * taxRatio;
      currentMonthGST += paymentGST;
      currentMonthRevenue += (Number(p.amount) - paymentGST);
    } else {
      currentMonthRevenue += Number(p.amount);
    }
  });

  const baseRevenue = isClosed && snapshot ? Number(snapshot.total_revenue) : currentMonthRevenue;
  const baseGST = isClosed ? 0 : currentMonthGST;

  const baseSalary = isClosed && snapshot ? Number(snapshot.total_salary_expense) :
    data.salaries.reduce((sum, s) => sum + Number(s.base_salary), 0);

  const baseOther = isClosed && snapshot ? Number(snapshot.total_other_expenses) :
    data.expenses.filter(e => isCurrentMonth(e.date)).reduce((sum, e) => sum + Number(e.amount), 0);

  // Adjustment totals
  const adjRevenue = periodAdjustments.filter(a => a.type === 'revenue').reduce((sum, a) => sum + Number(a.amount), 0);
  const adjSalary = periodAdjustments.filter(a => a.type === 'salary').reduce((sum, a) => sum + Number(a.amount), 0);
  const adjOther = periodAdjustments.filter(a => a.type === 'expense').reduce((sum, a) => sum + Number(a.amount), 0);

  // Final totals
  const revenueThisMonth = baseRevenue + adjRevenue;
  const salaryExpenses = baseSalary + adjSalary;
  const otherExpensesThisMonth = baseOther + adjOther;
  const netProfit = revenueThisMonth - salaryExpenses - otherExpensesThisMonth;

  const pendingInvoicesAmount = data.invoices
    .filter(i => ['draft', 'sent', 'overdue', 'partial'].includes(i.status))
    .reduce((sum, i) => sum + Number(i.balance_due || i.amount || 0), 0);

  function getMonthName(m: number) {
    return new Date(2000, m - 1, 1).toLocaleString('default', { month: 'long' });
  }

  const prevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  return (
    <div className="space-y-8 pb-16 font-geist h-full overflow-y-auto p-6" style={{ color: 'var(--pm-on-surface)' }}>
      {/* Header */}
      <div className="flex items-end justify-between px-1 pt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts & Finance</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--pm-on-surface-variant)' }}>
            Financial oversight and ledger management.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowManageClientsModal(true)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium border"
            style={{ background: 'var(--pm-surface-highest)', borderColor: 'rgba(70,69,84,0.3)' }}>
            <Building2 className="w-4 h-4" />
            Manage Clients
          </button>
          {!isClosed ? (
            <button onClick={() => setShowInvoiceModal(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors">
              <Plus className="w-4 h-4" />
              New Invoice
            </button>
          ) : (
            <button onClick={() => setShowAdjustmentModal(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors">
              <Plus className="w-4 h-4" />
              Add Adjustment
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg flex items-center gap-3 mx-1">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Period Selector */}
      <div className="flex items-center justify-between px-1 bg-black/5 p-3 rounded-xl border" style={{ borderColor: 'rgba(70,69,84,0.3)' }}>
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="p-1 hover:bg-black/10 rounded-full transition-colors"><ChevronLeft className="w-5 h-5" /></button>
          <div className="text-lg font-semibold w-40 text-center">
            {getMonthName(viewMonth)} {viewYear}
          </div>
          <button onClick={nextMonth} className="p-1 hover:bg-black/10 rounded-full transition-colors"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-3">
          {isClosed ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 text-amber-500 rounded-full text-xs font-semibold uppercase tracking-wider">
              <Lock className="w-3.5 h-3.5" />
              Closed Period
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-xs font-semibold uppercase tracking-wider">
              Open Period
            </div>
          )}
          {!isClosed && (
            <button onClick={handleCloseMonth} className="px-3 py-1.5 text-sm font-medium rounded-md bg-black/80 hover:bg-black text-white transition-colors">
              Close Month
            </button>
          )}
        </div>
      </div>
      
      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-1">
        <div className="p-5 rounded-xl border relative overflow-hidden" style={{ background: 'var(--pm-surface-highest)', borderColor: 'rgba(70,69,84,0.3)' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--pm-on-surface-variant)' }}>
            <TrendingUp className="text-emerald-500 w-4 h-4" />
            <span>Revenue</span>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight mt-2 flex items-baseline gap-2">
            ${revenueThisMonth.toLocaleString()}
            {adjRevenue !== 0 && (
              <span className={`text-xs font-medium ${adjRevenue > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                ({adjRevenue > 0 ? '+' : ''}{adjRevenue.toLocaleString()})
              </span>
            )}
          </div>
        </div>
        
        <div className="p-5 rounded-xl border relative overflow-hidden" style={{ background: 'var(--pm-surface-highest)', borderColor: 'rgba(70,69,84,0.3)' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--pm-on-surface-variant)' }}>
            <Receipt className="text-amber-500 w-4 h-4" />
            <span>Pending Receivables</span>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight mt-2 flex items-baseline gap-2">
            ${pendingInvoicesAmount.toLocaleString()}
          </div>
          {!isClosed && baseGST > 0 && (
            <div className="text-xs mt-1" style={{ color: 'var(--pm-on-surface-variant)' }}>
              (GST Collected: ${baseGST.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})
            </div>
          )}
        </div>

        <div className="p-5 rounded-xl border relative overflow-hidden" style={{ background: 'var(--pm-surface-highest)', borderColor: 'rgba(70,69,84,0.3)' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--pm-on-surface-variant)' }}>
            <TrendingDown className="text-rose-500 w-4 h-4" />
            <span>Salary Cost</span>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight mt-2 flex items-baseline gap-2">
            ${salaryExpenses.toLocaleString()}
            {adjSalary !== 0 && (
              <span className={`text-xs font-medium ${adjSalary > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                ({adjSalary > 0 ? '+' : ''}{adjSalary.toLocaleString()})
              </span>
            )}
          </div>
        </div>

        <div className="p-5 rounded-xl border relative overflow-hidden" style={{ background: 'var(--pm-surface-highest)', borderColor: 'rgba(70,69,84,0.3)' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--pm-on-surface-variant)' }}>
            <Wallet className={netProfit >= 0 ? "text-emerald-500 w-4 h-4" : "text-rose-500 w-4 h-4"} />
            <span>Net Profit</span>
          </div>
          <div className={`text-2xl font-bold font-mono tracking-tight mt-2 ${netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString()}
          </div>
          {isClosed && (adjRevenue !== 0 || adjSalary !== 0 || adjOther !== 0) && (
            <div className="text-xs mt-1" style={{ color: 'var(--pm-on-surface-variant)' }}>
              Orig: ${snapshot?.net_profit?.toLocaleString() || 0}
            </div>
          )}
        </div>
      </div>
      
      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-1">
        
        {/* Adjustments Section - visible if closed and adjustments exist */}
        {isClosed && periodAdjustments.length > 0 ? (
          <div className="rounded-xl border flex flex-col col-span-1 lg:col-span-2" style={{ background: 'var(--pm-surface-highest)', borderColor: 'rgba(70,69,84,0.3)' }}>
            <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: 'rgba(70,69,84,0.3)' }}>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-500" />
                <h3 className="font-semibold text-sm">Adjustment History</h3>
              </div>
            </div>
            <div className="divide-y" style={{ borderColor: 'rgba(70,69,84,0.3)' }}>
              {periodAdjustments.map(adj => (
                <div key={adj.id} className="p-4 flex items-center justify-between hover:bg-black/5 transition-colors">
                  <div>
                    <div className="text-sm font-medium">{adj.reason}</div>
                    <div className="text-xs mt-1 capitalize" style={{ color: 'var(--pm-on-surface-variant)' }}>
                      {adj.type} Correction • {new Date(adj.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono font-medium ${adj.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {adj.amount >= 0 ? '+' : ''}{Number(adj.amount).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border flex flex-col" style={{ background: 'var(--pm-surface-highest)', borderColor: 'rgba(70,69,84,0.3)' }}>
          <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: 'rgba(70,69,84,0.3)' }}>
            <h3 className="font-semibold text-sm">Recent Invoices</h3>
          </div>
          <div className="p-0">
            {data.invoices.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: 'var(--pm-on-surface-variant)' }}>No invoices created yet.</div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'rgba(70,69,84,0.3)' }}>
                {data.invoices.slice(0, 5).map(inv => (
                  <div key={inv.id} className="p-4 flex items-center justify-between hover:bg-black/5 transition-colors">
                    <div>
                      <div className="font-mono text-sm">{inv.invoice_number}</div>
                      <div className="text-xs mt-1" style={{ color: 'var(--pm-on-surface-variant)' }}>{new Date(inv.issue_date).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right flex items-center gap-4">
                      <div>
                        <div className="font-mono font-medium">${Number(inv.grand_total || inv.amount).toLocaleString()}</div>
                        <div className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full inline-block mt-1
                          ${inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 
                            inv.status === 'overdue' ? 'bg-rose-500/10 text-rose-500' : 
                            inv.status === 'partial' ? 'bg-blue-500/10 text-blue-500' :
                            'bg-amber-500/10 text-amber-500'}`}>
                          {inv.status}
                        </div>
                      </div>
                      <button 
                        onClick={async () => {
                          try {
                            const client = data.clients.find(c => c.id === inv.client_id);
                            const comp = data.companyProfile;
                            if (comp && client) {
                              await generateInvoicePDF(comp, client, inv, inv.line_items || []);
                            } else {
                              alert("Missing company profile or client details.");
                            }
                          } catch(err) {
                            console.error(err);
                          }
                        }}
                        className="p-1.5 text-text-tertiary hover:text-emerald-400 transition-colors"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border flex flex-col" style={{ background: 'var(--pm-surface-highest)', borderColor: 'rgba(70,69,84,0.3)' }}>
          <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: 'rgba(70,69,84,0.3)' }}>
            <h3 className="font-semibold text-sm">Expenses (This Month)</h3>
          </div>
          <div className="p-0">
            {data.expenses.filter(e => isCurrentMonth(e.date)).length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: 'var(--pm-on-surface-variant)' }}>No expenses logged this month.</div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'rgba(70,69,84,0.3)' }}>
                {data.expenses.filter(e => isCurrentMonth(e.date)).slice(0, 5).map(exp => (
                  <div key={exp.id} className="p-4 flex items-center justify-between hover:bg-black/5 transition-colors">
                    <div>
                      <div className="text-sm font-medium">{exp.description}</div>
                      <div className="text-xs mt-1 capitalize" style={{ color: 'var(--pm-on-surface-variant)' }}>{exp.category} • {new Date(exp.date).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-medium text-rose-500">-${Number(exp.amount).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Adjustment Modal */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-border/50">
              <h2 className="text-lg font-semibold text-[var(--pm-on-surface)]">Add Adjustment</h2>
              <button onClick={() => setShowAdjustmentModal(false)} className="text-[var(--pm-on-surface-variant)] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--pm-on-surface)' }}>Type</label>
                <select 
                  value={adjustmentForm.type} 
                  onChange={e => setAdjustmentForm({ ...adjustmentForm, type: e.target.value })}
                  className="w-full bg-surface-highest border border-border rounded-lg px-3 py-2 text-sm outline-none"
                >
                  <option value="revenue">Revenue</option>
                  <option value="salary">Salary</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--pm-on-surface)' }}>Amount ($)</label>
                <input 
                  type="number" 
                  value={adjustmentForm.amount} 
                  onChange={e => setAdjustmentForm({ ...adjustmentForm, amount: e.target.value })}
                  placeholder="e.g. -500 or 1200"
                  className="w-full bg-surface-highest border border-border rounded-lg px-3 py-2 text-sm outline-none"
                />
                <p className="text-xs mt-1" style={{ color: 'var(--pm-on-surface-variant)' }}>Use negative values for deductions.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--pm-on-surface)' }}>Reason</label>
                <input 
                  type="text" 
                  value={adjustmentForm.reason} 
                  onChange={e => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })}
                  placeholder="e.g. Server Cost Correction"
                  className="w-full bg-surface-highest border border-border rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
              <button 
                onClick={submitAdjustment}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors mt-4"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {workspace && (
        <CreateInvoiceModal 
          isOpen={showInvoiceModal}
          onClose={() => setShowInvoiceModal(false)}
          workspaceId={workspace.id}
          clients={clients}
          companyProfile={data.companyProfile}
          onSuccess={() => { loadData(); fetchClients(workspace.id).then(setClients); }}
        />
      )}

      {/* Manage Clients Modal */}
      {workspace && (
        <ManageClientsModal
          isOpen={showManageClientsModal}
          onClose={() => setShowManageClientsModal(false)}
          workspaceId={workspace.id}
          clients={clients}
          onSuccess={() => { fetchClients(workspace.id).then(setClients); loadData(); }}
        />
      )}
    </div>
  );
}
