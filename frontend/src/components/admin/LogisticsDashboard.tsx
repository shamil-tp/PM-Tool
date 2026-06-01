import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Shield, Terminal, Lock, X, AlertTriangle, Download, Settings, Users, ArrowRight, Sliders, Calendar, Search, Check, BrainCircuit, Info, Calculator, TrendingDown, Banknote, Edit2, Truck, Cpu, Layers, Clock } from 'lucide-react';
import { User, Project, Team, Profile, Task, UserRole } from '../../types';
import { hasCapability } from '../../core/auth/permissions';
import { getLocalDateString } from '../../utils/timeUtils';
import { MemberDirectory } from '../team/MemberDirectory';
import { supabase } from '../../lib/supabase';
import { DocumentGeneratorDropdown } from '../hr/DocumentGeneratorDropdown';

export function LogisticsDashboard({
  profiles,
  teams,
  projects = [],
  tasks = [],
  updateTask,
  systemData,
  onSaveData,
  role,
  defaultTab,
  hideTabs
}: {
  profiles: Profile[],
  teams: Team[],
  projects?: Project[],
  tasks?: Task[],
  updateTask?: (taskId: string, updates: Partial<Task>) => Promise<void>,
  systemData: any,
  onSaveData: (updatedData: any) => Promise<void>,
  role?: UserRole,
  defaultTab?: 'members' | 'attendance' | 'paySlab' | 'payroll' | 'workload',
  hideTabs?: boolean
}) {
  // systemData is passed from canonical DashboardContext
  const [activeTab, setActiveTab] = useState<'members' | 'attendance' | 'paySlab' | 'payroll' | 'workload'>(defaultTab || 'members');
  const canConfigurePaySlabs = hasCapability(role as UserRole | undefined, 'manage_compensation');

  // Attendance states
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [attendanceSearch, setAttendanceSearch] = useState('');

  // Pay Slab form states
  const [allowedCasualLeaves, setAllowedCasualLeaves] = useState(2);
  const [allowedMedicalLeaves, setAllowedMedicalLeaves] = useState(2);
  const [halfDayRule, setHalfDayRule] = useState(2);
  const [unexcusedDeductionAmount, setUnexcusedDeductionAmount] = useState(100);
  const [deductionMethod, setDeductionMethod] = useState<'fixed' | 'pro_rata'>('fixed');
  const [currency, setCurrency] = useState<'USD' | 'INR' | 'EUR' | 'CAD' | 'AED'>('USD');
  const [bypassHalfDay, setBypassHalfDay] = useState(false);

  // workload/workload States
  const [routingTaskId, setRoutingTaskId] = useState<string | null>(null);
  const [routingTaskSearch, setRoutingTaskSearch] = useState('');

  const currencySymbols: Record<string, string> = {
    USD: '$',
    INR: '₹',
    EUR: '€',
    CAD: 'C$',
    AED: 'د.إ'
  };

  const activeSymbol = currencySymbols[currency] || '$';

  // Payroll states
  const [payrollMode, setPayrollMode] = useState<'monthly' | 'custom'>('monthly');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  const [compensationRecords, setCompensationRecords] = useState<Record<string, number>>({});
  const [isFetchingCompensation, setIsFetchingCompensation] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    return (today.getMonth() + 1).toString().padStart(2, '0');
  });
  const [selectedYear, setSelectedYear] = useState(() => {
    const today = new Date();
    return today.getFullYear().toString();
  });

  useEffect(() => {
    if (hasCapability(role, 'manage_compensation') && (activeTab === 'payroll' || activeTab === 'paySlab')) {
      const fetchComp = async () => {
        setIsFetchingCompensation(true);
        try {
          // Calculate period bounds
          const periodStart = `${selectedYear}-${selectedMonth}-01T00:00:00Z`;
          const nextMonthDate = new Date(parseInt(selectedYear), parseInt(selectedMonth), 1);
          const periodEnd = nextMonthDate.toISOString();

          const { data } = await supabase.from('compensation_records')
            .select('employee_id, base_salary, effective_from')
            .lte('effective_from', periodEnd)
            .or(`effective_to.is.null,effective_to.gte.${periodStart}`)
            .order('effective_from', { ascending: false });

          if (data) {
            const records: Record<string, number> = {};
            data.forEach(row => {
              // Because we order by effective_from DESC, the first matching row for an employee
              // represents the latest active compensation within the period.
              if (!records[row.employee_id]) {
                records[row.employee_id] = Number(row.base_salary);
              }
            });
            setCompensationRecords(records);
          }
        } catch (error) {
          console.error("Failed to fetch compensation:", error);
        } finally {
          setIsFetchingCompensation(false);
        }
      };
      fetchComp();
    }
  }, [role, activeTab, selectedMonth, selectedYear]);

  const [editingSalaryUserId, setEditingSalaryUserId] = useState<string | null>(null);
  const [editingSalaryValue, setEditingSalaryValue] = useState('');
  const [editingSalaryDate, setEditingSalaryDate] = useState(() => getLocalDateString());
  const [editingSalaryReason, setEditingSalaryReason] = useState('');

  // Sync state values when DB systemData updates
  useEffect(() => {
    if (systemData.paySlab) {
      setAllowedCasualLeaves(systemData.paySlab.allowedCasualLeaves ?? 2);
      setAllowedMedicalLeaves(systemData.paySlab.allowedMedicalLeaves ?? 2);
      setHalfDayRule(systemData.paySlab.halfDayRule ?? 2);
      setUnexcusedDeductionAmount(systemData.paySlab.unexcusedDeductionAmount ?? 100);
      setDeductionMethod(systemData.paySlab.deductionMethod ?? 'fixed');
      setCurrency(systemData.paySlab.currency ?? 'USD');
      setBypassHalfDay(systemData.paySlab.bypassHalfDay ?? false);
    }
  }, [systemData]);

  // Calculations for deductions and net payroll
  const monthPrefix = `${selectedYear}-${selectedMonth}`;
  const attendanceRecords = systemData.attendance || {};

  // workload & workload calculations
  const workloadMetrics = useMemo(() => {
    const activeTasks = tasks.filter(t => t.status !== 'done');
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
    const completedTasks = tasks.filter(t => t.status === 'done');
    const workloadRate = completedTasks.length > 0 ? Number((completedTasks.length / Math.max(1, tasks.length) * 100).toFixed(1)) : 76.5;

    // Route overloadedTasks: average in-progress tasks per active developer
    const devs = profiles.filter(p => hasCapability(p.role as UserRole, 'manage_tasks') && !hasCapability(p.role as UserRole, 'manage_projects'));
    const overloadedTasks = devs.length > 0 ? Number((inProgressTasks.length / devs.length).toFixed(1)) : 0;
    
    // Blocked Tasks: high priority active tasks
    const blockedTasks = activeTasks.filter(t => t.priority === 'urgent' || t.priority === 'high').length;
    
    // Pipeline avgTaskTime: average estimated hours of uncompleted tasks
    const totalEstHours = activeTasks.reduce((acc, t) => acc + (Number(t.estimated_hours) || 0), 0);
    const avgTaskTime = activeTasks.length > 0 ? Math.round(totalEstHours / activeTasks.length) : 0;

    return {
      workloadRate,
      overloadedTasks,
      blockedTasks,
      avgTaskTime
    };
  }, [tasks, profiles]);

  // Backlog/Ready queue to route
  const workloadQueue = useMemo(() => {
    return tasks
      .filter(t => (t.status === 'backlog' || t.status === 'ready' || !t.assignee_id))
      .filter(t => t.name.toLowerCase().includes(routingTaskSearch.toLowerCase()))
      .map(t => {
        const projName = projects.find(p => p.id === t.project_id)?.name || 'Global Context';
        return { ...t, projectName: projName };
      });
  }, [tasks, projects, routingTaskSearch]);

  const executionNodes = useMemo(() => {
    const devs = profiles.filter(p => hasCapability(p.role as UserRole, 'manage_tasks'));
    return devs.map(dev => {
      const devTasks = tasks.filter(t => t.assignee_id === dev.id && t.status !== 'done');
      const loadHours = devTasks.reduce((acc, t) => acc + (Number(t.estimated_hours) || 0), 0);
      const capacity = 40; // 40h standard limit
      const utilization = Math.min(150, Math.round((loadHours / capacity) * 100));

      return {
        ...dev,
        name: dev.full_name || dev.email.split('@')[0],
        devTasks,
        loadHours,
        utilization,
        status: utilization > 100 ? 'overload' : utilization > 70 ? 'active' : devTasks.length > 0 ? 'focus' : 'standby'
      };
    });
  }, [profiles, tasks]);

  // Blocked routing warning nodes
  const routingBottlenecks = useMemo(() => {
    return tasks.filter(t => t.status !== 'done' && t.risk === 'high').map(t => {
      const projName = projects.find(p => p.id === t.project_id)?.name || 'Global Project';
      return {
        id: t.id,
        name: t.name,
        projectName: projName,
        priority: t.priority,
        hours: t.estimated_hours
      };
    });
  }, [tasks, projects]);

  const handleRouteTask = async (taskId: string, devId: string) => {
    if (!updateTask) return;
    try {
      await updateTask(taskId, { assignee_id: devId, status: 'in_progress' });
      setRoutingTaskId(null);
    } catch (err) {
      console.error("Routing execution failed:", err);
    }
  };

  const handleAutoBalance = async () => {
    if (!updateTask) return;
    // Find overloaded developers and move some backlog tasks to underloaded developers
    const overloadedDevs = executionNodes.filter(n => n.utilization > 100);
    const underloadedDevs = executionNodes.filter(n => n.utilization < 70);

    if (overloadedDevs.length === 0 || underloadedDevs.length === 0) {
      alert("System load balancing criteria optimal. No actions workloaded.");
      return;
    }

    let balancedCount = 0;
    for (const source of overloadedDevs) {
      const target = underloadedDevs[0];
      const reassignable = source.devTasks.find(t => t.status === 'backlog' || t.status === 'ready');
      if (reassignable && target) {
        await updateTask(reassignable.id, { assignee_id: target.id });
        balancedCount++;
      }
    }
    alert(`workload complete: re-routed ${balancedCount} tasks to balance developer loads.`);
  };

  const payrollData = useMemo(() => {
    const defaultCasual = allowedCasualLeaves;
    const defaultMedical = allowedMedicalLeaves;
    const defaultHalfDayRatio = halfDayRule;

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();

    const targetYear = Number(selectedYear);
    const targetMonth = Number(selectedMonth);

    let isDateInRange = (dateStr: string) => dateStr.startsWith(monthPrefix);

    const allWeekdaysInRange: string[] = [];

    if (payrollMode === 'custom' && customStartDate && customEndDate) {
      const start = new Date(customStartDate);
      const end = new Date(customEndDate);
      if (start <= end) {
        let current = new Date(start);
        while (current <= end) {
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            allWeekdaysInRange.push(getLocalDateString(current));
          }
          current.setDate(current.getDate() + 1);
        }
      }
      isDateInRange = (dateStr: string) => dateStr >= customStartDate && dateStr <= customEndDate;
    } else {
      const startYear = Number(selectedYear);
      const startMonth = Number(selectedMonth);

      let lastDay = 0;
      if (startYear < currentYear || (startYear === currentYear && startMonth < currentMonth)) {
        // Past month: full month
        lastDay = new Date(startYear, startMonth, 0).getDate();
      } else if (startYear === currentYear && startMonth === currentMonth) {
        // Current month: up to current day
        lastDay = currentDay;
      }

      for (let d = 1; d <= lastDay; d++) {
        const dateObj = new Date(startYear, startMonth - 1, d);
        const dayOfWeek = dateObj.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          allWeekdaysInRange.push(getLocalDateString(dateObj));
        }
      }
    }

    return profiles.map(profile => {
      const rawDoj = profile.date_of_joining;
      const joiningDateStr = rawDoj ? getLocalDateString(new Date(rawDoj)) : '';
      
      // Filter weekdays to only those on or after joining date
      const profileWeekdays = allWeekdaysInRange.filter(dateStr => !joiningDateStr || dateStr >= joiningDateStr);
      const expectedWorkingDaysForProfile = profileWeekdays.length;

      let presentCount = 0;
      let halfDayCount = 0;
      let clCount = 0;
      let mlCount = 0;
      let uuCount = 0;
      let unpaidHalfDayCount = 0;

      Object.keys(attendanceRecords).forEach(dateStr => {
        if (isDateInRange(dateStr) && (!joiningDateStr || dateStr >= joiningDateStr)) {
          const dayData = attendanceRecords[dateStr]?.[profile.id];
          if (dayData) {
            if (dayData.status === 'present') {
              presentCount++;
            } else if (dayData.status === 'half_day') {
              halfDayCount++;
              if (dayData.leaveType === 'casual') {
                clCount += 0.5;
              } else if (dayData.leaveType === 'medical') {
                mlCount += 0.5;
              } else if (dayData.isPaidHalfDay) {
                // Paid half day (empathy bypass) - fully paid, no CL/ML or unpaid deductions
              } else {
                unpaidHalfDayCount++;
              }
            } else if (dayData.status === 'absent') {
              if (dayData.leaveType === 'casual') clCount++;
              else if (dayData.leaveType === 'medical') mlCount++;
              else uuCount++;
            }
          }
        }
      });

      const fullMonthlySalary = compensationRecords[profile.id] ?? 3000;
      const dailyRate = fullMonthlySalary / 22;
      const baseSalary = payrollMode === 'custom' ? dailyRate * expectedWorkingDaysForProfile : fullMonthlySalary;

      const totalDaysAccounted = Object.keys(attendanceRecords).reduce((acc, dateStr) => {
        if (isDateInRange(dateStr) && (!joiningDateStr || dateStr >= joiningDateStr) && attendanceRecords[dateStr]?.[profile.id]) {
          return acc + 1;
        }
        return acc;
      }, 0);

      const unmarkedWorkingDays = Math.max(0, expectedWorkingDaysForProfile - totalDaysAccounted);

      // Unmarked days count as present by default
      presentCount += unmarkedWorkingDays;

      const halfDayLeavesConverted = unpaidHalfDayCount / defaultHalfDayRatio;
      const casualExceeded = Math.max(0, clCount - defaultCasual);
      const medicalExceeded = Math.max(0, mlCount - defaultMedical);
      const totalUnpaidDays = casualExceeded + medicalExceeded + halfDayLeavesConverted + uuCount;

      let totalDeductions = 0;
      if (totalUnpaidDays > 0) {
        if (deductionMethod === 'fixed') {
          totalDeductions = totalUnpaidDays * unexcusedDeductionAmount;
        } else {
          totalDeductions = totalUnpaidDays * dailyRate;
        }
      }

      const netPayable = Math.max(0, baseSalary - totalDeductions);

      return {
        profile,
        baseSalary,
        presentCount,
        halfDayCount,
        clCount,
        mlCount,
        uuCount,
        totalUnpaidDays,
        totalDeductions,
        netPayable,
        expectedWorkingDays: expectedWorkingDaysForProfile
      };
    });
  }, [profiles, systemData, monthPrefix, allowedCasualLeaves, allowedMedicalLeaves, halfDayRule, unexcusedDeductionAmount, deductionMethod, bypassHalfDay, payrollMode, customStartDate, customEndDate, compensationRecords]);

  const handleExportCSV = () => {
    const totalGross = payrollData.reduce((sum, item) => sum + item.baseSalary, 0);
    const totalDeductions = payrollData.reduce((sum, item) => sum + item.totalDeductions, 0);
    const totalNet = payrollData.reduce((sum, item) => sum + item.netPayable, 0);

    const headers = [
      'System Profile', 'Base Salary', 'Present Days', 'Half Days',
      'Casual Leaves', 'Medical Leaves', 'Unexcused',
      'Total Unpaid Days', 'Total Deductions', 'Net Payable'
    ];

    const rows = payrollData.map(d => [
      d.profile.full_name || d.profile.email || 'Unknown',
      d.baseSalary.toFixed(2),
      d.presentCount.toFixed(1),
      d.halfDayCount.toString(),
      d.clCount.toFixed(1),
      d.mlCount.toFixed(1),
      d.uuCount.toString(),
      d.totalUnpaidDays.toFixed(1),
      d.totalDeductions.toFixed(2),
      d.netPayable.toFixed(2)
    ]);

    rows.push([]);
    rows.push(['AGGREGATE TOTALS', '', '', '', '', '', '', '', '', '']);
    rows.push(['Total Gross Liability', totalGross.toFixed(2), '', '', '', '', '', '', '', '']);
    rows.push(['Total Deductions', totalDeductions.toFixed(2), '', '', '', '', '', '', '', '']);
    rows.push(['Total Net Payable', totalNet.toFixed(2), '', '', '', '', '', '', '', '']);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    let filename = '';
    if (payrollMode === 'monthly') {
      const monthName = new Date(`${selectedYear}-${selectedMonth}-01`).toLocaleString('default', { month: 'long' });
      filename = `Payroll_Analytics_${monthName}_${selectedYear}.csv`;
    } else {
      filename = `Payroll_Analytics_Custom_${customStartDate}_to_${customEndDate}.csv`;
    }

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleMarkAttendance = async (
    userId: string,
    status: 'present' | 'half_day' | 'absent',
    leaveType?: 'casual' | 'medical' | 'unexcused',
    isPaidHalfDay?: boolean
  ) => {
    const existingAttendance = systemData.attendance || {};
    const dayRecords = { ...(existingAttendance[selectedDate] || {}) };

    if (status === 'absent') {
      dayRecords[userId] = { status, leaveType: leaveType || 'unexcused' };
    } else if (status === 'half_day') {
      dayRecords[userId] = {
        status,
        leaveType: leaveType || 'unexcused',
        isPaidHalfDay: !!isPaidHalfDay
      };
    } else {
      dayRecords[userId] = { status };
    }

    const updatedAttendance = {
      ...existingAttendance,
      [selectedDate]: dayRecords
    };

    await onSaveData({
      ...systemData,
      attendance: updatedAttendance
    });
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const updatedPaySlab = {
      allowedCasualLeaves,
      allowedMedicalLeaves,
      halfDayRule,
      unexcusedDeductionAmount,
      deductionMethod,
      currency,
      bypassHalfDay
    };

    await onSaveData({
      ...systemData,
      paySlab: updatedPaySlab
    });
  };

  const handleSaveSalary = async (userId: string) => {
    const salaryValue = Number(editingSalaryValue) || 0;
    const effectiveFrom = editingSalaryDate || getLocalDateString();
    const reason = editingSalaryReason || 'Manual adjustment';
    const workspaceId = profiles[0]?.workspace_id;
    if (!workspaceId) return;

    try {
      // Find currently active compensation
      const { data: activeRecords } = await supabase
        .from('compensation_records')
        .select('id, effective_from')
        .eq('workspace_id', workspaceId)
        .eq('employee_id', userId)
        .is('effective_to', null);

      if (activeRecords && activeRecords.length > 0) {
        // Validation: Do not allow overlapping periods
        const active = activeRecords[0];
        if (effectiveFrom <= active.effective_from) {
          alert('New compensation effective date must be after the current active compensation start date.');
          return;
        }

        // Close previous compensation (1 day before new effective date)
        const newDateObj = new Date(effectiveFrom);
        newDateObj.setDate(newDateObj.getDate() - 1);
        const effectiveTo = getLocalDateString(newDateObj);

        await supabase
          .from('compensation_records')
          .update({ effective_to: effectiveTo })
          .eq('id', active.id);
      }

      await supabase.from('compensation_records').insert({
        employee_id: userId,
        workspace_id: workspaceId,
        base_salary: salaryValue,
        effective_from: effectiveFrom,
        change_reason: reason
      });

      setCompensationRecords(prev => ({
        ...prev,
        [userId]: salaryValue
      }));
    } catch (e) {
      console.error("Failed to save salary", e);
    }
    
    setEditingSalaryUserId(null);
    setEditingSalaryReason('');
  };

  // Filter profiles for attendance marking
  const filteredProfiles = profiles.filter(p => {
    const rawDoj = p.date_of_joining;
    const joiningDateStr = rawDoj ? getLocalDateString(new Date(rawDoj)) : '';
    if (joiningDateStr && selectedDate < joiningDateStr) {
      return false; // Not yet onboarded on selectedDate
    }
    const searchLower = attendanceSearch.toLowerCase();
    return (
      (p.full_name || '').toLowerCase().includes(searchLower) ||
      p.email.toLowerCase().includes(searchLower)
    );
  });

  // Calculate day summary stats
  const dayAttendance = attendanceRecords[selectedDate] || {};
  const dayStats = useMemo(() => {
    let present = 0;
    let halfDay = 0;
    let absent = 0;
    profiles.forEach(p => {
      const rawDoj = p.date_of_joining;
    const joiningDateStr = rawDoj ? getLocalDateString(new Date(rawDoj)) : '';
      if (joiningDateStr && selectedDate < joiningDateStr) {
        return; // Skip not yet onboarded
      }
      const dayData = dayAttendance[p.id];
      if (dayData) {
        if (dayData.status === 'present') present++;
        else if (dayData.status === 'half_day') halfDay++;
        else if (dayData.status === 'absent') absent++;
      } else {
        // Default to present for unmarked profiles
        present++;
      }
    });
    return { present, halfDay, absent };
  }, [dayAttendance, profiles, selectedDate]);

  return (
    <main className="w-full pb-16">
      {/* Visual Section Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
        
        {/* Tab Selector */}
        {!hideTabs && (
        <div className="flex flex-wrap gap-2 bg-surface-3/50 backdrop-blur-md p-1.5 border border-border/50 rounded-xl w-full md:w-auto max-w-full shadow-sm" role="tablist" aria-label="Team Management sections">
            <button
              onClick={() => setActiveTab('members')}
              role="tab"
              aria-selected={activeTab === 'members'}
              aria-controls="tabpanel-members"
              id="tab-members"
              className={`flex-1 md:flex-initial text-center whitespace-nowrap px-3 sm:px-4 py-2 text-[9px] sm:text-[10px] font-mono uppercase tracking-wide transition-all ${activeTab === 'members' ? 'bg-[var(--pm-inverse-surface)] text-[var(--pm-inverse-on-surface)] font-semibold' : 'text-text-tertiary hover:text-text-primary'}`}
            >
              Members
            </button>
            <button
            onClick={() => setActiveTab('workload')}
            role="tab"
            aria-selected={activeTab === 'workload'}
            aria-controls="tabpanel-workload"
            id="tab-workload"
            className={`flex-1 md:flex-initial text-center whitespace-nowrap px-3 sm:px-4 py-2 text-[9px] sm:text-[10px] font-mono uppercase tracking-wide transition-all ${activeTab === 'workload' ? 'bg-[var(--pm-inverse-surface)] text-[var(--pm-inverse-on-surface)] font-semibold' : 'text-text-tertiary hover:text-text-primary'}`}
          >
            workload &amp; Routing
          </button>
          <button
            onClick={() => setActiveTab('attendance')}
            role="tab"
            aria-selected={activeTab === 'attendance'}
            aria-controls="tabpanel-attendance"
            id="tab-attendance"
            className={`flex-1 md:flex-initial text-center whitespace-nowrap px-3 sm:px-4 py-2 text-[9px] sm:text-[10px] font-mono uppercase tracking-wide transition-all ${activeTab === 'attendance' ? 'bg-[var(--pm-surface)] text-[var(--pm-text)] font-semibold' : 'text-text-tertiary hover:text-text-primary'}`}
          >
            Attendance
          </button>
          {hasCapability(role, 'manage_compensation') && (
              <button
                onClick={() => setActiveTab('paySlab')}
                role="tab"
                aria-selected={activeTab === 'paySlab'}
                aria-controls="tabpanel-paySlab"
                id="tab-paySlab"
                className={`flex-1 md:flex-initial text-center whitespace-nowrap px-3 sm:px-4 py-2 text-[9px] sm:text-[10px] font-mono uppercase tracking-wide transition-all ${activeTab === 'paySlab' ? 'bg-[var(--pm-surface)] text-[var(--pm-text)] font-semibold' : 'text-text-tertiary hover:text-text-primary'}`}
              >
                Rules &amp; Slabs
              </button>
            )}
            {hasCapability(role, 'manage_compensation') && (
            <button
              onClick={() => setActiveTab('payroll')}
              role="tab"
              aria-selected={activeTab === 'payroll'}
              aria-controls="tabpanel-payroll"
              id="tab-payroll"
              className={`flex-1 md:flex-initial text-center whitespace-nowrap px-3 sm:px-4 py-2 text-[9px] sm:text-[10px] font-mono uppercase tracking-wide transition-all ${activeTab === 'payroll' ? 'bg-[var(--pm-surface)] text-[var(--pm-text)] font-semibold' : 'text-text-tertiary hover:text-text-primary'}`}
            >
              Payroll Compliance
            </button>
            )}
        </div>
        )}
      </div>

      {/* Tab Contents */}
      <AnimatePresence mode="wait">
        {activeTab === 'workload' && (
          <motion.div
            key="workload"
            role="tabpanel"
            id="tabpanel-workload"
            aria-labelledby="tab-workload"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            {/* Real-time Logistics system Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="border border-border/50 bg-surface-3/50 backdrop-blur-md p-6 rounded-2xl shadow-sm hover:shadow-md transition-all">
                <p className="text-[10px] font-bold uppercase text-text-tertiary tracking-wider mb-2">Queue overloadedTasks</p>
                <p className="text-3xl font-extrabold tracking-tight text-indigo-400">{workloadMetrics.overloadedTasks} <span className="text-sm font-medium text-text-tertiary">tasks/node</span></p>
              </div>
              <div className="border border-border/50 bg-surface-3/50 backdrop-blur-md p-6 rounded-2xl shadow-sm hover:shadow-md transition-all">
                <p className="text-[10px] font-bold uppercase text-text-tertiary tracking-wider mb-2">workload Rate</p>
                <p className="text-3xl font-extrabold tracking-tight text-cyan-400">{workloadMetrics.workloadRate}%</p>
              </div>
              <div className="border border-border/50 bg-surface-3/50 backdrop-blur-md p-6 rounded-2xl shadow-sm hover:shadow-md transition-all">
                <p className="text-[10px] font-bold uppercase text-text-tertiary tracking-wider mb-2">Pipeline avgTaskTime</p>
                <p className="text-3xl font-extrabold tracking-tight text-accent-secondary">~{workloadMetrics.avgTaskTime} <span className="text-sm font-medium text-text-tertiary">h/task</span></p>
              </div>
              <div className="border border-border/50 bg-surface-3/50 backdrop-blur-md p-6 rounded-2xl shadow-sm hover:shadow-md transition-all">
                <p className="text-[10px] font-bold uppercase text-text-tertiary tracking-wider mb-2">Blocked Tasks</p>
                <p className="text-3xl font-extrabold tracking-tight text-rose-400">{workloadMetrics.blockedTasks} <span className="text-sm font-medium text-text-tertiary">issues</span></p>
              </div>
            </div>

            {/* Core workload layout: Queue list and node board */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Backlog workload queue */}
              <div className="lg:col-span-1 border border-border/50 bg-surface-3/50 backdrop-blur-md p-6 rounded-2xl flex flex-col justify-between h-[34rem] shadow-sm">
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-border-subtle">
                    <div>
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">workload Queue</h4>
                      <p className="text-[8px] font-mono text-text-quaternary uppercase">Unassigned payload backlog</p>
                    </div>
                    <span className="text-[9px] font-mono bg-[var(--pm-surface)]/5 px-2 py-0.5 border border-border-subtle text-text-tertiary">
                      {workloadQueue.length} queued
                    </span>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
                    <input
                      type="text"
                      placeholder="Query queue..."
                      value={routingTaskSearch}
                      onChange={e => setRoutingTaskSearch(e.target.value)}
                      className="w-full bg-bg border border-border h-8 pl-8 pr-3 text-[11px] font-mono text-text-primary outline-none focus:border-indigo-400/40 rounded-sm"
                    />
                  </div>

                  <div className="space-y-2 overflow-y-auto max-h-[22rem] pr-1">
                    {workloadQueue.length === 0 ? (
                      <div className="py-20 text-center text-[10px] font-mono uppercase text-text-quaternary italic">
                        No unallocated payloads detected
                      </div>
                    ) : (
                      workloadQueue.map(task => (
                        <div key={task.id} className="p-3 border border-border-subtle bg-surface-3 hover:bg-surface-3 rounded-sm space-y-2 relative transition-all">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[10px] font-semibold text-text-secondary truncate block w-40">{task.name}</span>
                            <span className={`text-[7px] font-extrabold px-1 border rounded-sm uppercase ${task.priority === 'urgent' || task.priority === 'high' ? 'border-rose-500/20 bg-rose-500/10 text-rose-400' : 'border-border-subtle bg-[var(--pm-surface)]/5 text-text-quaternary'}`}>
                              {task.priority}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center text-[8px] font-mono text-text-quaternary uppercase">
                            <span>Project: {task.projectName}</span>
                            <span>Weight: {task.estimated_hours}h</span>
                          </div>

                          <div className="pt-2 border-t border-border-subtle flex gap-2">
                            <button
                              onClick={() => setRoutingTaskId(routingTaskId === task.id ? null : task.id)}
                              className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-500 text-text-primary font-mono text-[9px] uppercase tracking-wide transition-all rounded-sm"
                            >
                              {routingTaskId === task.id ? 'Cancel Routing' : 'Route workload'}
                            </button>
                          </div>

                          {/* Quick Router drop-panel */}
                          {routingTaskId === task.id && (
                            <div className="mt-2 p-2 bg-bg border border-border rounded-sm space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                              <p className="text-[7.5px] font-mono text-text-quaternary uppercase tracking-wide mb-1">Target workload node</p>
                              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                {executionNodes.map(node => (
                                  <button
                                    key={node.id}
                                    onClick={() => handleRouteTask(task.id, node.id)}
                                    className="w-full text-left p-1.5 border border-border-subtle hover:border-indigo-400/30 bg-[var(--pm-surface)]/5 hover:bg-indigo-900/10 rounded-sm text-[9px] font-mono text-text-secondary hover:text-text-primary flex justify-between items-center"
                                  >
                                    <span className="truncate w-24 font-bold">{node.name}</span>
                                    <span className="text-[8px] text-text-quaternary font-semibold">{node.utilization}% load ({node.devTasks.length} tasks)</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border-t border-border-subtle pt-3">
                  <button
                    onClick={handleAutoBalance}
                    className="w-full py-2 bg-[var(--pm-surface)]/5 hover:bg-[var(--pm-surface)]/10 border border-border text-text-primary text-[9px] font-medium uppercase tracking-wide transition-all rounded-sm flex items-center justify-center gap-2"
                  >
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Auto-Balance System Load
                  </button>
                </div>
              </div>

              {/* Execution nodes map */}
              <div className="lg:col-span-2 border border-border/50 bg-surface-3/50 backdrop-blur-md p-6 rounded-2xl h-[34rem] overflow-y-auto space-y-4 shadow-sm">
                <div className="flex justify-between items-center pb-3 border-b border-border-subtle">
                  <div>
                    <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">Execution Nodes</h4>
                    <p className="text-[8px] font-mono text-text-quaternary uppercase">Developer queue load status</p>
                  </div>
                  <span className="text-[9px] font-mono text-text-quaternary uppercase">Standard Limit: 40h</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {executionNodes.map(node => {
                    const barColors = {
                      overload: 'bg-rose-500',
                      active: 'bg-amber-500',
                      focus: 'bg-indigo-500',
                      standby: 'bg-[var(--pm-surface)]/10'
                    };

                    const textColors = {
                      overload: 'text-rose-400 font-bold',
                      active: 'text-signal-warning',
                      focus: 'text-indigo-400',
                      standby: 'text-text-quaternary'
                    };

                    return (
                      <div key={node.id} className="border border-border-subtle bg-bg p-4 rounded-sm space-y-3 flex flex-col justify-between font-mono text-[10px]">
                        <div className="flex justify-between items-start border-b border-border-subtle pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-text-secondary">{node.name}</span>
                            <span className="text-[8px] uppercase text-text-quaternary">({node.role})</span>
                          </div>
                          <span className={`text-[9px] uppercase ${textColors[node.status]}`}>{node.status}</span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[9px] text-text-tertiary uppercase">
                            <span>Capacity Load</span>
                            <span>{node.loadHours}h / 40h ({node.utilization}%)</span>
                          </div>
                          <div className="h-1.5 w-full bg-[var(--pm-surface)]/5 rounded-full overflow-hidden">
                            <div className={`h-full ${barColors[node.status]} transition-all`} style={{ width: `${node.utilization}%` }} />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[8px] text-text-quaternary uppercase block">Active workload Queue</span>
                          {node.devTasks.length === 0 ? (
                            <span className="text-[8.5px] italic text-text-quaternary uppercase">Standby: Awaiting workload</span>
                          ) : (
                            <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                              {node.devTasks.map(t => (
                                <div key={t.id} className="p-1 border border-border-subtle bg-[var(--pm-surface)]/5 flex justify-between items-center rounded-sm text-[8px] text-text-secondary">
                                  <span className="truncate w-32 font-medium">{t.name}</span>
                                  <span className="text-text-quaternary uppercase">{t.status}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </motion.div>
        )}
        {activeTab === 'members' && (
          <motion.div
            key="members"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            role="tabpanel"
            id="tabpanel-members"
            aria-labelledby="tab-members"
            className="w-full"
          >
            <MemberDirectory />
          </motion.div>
        )}

        {activeTab === 'attendance' && (
          <motion.div
            key="attendance"
            role="tabpanel"
            id="tabpanel-attendance"
            aria-labelledby="tab-attendance"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            {/* Header controls for Attendance */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center bg-surface-3/50 backdrop-blur-md border border-border/50 p-6 rounded-2xl shadow-sm">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">Tracking Target Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-bg border border-border h-11 pl-10 pr-4 text-sm font-mono text-text-primary focus:border-white/30 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">Query Profiles</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <input
                    type="text"
                    placeholder="Search name or email..."
                    value={attendanceSearch}
                    onChange={(e) => setAttendanceSearch(e.target.value)}
                    className="w-full bg-bg border border-border h-11 pl-10 pr-4 text-sm font-mono text-text-primary focus:border-white/30 outline-none transition-all placeholder:text-text-quaternary"
                  />
                </div>
              </div>

              {/* Day stats counters */}
              <div className="flex gap-4 items-center justify-between border-t border-border-subtle lg:border-t-0 lg:border-l lg:border-border pt-4 lg:pt-0 lg:pl-8 h-full">
                <div className="text-center flex-1">
                  <p className="text-[9px] font-mono text-text-tertiary uppercase tracking-wide mb-1">PRESENT</p>
                  <p className="text-2xl font-bold text-signal-safe font-sans tracking-tight">{dayStats.present}</p>
                </div>
                <div className="h-8 w-[1px] bg-[var(--pm-surface)]/5"></div>
                <div className="text-center flex-1">
                  <p className="text-[9px] font-mono text-text-tertiary uppercase tracking-wide mb-1">HALF DAY</p>
                  <p className="text-2xl font-bold text-signal-warning font-sans tracking-tight">{dayStats.halfDay}</p>
                </div>
                <div className="h-8 w-[1px] bg-[var(--pm-surface)]/5"></div>
                <div className="text-center flex-1">
                  <p className="text-[9px] font-mono text-text-tertiary uppercase tracking-wide mb-1">ABSENT</p>
                  <p className="text-2xl font-bold text-signal-critical font-sans tracking-tight">{dayStats.absent}</p>
                </div>
              </div>
            </div>

            {/* Attendance Marking Grid */}
            <div className="border border-border bg-surface overflow-hidden">
              <div className="p-6 border-b border-border bg-bg flex justify-between items-center">
                <h3 className="text-xs font-sans tracking-tight uppercase tracking-wide text-text-secondary">Mark System Attendance</h3>
                <span className="text-[9px] font-mono text-text-tertiary bg-[var(--pm-surface)]/5 px-2 py-0.5 border border-border-subtle uppercase">SYSTEM_ACTIVE</span>
              </div>

              <div className="divide-y divide-white/5">
                {filteredProfiles.length === 0 ? (
                  <div className="p-12 text-center text-xs font-mono text-text-tertiary italic">
                    No active system profiles match your search criteria.
                  </div>
                ) : (
                  filteredProfiles.map(profile => {
                    const record = dayAttendance[profile.id];
                    const status = record?.status || 'present';
                    const leaveType = record?.leaveType;

                    return (
                      <div key={profile.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-surface-3 transition-all">
                        {/* User Details */}
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 border border-border bg-[var(--pm-surface)]/5 flex items-center justify-center overflow-hidden">
                            {profile.avatar_url ? (
                              <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                            ) : (
                              <Users className="w-5 h-5 text-text-quaternary" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-text-secondary">{profile.full_name || 'Anonymous User'}</h4>
                              {profile.date_of_joining && (
                                <span className="text-[8px] font-mono bg-surface-3 border border-border text-signal-info px-1.5 py-0.5 rounded-sm" title="Date of Joining">
                                  DOJ: {getLocalDateString(new Date(profile.date_of_joining))}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-mono text-text-tertiary uppercase">{profile.email}</p>
                            <p className="text-[9px] font-mono mt-1"><span className="text-text-quaternary uppercase">Role:</span> <span className="text-signal-info uppercase">{(systemData.userCustomRoles && systemData.userCustomRoles[profile.id]) || profile.role}</span></p>
                          </div>
                        </div>

                        {/* Status marking controls */}
                        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                          {/* Present button */}
                          <button
                            onClick={() => handleMarkAttendance(profile.id, 'present')}
                            className={`w-full sm:w-auto px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider border rounded-sm transition-all ${status === 'present' ? 'bg-signal-safe-bg border-border text-signal-safe font-bold shadow-sm' : 'border-border hover:border-border text-text-tertiary hover:text-text-primary'}`}
                          >
                            Present
                          </button>

                          {/* Half Day split options */}
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center bg-bg border border-border p-1 gap-1 sm:gap-0 w-full sm:w-auto">
                            <button
                              onClick={() => handleMarkAttendance(profile.id, 'half_day', 'unexcused', false)}
                              className={`px-2.5 py-1.5 sm:py-1 text-[9px] font-mono uppercase tracking-wider transition-all ${status === 'half_day' && leaveType === 'unexcused' && !record?.isPaidHalfDay ? 'bg-signal-warning-bg text-signal-warning font-bold' : 'text-text-tertiary hover:text-text-primary'}`}
                            >
                              Half Day (Unpaid)
                            </button>
                            <div className="hidden sm:block w-[1px] h-4 bg-[var(--pm-surface)]/10 mx-1"></div>

                            <button
                              onClick={() => handleMarkAttendance(profile.id, 'half_day', 'unexcused', true)}
                              className={`px-2.5 py-1.5 sm:py-1 text-[9px] font-mono uppercase tracking-wider transition-all ${status === 'half_day' && record?.isPaidHalfDay ? 'bg-signal-safe-bg text-signal-safe font-bold' : 'text-text-tertiary hover:text-text-primary'}`}
                            >
                              Half Day (Paid)
                            </button>
                            <div className="w-[1px] h-4 bg-[var(--pm-surface)]/10 mx-1" style={{ display: 'none' }}></div>

                            <button
                              onClick={() => handleMarkAttendance(profile.id, 'half_day', 'casual', false)} style={{ display: 'none' }}
                              className={`px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider transition-all ${status === 'half_day' && leaveType === 'casual' ? 'bg-surface-3 text-signal-info font-bold' : 'text-text-tertiary hover:text-text-primary'}`}
                            >

                            </button>
                            <div className="w-[1px] h-4 bg-[var(--pm-surface)]/10 mx-1 font-mono" style={{ display: 'none' }}></div>

                            <button
                              onClick={() => handleMarkAttendance(profile.id, 'half_day', 'medical', false)} style={{ display: 'none' }}
                              className={`px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider transition-all ${status === 'half_day' && leaveType === 'medical' ? 'bg-surface-3 text-accent-secondary font-bold' : 'text-text-tertiary hover:text-text-primary'}`}
                            >

                            </button>
                          </div>
                          {/* HIDE_OLD_BUTTON_START */}
                          <button style={{ display: 'none' }}
                            onClick={() => handleMarkAttendance(profile.id, 'half_day')}
                            className={`px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider border rounded-sm transition-all ${status === 'half_day' ? 'bg-signal-warning-bg border-yellow-500 text-signal-warning font-bold shadow-sm' : 'border-border hover:border-border text-text-tertiary hover:text-text-primary'}`}
                          >
                            Half Day
                          </button>

                          {/* Absent Option split */}
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center bg-bg border border-border p-1 gap-1 sm:gap-0 w-full sm:w-auto">
                            <button
                              onClick={() => handleMarkAttendance(profile.id, 'absent', 'unexcused')}
                              className={`px-2.5 py-1.5 sm:py-1 text-[9px] font-mono uppercase tracking-wider transition-all ${status === 'absent' && leaveType === 'unexcused' ? 'bg-signal-critical-bg text-signal-critical font-bold' : 'text-text-tertiary hover:text-text-primary'}`}
                            >
                              Absent (Unpaid)
                            </button>
                            <div className="hidden sm:block w-[1px] h-4 bg-[var(--pm-surface)]/10 mx-1 font-mono"></div>

                            <button
                              onClick={() => handleMarkAttendance(profile.id, 'absent', 'casual')}
                              className={`px-2.5 py-1.5 sm:py-1 text-[9px] font-mono uppercase tracking-wider transition-all ${status === 'absent' && leaveType === 'casual' ? 'bg-surface-3 text-signal-info font-bold' : 'text-text-tertiary hover:text-text-primary'}`}
                            >
                              Casual Leave (CL)
                            </button>
                            <div className="hidden sm:block w-[1px] h-4 bg-[var(--pm-surface)]/10 mx-1"></div>

                            <button
                              onClick={() => handleMarkAttendance(profile.id, 'absent', 'medical')}
                              className={`px-2.5 py-1.5 sm:py-1 text-[9px] font-mono uppercase tracking-wider transition-all ${status === 'absent' && leaveType === 'medical' ? 'bg-surface-3 text-accent-secondary font-bold' : 'text-text-tertiary hover:text-text-primary'}`}
                            >
                              Medical Leave (ML)
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        )}

        {hasCapability(role, 'manage_compensation') && activeTab === 'paySlab' && (
          <motion.div
            key="paySlab"
            role="tabpanel"
            id="tabpanel-paySlab"
            aria-labelledby="tab-paySlab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Rules configurator Form */}
            <div className="lg:col-span-2 border border-border bg-surface p-8 space-y-6">
              <div className="border-b border-border pb-4 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-signal-info" />
                <h3 className="text-sm font-sans tracking-tight uppercase tracking-wide text-text-secondary font-semibold font-bold">Global System Pay Slabs</h3>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Casual Leaves */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">Allowed Paid Casual Leaves (CL) / Month</label>
                    <input
                      type="number"
                      required
                      value={allowedCasualLeaves}
                      onChange={(e) => setAllowedCasualLeaves(Number(e.target.value))}
                      min={0}
                      max={31}
                      className="w-full bg-bg border border-border h-11 px-4 text-sm font-mono text-text-primary focus:border-white/30 outline-none"
                    />
                    <p className="text-[9px] font-mono text-text-quaternary italic">Allocated paid leave allowance per user. Exceeding days trigger deductions.</p>
                  </div>

                  {/* Medical Leaves */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">Allowed Paid Medical Leaves (ML) / Month</label>
                    <input
                      type="number"
                      required
                      value={allowedMedicalLeaves}
                      onChange={(e) => setAllowedMedicalLeaves(Number(e.target.value))}
                      min={0}
                      max={31}
                      className="w-full bg-bg border border-border h-11 px-4 text-sm font-mono text-text-primary focus:border-white/30 outline-none"
                    />
                    <p className="text-[9px] font-mono text-text-quaternary italic">Allocated paid sick/medical leave. Excess days trigger deductions.</p>
                  </div>

                  {/* Half-day Conversion Rule */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">Half-Day Conversion Threshold</label>
                    <input
                      type="number"
                      required
                      value={halfDayRule}
                      onChange={(e) => setHalfDayRule(Number(e.target.value))}
                      min={1}
                      max={10}
                      className="w-full bg-bg border border-border h-11 px-4 text-sm font-mono text-text-primary focus:border-white/30 outline-none"
                    />
                    <p className="text-[9px] font-mono text-text-quaternary italic">Specify how many marked Half-Day absences equal 1 Full-Day leave (e.g. 2 half-days = 1 full day).</p>
                  </div>

                  {/* Half-day Empathy Bypass Toggle */}
                  <div className="flex flex-col gap-2" style={{ display: 'none' }}>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">Half-Day Empathy Bypass</label>
                    <div className="flex items-center gap-3 bg-bg border border-border h-11 px-4">
                      <input
                        type="checkbox"
                        id="bypassHalfDay"
                        checked={bypassHalfDay}
                        onChange={(e) => setBypassHalfDay(e.target.checked)}
                        className="w-4 h-4 accent-white cursor-pointer"
                      />
                      <label htmlFor="bypassHalfDay" className="text-xs font-mono text-text-secondary cursor-pointer select-none">
                        Bypass half-day pay deductions
                      </label>
                    </div>
                    <p className="text-[9px] font-mono text-text-quaternary italic">When enabled, employees will NOT have pay deducted for marked half-day leaves (showing empathy for genuine needs).</p>
                  </div>

                  {/* Currency Selector */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">Global System Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as any)}
                      className="w-full bg-bg border border-border h-11 px-4 text-sm font-mono text-text-primary focus:border-white/30 outline-none"
                    >
                      <option value="USD">USD ($) - US Dollar</option>
                      <option value="INR">INR (₹) - Indian Rupee</option>
                      <option value="EUR">EUR (€) - Euro</option>
                      <option value="CAD">CAD (C$) - Canadian Dollar</option>
                      <option value="AED">AED (د.إ) - UAE Dirham</option>
                    </select>
                    <p className="text-[9px] font-mono text-text-quaternary italic">Set the primary currency used across salary listings, calculations, and deductions.</p>
                  </div>

                  {/* Deduction Method Selector */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">Leave Deduction Calculation Method</label>
                    <select
                      value={deductionMethod}
                      onChange={(e) => setDeductionMethod(e.target.value as any)}
                      className="w-full bg-bg border border-border h-11 px-4 text-sm font-mono text-text-primary focus:border-white/30 outline-none"
                    >
                      <option value="fixed">Fixed Currency Value per Leave Day</option>
                      <option value="pro_rata">Daily Pro-Rata (Base Monthly Salary / 22 Working Days)</option>
                    </select>
                    <p className="text-[9px] font-mono text-text-quaternary italic">Choose whether unexcused leaves deduct a flat fee or calculate dynamic pro-rata daily wage cuts.</p>
                  </div>

                  {/* Fixed Amount input */}
                  {deductionMethod === 'fixed' && (
                    <div className="flex flex-col gap-2 md:col-span-2">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">Flat Deduction Value ({activeSymbol.trim()}) per Excess Leave</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-text-tertiary">{activeSymbol}</span>
                        <input
                          type="number"
                          required
                          value={unexcusedDeductionAmount}
                          onChange={(e) => setUnexcusedDeductionAmount(Number(e.target.value))}
                          min={0}
                          className="w-full bg-bg border border-border h-11 pl-10 pr-4 text-sm font-mono text-text-primary focus:border-white/30 outline-none"
                        />
                      </div>
                      <p className="text-[9px] font-mono text-text-quaternary italic">Configured deduction amount deducted from the user's monthly payload for each exceeding unexcused day.</p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-border flex justify-end">
                  <button
                    type="submit"
                    className="bg-[var(--pm-surface)] text-[var(--pm-text)] font-semibold text-[10px] font-medium uppercase tracking-wide px-8 py-3 hover:bg-neutral-200 transition-colors flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" /> Save Slab System Configuration
                  </button>
                </div>
              </form>
            </div>

            {/* Quick Helper Rules Info panel */}
            <div className="border border-border bg-surface p-8 space-y-6">
              <div className="border-b border-border pb-4 flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-signal-info" />
                <h3 className="text-sm font-sans tracking-tight uppercase tracking-wide text-text-secondary font-semibold font-bold">Formula Analytics</h3>
              </div>

              <div className="space-y-4 text-xs font-mono text-text-secondary leading-relaxed">
                <p>
                  The payroll deduction calculation is computed in real-time using high-fidelity rules matching standard corporate infrastructure:
                </p>
                <div className="border border-border bg-bg p-4 text-[11px] space-y-2">
                  <p className="font-bold text-text-primary">1. Total Unpaid Leave Days (LD):</p>
                  <p className="text-text-tertiary">LD = Excess(CL) + Excess(ML) + (Half-Days / Threshold) + Unexcused Absences</p>

                  <p className="font-bold text-text-primary pt-2">2. Daily Wage Rate (DR):</p>
                  <p className="text-text-tertiary">DR = Base Salary / 22 (Industry average working days)</p>

                  <p className="font-bold text-text-primary pt-2">3. Total Deductions:</p>
                  <p className="text-text-tertiary">If Fixed Method: Deduct = LD * Flat Deduction Amount</p>
                  <p className="text-text-tertiary">If Pro-Rata Method: Deduct = LD * DR</p>
                </div>
                <div className="bg-surface-3 border border-border p-4 flex items-start gap-3">
                  <Info className="w-4 h-4 text-signal-info shrink-0 mt-0.5" />
                  <p className="text-[10px] text-signal-info/90">
                    Paid leave allocations are automatically assigned to all active user roles (both Project Managers and Developers/Viewers) inside the database.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {hasCapability(role, 'manage_compensation') && activeTab === 'payroll' && (
          <motion.div
            key="payroll"
            role="tabpanel"
            id="tabpanel-payroll"
            aria-labelledby="tab-payroll"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            {/* Payroll filters */}
            <div className="flex flex-col md:flex-row gap-6 items-center bg-surface border border-border p-6 justify-between">
              <div>
                <h3 className="text-xs font-sans tracking-tight uppercase tracking-wide text-text-secondary font-semibold font-bold mb-1">Payroll Analytics</h3>
                <p className="text-[10px] font-mono text-text-tertiary uppercase">MONTHLY TEAM COMPENSATION COMPLIANCE</p>
              </div>

              <div className="flex flex-col xl:flex-row items-center gap-4">
                <select
                  value={payrollMode}
                  onChange={(e) => setPayrollMode(e.target.value as any)}
                  className="bg-bg border border-border h-10 px-4 text-xs font-mono text-text-primary focus:border-white/30 outline-none"
                >
                  <option value="monthly">Monthly Cycle</option>
                  <option value="custom">Custom Range</option>
                </select>

                {payrollMode === 'monthly' ? (
                  <>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="bg-bg border border-border h-10 px-4 text-xs font-mono text-text-primary focus:border-white/30 outline-none"
                    >
                      <option value="01">January</option>
                      <option value="02">February</option>
                      <option value="03">March</option>
                      <option value="04">April</option>
                      <option value="05">May</option>
                      <option value="06">June</option>
                      <option value="07">July</option>
                      <option value="08">August</option>
                      <option value="09">September</option>
                      <option value="10">October</option>
                      <option value="11">November</option>
                      <option value="12">December</option>
                    </select>

                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="bg-bg border border-border h-10 px-4 text-xs font-mono text-text-primary focus:border-white/30 outline-none"
                    >
                      <option value="2025">2025</option>
                      <option value="2026">2026</option>
                      <option value="2027">2027</option>
                    </select>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="bg-bg border border-border h-10 px-2 text-xs font-mono text-text-primary focus:border-white/30 outline-none" />
                    <span className="text-text-tertiary text-xs font-mono">to</span>
                    <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="bg-bg border border-border h-10 px-2 text-xs font-mono text-text-primary focus:border-white/30 outline-none" />
                  </div>
                )}

                <button
                  onClick={handleExportCSV}
                  className="bg-[var(--pm-surface)] text-[var(--pm-text)] h-10 px-4 text-[10px] font-medium font-bold uppercase tracking-wide hover:bg-neutral-200 transition-colors flex items-center gap-2 whitespace-nowrap ml-2"
                >
                  <Download className="w-3 h-3" /> Export CSV
                </button>
              </div>
            </div>

            {/* Payroll Aggregate Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-surface border border-border p-6 flex flex-col justify-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Calculator className="w-16 h-16" /></div>
                <p className="text-[10px] font-mono uppercase text-text-tertiary tracking-wide mb-2 relative z-10">Total Gross Liability</p>
                <p className="text-2xl font-sans tracking-tight text-text-primary font-bold relative z-10">{activeSymbol}{payrollData.reduce((sum, item) => sum + item.baseSalary, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-surface border border-red-500/20 p-6 flex flex-col justify-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-signal-critical"><TrendingDown className="w-16 h-16" /></div>
                <p className="text-[10px] font-mono uppercase text-signal-critical/80 tracking-wide mb-2 relative z-10">Total Deductions</p>
                <p className="text-2xl font-sans tracking-tight text-signal-critical font-bold relative z-10">{activeSymbol}{payrollData.reduce((sum, item) => sum + item.totalDeductions, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-signal-safe-bg border border-border p-6 flex flex-col justify-center relative overflow-hidden shadow-sm">
                <div className="absolute top-0 right-0 p-4 opacity-20 text-signal-safe"><Banknote className="w-16 h-16" /></div>
                <p className="text-[10px] font-mono uppercase text-signal-safe tracking-wide mb-2 relative z-10">Total Net Payable</p>
                <p className="text-2xl font-sans tracking-tight text-text-primary font-bold relative z-10">{activeSymbol}{payrollData.reduce((sum, item) => sum + item.netPayable, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* Payroll Data Grid */}
            <div className="border border-border bg-surface overflow-hidden">
              <div className="p-6 border-b border-border bg-bg flex justify-between items-center">
                <h3 className="text-xs font-sans tracking-tight uppercase tracking-wide text-text-secondary font-bold">
                  {payrollMode === 'monthly' ? 'Compiled Month Analytics Sheet' : 'Compiled Custom Range Analytics Sheet'}
                </h3>
                <span className="text-[10px] font-mono text-text-tertiary">Scope: {payrollMode === 'monthly' ? monthPrefix : `${customStartDate || 'TBD'} to ${customEndDate || 'TBD'}`}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse ">
                  <thead>
                    <tr className="border-b border-border bg-surface-3">
                      <th className="p-4 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">System Profile</th>
                      <th className="p-4 text-[10px] font-mono uppercase tracking-wider text-text-tertiary text-right">Base Salary ({activeSymbol.trim()})</th>
                      <th className="p-4 text-[10px] font-mono uppercase tracking-wider text-text-tertiary text-center">Actions</th>
                      <th className="p-4 text-[10px] font-mono uppercase tracking-wider text-text-tertiary text-center">Attendance Summary (Days)</th>
                      <th className="p-4 text-[10px] font-mono uppercase tracking-wider text-text-tertiary text-center">Leaves / Exceeded Allowed</th>
                      <th className="p-4 text-[10px] font-mono uppercase tracking-wider text-text-tertiary text-center font-bold text-signal-critical/90">Deductible Days</th>
                      <th className="p-4 text-[10px] font-mono uppercase tracking-wider text-text-tertiary text-right font-bold text-signal-critical">Total Deductions ({activeSymbol.trim()})</th>
                      <th className="p-4 text-[10px] font-mono uppercase tracking-wider text-text-tertiary text-right font-bold text-signal-safe">Net Payable ({activeSymbol.trim()})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {payrollData.map(({
                      profile,
                      baseSalary,
                      presentCount,
                      halfDayCount,
                      clCount,
                      mlCount,
                      uuCount,
                      totalUnpaidDays,
                      totalDeductions,
                      netPayable,
                      expectedWorkingDays
                    }) => {
                      const isEditing = editingSalaryUserId === profile.id;

                      return (
                        <tr key={profile.id} className="hover:bg-surface-3 transition-all">
                          {/* Profile */}
                          <td className="p-4 flex items-center gap-3">
                            <div className="w-8 h-8 border border-border bg-[var(--pm-surface)]/5 flex items-center justify-center overflow-hidden shrink-0">
                              {profile.avatar_url ? (
                                <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                              ) : (
                                <Users className="w-4 h-4 text-text-quaternary" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h4 className="text-xs font-semibold text-text-secondary">{profile.full_name || 'Anonymous User'}</h4>
                                {profile.date_of_joining && (
                                  <span className="text-[7.5px] font-mono bg-surface-3 border border-border text-signal-info px-1 py-0.2 rounded-sm" title={`Joined: ${getLocalDateString(new Date(profile.date_of_joining))}`}>
                                    DOJ: {getLocalDateString(new Date(profile.date_of_joining))}
                                  </span>
                                )}
                              </div>
                              <p className="text-[9px] font-mono text-text-tertiary uppercase">{profile.email}</p>
                            </div>
                          </td>

                          {/* Base Salary (Editable) */}
                          <td className="p-4 text-right">
                            {isEditing ? (
                              <div className="flex flex-col gap-1.5 justify-end w-48 ml-auto">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    placeholder="Amount"
                                    value={editingSalaryValue}
                                    onChange={(e) => setEditingSalaryValue(e.target.value)}
                                    className="flex-1 bg-bg border border-border px-2 py-1 text-xs font-mono text-right text-text-primary focus:border-border-subtle0 outline-none"
                                  />
                                  <input
                                    type="date"
                                    value={editingSalaryDate}
                                    onChange={(e) => setEditingSalaryDate(e.target.value)}
                                    className="w-[100px] bg-bg border border-border px-2 py-1 text-[10px] font-mono text-text-primary focus:border-border-subtle0 outline-none"
                                  />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    placeholder="Reason for change"
                                    value={editingSalaryReason}
                                    onChange={(e) => setEditingSalaryReason(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveSalary(profile.id)}
                                    className="flex-1 bg-bg border border-border px-2 py-1 text-xs font-mono text-text-primary focus:border-border-subtle0 outline-none"
                                  />
                                  <button
                                    onClick={() => handleSaveSalary(profile.id)}
                                    className="p-1 border border-border bg-signal-safe-bg text-signal-safe hover:bg-signal-safe-bg shrink-0"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-2 group/sal">
                                <span className="font-mono text-xs text-text-secondary">{activeSymbol}{baseSalary.toLocaleString()}</span>
                                <button
                                  onClick={() => {
                                    setEditingSalaryUserId(profile.id);
                                    setEditingSalaryValue(baseSalary.toString());
                                  }}
                                  className="opacity-0 group-hover/sal:opacity-100 p-1 hover:bg-[var(--pm-surface)]/5 text-text-tertiary hover:text-text-primary transition-all"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </td>

                          {/* HR Actions */}
                          <td className="p-4 text-center">
                            <DocumentGeneratorDropdown
                              workspaceId={profile.workspace_id}
                              type="salary_slip"
                              companyName="Your Company"
                              buttonText="Slip"
                              fileName={`Salary_Slip_${profile.full_name.replace(/\s+/g, '_')}_${payrollMode === 'monthly' ? monthPrefix : 'Custom'}`}
                              data={{
                                employee_name: profile.full_name,
                                month: payrollMode === 'monthly' ? monthPrefix : 'Custom Period',
                                net_pay: netPayable.toLocaleString(),
                                deductions: totalDeductions.toLocaleString(),
                                base_salary: baseSalary.toLocaleString()
                              }}
                            />
                          </td>

                          {/* Attendance */}
                          <td className="p-4 text-center">
                            <div className="flex flex-col items-center gap-1 font-mono">
                              <div className="flex items-center justify-center gap-2 text-[10px]">
                                <span className="bg-signal-safe-bg text-signal-safe px-2 py-0.5 border border-border" title="Present Days">P: {presentCount}</span>
                                <span className="bg-signal-warning-bg text-signal-warning px-2 py-0.5 border border-yellow-500/15" title="Half Days">HD: {halfDayCount}</span>
                                <span className="bg-signal-critical-bg text-signal-critical px-2 py-0.5 border border-red-500/15" title="Unexcused Absences">UU: {uuCount}</span>
                              </div>
                              <span className="text-[8px] text-text-quaternary uppercase tracking-wider">Bandwidth: {expectedWorkingDays} working days</span>
                            </div>
                          </td>

                          {/* Leaves */}
                          <td className="p-4 text-center">
                            <div className="flex flex-col items-center justify-center gap-1 text-[9px] font-mono">
                              <div>
                                <span className="text-text-tertiary">CL: {clCount}</span>
                                <span className="text-text-quaternary"> / Allowed: {allowedCasualLeaves}</span>
                              </div>
                              <div>
                                <span className="text-text-tertiary">ML: {mlCount}</span>
                                <span className="text-text-quaternary"> / Allowed: {allowedMedicalLeaves}</span>
                              </div>
                            </div>
                          </td>

                          {/* Deductible Days */}
                          <td className="p-4 text-center font-bold font-mono text-xs text-signal-critical">
                            {totalUnpaidDays > 0 ? `${totalUnpaidDays.toFixed(1)} Days` : '0 Days'}
                          </td>

                          {/* Deductions */}
                          <td className="p-4 text-right font-mono text-xs text-signal-critical font-bold">
                            {totalDeductions > 0 ? `-${activeSymbol}${totalDeductions.toFixed(2)}` : `${activeSymbol}0.00`}
                          </td>

                          {/* Net Payable */}
                          <td className="p-4 text-right font-mono text-xs text-signal-safe font-bold">
                            {activeSymbol}{netPayable.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
