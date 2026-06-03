import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { activityLogService } from './activityLogService';
import { logServiceFailure } from '../utils/supabaseError';
import { sha256 } from '../utils/cryptoUtils';
import type { CalendarEvent, CalendarEventType } from '../types';

/**
 * Resolved base URL for the calendar backend API.
 * Falls back to http://localhost:5001/api/calendar so the URL never silently
 * becomes the string "undefined/events/..." when the env var is missing.
 */
const RAW_URL = (import.meta.env.VITE_CALENDAR_API_URL || 'http://localhost:5001').replace(/\/$/, '');
const CALENDAR_API_BASE = RAW_URL.endsWith('/api/calendar') ? RAW_URL : `${RAW_URL}/api/calendar`;

interface RecurrenceRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  byday?: string[];
  interval: number;
  until?: string;
  count?: number;
}

function parseRecurrenceRule(rule: string): RecurrenceRule {
  const parts = rule.split(';');
  const parsed: RecurrenceRule = { freq: 'WEEKLY', interval: 1 };
  for (const p of parts) {
    const [key, val] = p.split('=');
    if (key === 'FREQ') parsed.freq = val as RecurrenceRule['freq'];
    else if (key === 'BYDAY') parsed.byday = val.split(',');
    else if (key === 'INTERVAL') parsed.interval = parseInt(val, 10) || 1;
    else if (key === 'UNTIL') parsed.until = val;
    else if (key === 'COUNT') parsed.count = parseInt(val, 10) || 0;
  }
  return parsed;
}

function getNthWeekdayOfMonth(year: number, month: number, nth: number, dayOfWeek: number): number | null {
  const firstDay = new Date(year, month, 1).getDay();
  let count = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month, d).getDay() === dayOfWeek) {
      count++;
      if (count === nth) return d;
    }
  }
  return null;
}

function generateOccurrences(
  rule: RecurrenceRule,
  rangeStart: Date,
  rangeEnd: Date,
  baseDurationMs: number
): Array<{ start: Date; end: Date }> {
  const results: Array<{ start: Date; end: Date }> = [];
  const untilDate = rule.until ? new Date(rule.until) : new Date(rangeEnd);
  const effectiveEnd = untilDate < rangeEnd ? untilDate : rangeEnd;
  let generated = 0;
  const maxOccurrences = rule.count || 365;

  if (rule.freq === 'DAILY') {
    const current = new Date(rangeStart);
    while (current <= effectiveEnd && generated < maxOccurrences) {
      results.push({ start: new Date(current), end: new Date(current.getTime() + baseDurationMs) });
      current.setDate(current.getDate() + rule.interval);
      generated++;
    }
  } else if (rule.freq === 'WEEKLY') {
    const current = new Date(rangeStart);
    const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    const targetDays = rule.byday ? rule.byday.map(d => dayMap[d]) : [dayMap[rangeStart.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()]];
    const weekStart = new Date(rangeStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    while (weekStart <= effectiveEnd && generated < maxOccurrences) {
      for (const day of targetDays) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + day);
        if (d >= rangeStart && d <= effectiveEnd) {
          results.push({ start: new Date(d), end: new Date(d.getTime() + baseDurationMs) });
          generated++;
          if (generated >= maxOccurrences) break;
        }
      }
      weekStart.setDate(weekStart.getDate() + 7 * rule.interval);
    }
  } else if (rule.freq === 'MONTHLY') {
    const current = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (current <= effectiveEnd && generated < maxOccurrences) {
      if (rule.byday && rule.byday.length > 0) {
        for (const bd of rule.byday) {
          const match = bd.match(/^(-?\d+)(SU|MO|TU|WE|TH|FR|SA)$/);
          if (match) {
            const nth = parseInt(match[1], 10);
            const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
            const dayOfWeek = dayMap[match[2]];
            const day = getNthWeekdayOfMonth(current.getFullYear(), current.getMonth(), nth, dayOfWeek);
            if (day !== null) {
              const d = new Date(current.getFullYear(), current.getMonth(), day);
              if (d >= rangeStart && d <= effectiveEnd) {
                results.push({ start: new Date(d), end: new Date(d.getTime() + baseDurationMs) });
                generated++;
              }
            }
          }
        }
      } else {
        const d = new Date(current.getFullYear(), current.getMonth(), rangeStart.getDate());
        if (d >= rangeStart && d <= effectiveEnd) {
          results.push({ start: new Date(d), end: new Date(d.getTime() + baseDurationMs) });
          generated++;
        }
      }
      current.setMonth(current.getMonth() + rule.interval);
    }
  } else if (rule.freq === 'YEARLY') {
    const current = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (current <= effectiveEnd && generated < maxOccurrences) {
      const d = new Date(current.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
      if (d >= rangeStart && d <= effectiveEnd) {
        results.push({ start: new Date(d), end: new Date(d.getTime() + baseDurationMs) });
        generated++;
      }
      current.setFullYear(current.getFullYear() + rule.interval);
    }
  }

  return results;
}

function overlapMinutes(
  eventStart: Date,
  eventEnd: Date,
  dayStart: Date,
  dayEnd: Date
): number {
  const overlapStart = eventStart > dayStart ? eventStart : dayStart;
  const overlapEnd = eventEnd < dayEnd ? eventEnd : dayEnd;
  if (overlapStart >= overlapEnd) return 0;
  return (overlapEnd.getTime() - overlapStart.getTime()) / 60000;
}

export const calendarEventService = {
  /**
   * Idempotent write by (workspace_id, source_table, source_id).
   * Inserts only when missing; restores soft-deleted rows; patches metadata when present.
   */
  async upsertBySourceKey(
    event: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>,
    actorId?: string,
  ): Promise<{ event: CalendarEvent | null; created: boolean }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${CALENDAR_API_BASE}/events/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(event)
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return { event: data.event, created: data.created };
    } catch (e) {
      console.error('upsertBySourceKey error:', e);
      return { event: null, created: false };
    }
  },

  async createEvent(
    event: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>,
    actorId?: string
  ): Promise<CalendarEvent | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${CALENDAR_API_BASE}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(event)
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch (e) {
      console.error('createEvent error:', e);
      return null;
    }
  },

  async updateEvent(id: string, updates: Partial<CalendarEvent>, actorId?: string): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${CALENDAR_API_BASE}/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (e) {
      console.error('updateEvent error:', e);
      return false;
    }
  },

  async deleteEvent(id: string, workspaceId: string, actorId?: string): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${CALENDAR_API_BASE}/events/${id}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (e) {
      console.error('deleteEvent error:', e);
      return false;
    }
  },

  async getEventsInRange(
    workspaceId: string,
    startDate: string,
    endDate: string,
    eventType?: CalendarEventType
  ): Promise<CalendarEvent[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      let url: URL;
      if (CALENDAR_API_BASE.startsWith('http://') || CALENDAR_API_BASE.startsWith('https://')) {
        url = new URL(`${CALENDAR_API_BASE}/events`);
      } else {
        url = new URL(`${CALENDAR_API_BASE}/events`, window.location.origin);
      }
      url.searchParams.append('workspace_id', workspaceId);
      url.searchParams.append('start_date', startDate);
      url.searchParams.append('end_date', endDate);
      if (eventType) url.searchParams.append('event_type', eventType);

      try {
        const localUserStr = localStorage.getItem('local_user');
        if (localUserStr) {
          const profile = JSON.parse(localUserStr);
          if (profile.role) {
            url.searchParams.append('role', profile.role);
          }
        }
      } catch (e) {}
      
      const res = await fetch(url.toString(), {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (!res.ok) throw new Error(await res.text());
      const events = await res.json() as CalendarEvent[];
      return this.expandRecurringEventsInRange(events, startDate, endDate);
    } catch (e) {
      console.error('getEventsInRange error:', e);
      return [];
    }
  },

  async getEventsForUser(
    workspaceId: string,
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<CalendarEvent[]> {
    const events = await this.getEventsInRange(workspaceId, startDate, endDate);
    return events.filter(e => !e.participants || e.participants.length === 0 || e.participants.includes(userId));
  },

  async getEffectiveCapacity(
    workspaceId: string,
    startDate: string,
    endDate: string,
    baseHoursPerDay: number,
    workingDays: number[],
    userId?: string,
    timezone?: string,
    workStart?: string,
    workEnd?: string
  ): Promise<{ totalCapacity: number; deductedHours: number; events: CalendarEvent[] }> {
    const events = userId
      ? await this.getEventsForUser(workspaceId, userId, startDate, endDate)
      : await this.getEventsInRange(workspaceId, startDate, endDate);

    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T00:00:00Z');
    let totalDays = 0;
    const d = new Date(start);
    while (d <= end) {
      let dayOfWeek: number;
      if (timezone) {
        const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
        const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        dayOfWeek = map[formatter.format(d)] ?? d.getUTCDay();
      } else {
        dayOfWeek = d.getUTCDay();
      }
      if (workingDays.includes(dayOfWeek)) totalDays++;
      d.setUTCDate(d.getUTCDate() + 1);
      d.setUTCHours(0, 0, 0, 0);
    }

    const workStartMin = workStart ? (() => { const [h, m] = workStart.split(':').map(Number); return h * 60 + m; })() : 0;
    const workEndMin = workEnd ? (() => { const [h, m] = workEnd.split(':').map(Number); return h * 60 + m; })() : 24 * 60;

    let totalDeduction = 0;
    const appliedEvents: CalendarEvent[] = [];

    for (const event of events) {
      const es = new Date(event.start_date);
      const ee = new Date(event.end_date);
      const modifier = event.capacity_modifier ?? 1;
      const effectiveImpact = event.capacity_impact * modifier;

      if (event.event_type === 'holiday' || event.event_type === 'festival') {
        const holidayDays = Math.max(1, Math.ceil((ee.getTime() - es.getTime()) / 86400000));
        let workingHolidayDays = 0;
        for (let d = 0; d < holidayDays; d++) {
          const day = new Date(es);
          day.setUTCDate(day.getUTCDate() + d);
          let dayOfWeek: number;
          if (timezone) {
            const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
            const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
            dayOfWeek = map[formatter.format(day)] ?? day.getUTCDay();
          } else {
            dayOfWeek = day.getUTCDay();
          }
          if (workingDays.includes(dayOfWeek)) workingHolidayDays++;
        }
        totalDeduction += baseHoursPerDay * workingHolidayDays;
        if (workingHolidayDays > 0) appliedEvents.push(event);
        continue;
      }

      const eventMidnightStart = new Date(es);
      eventMidnightStart.setHours(0, 0, 0, 0);
      const eventMidnightEnd = new Date(ee);
      eventMidnightEnd.setHours(0, 0, 0, 0);
      const eventDayCount = Math.max(1, Math.ceil((eventMidnightEnd.getTime() - eventMidnightStart.getTime()) / 86400000));

      for (let dayOffset = 0; dayOffset < eventDayCount; dayOffset++) {
        const dayStart = new Date(eventMidnightStart);
        dayStart.setDate(dayStart.getDate() + dayOffset);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const dayOfWeek = dayStart.getUTCDay();
        if (!workingDays.includes(dayOfWeek)) continue;

        const workDayStart = new Date(dayStart);
        workDayStart.setHours(Math.floor(workStartMin / 60), workStartMin % 60, 0, 0);
        const workDayEnd = new Date(dayStart);
        workDayEnd.setHours(Math.floor(workEndMin / 60), workEndMin % 60, 0, 0);

        const overlapMin = overlapMinutes(es, ee, workDayStart, workDayEnd);
        if (overlapMin <= 0) continue;

        const overlapHours = overlapMin / 60;
        const deductionForDay = overlapHours * effectiveImpact;
        totalDeduction += deductionForDay;
      }

      appliedEvents.push(event);
    }

    const baseCapacity = totalDays * baseHoursPerDay;
    return {
      totalCapacity: Math.max(0, baseCapacity - totalDeduction),
      deductedHours: totalDeduction,
      events: appliedEvents
    };
  },

  async getEventConfidence(
    workspaceId: string,
    startDate: string,
    endDate: string,
    baseHoursPerDay: number,
    workingDays: number[],
    timezone?: string,
    workStart?: string,
    workEnd?: string
  ): Promise<number> {
    const { totalCapacity, deductedHours } = await this.getEffectiveCapacity(
      workspaceId, startDate, endDate, baseHoursPerDay, workingDays, undefined, timezone, workStart, workEnd
    );
    const totalPossible = totalCapacity + deductedHours;
    if (totalPossible <= 0) return 0;
    const ratio = totalCapacity / totalPossible;
    return Math.round(ratio * 100);
  },

  async createRecurringEvent(
    baseEvent: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at' | 'is_recurring' | 'auto_generated' | 'recurrence_rule'> & { recurrence_rule: string },
    rangeStart: string,
    rangeEnd: string,
    actorId?: string
  ): Promise<CalendarEvent[]> {
    const rule = parseRecurrenceRule(baseEvent.recurrence_rule);
    const baseDuration = new Date(baseEvent.end_date).getTime() - new Date(baseEvent.start_date).getTime();
    const occurrences = generateOccurrences(rule, new Date(rangeStart), new Date(rangeEnd), Math.max(3600000, baseDuration));

    const created: CalendarEvent[] = [];
    for (const occ of occurrences) {
      const event = await this.createEvent({
        ...baseEvent,
        start_date: occ.start.toISOString(),
        end_date: occ.end.toISOString(),
        is_recurring: true,
        recurrence_rule: baseEvent.recurrence_rule,
        auto_generated: true
      }, actorId);
      if (event) created.push(event);
    }
    return created;
  },

  expandRecurringEventsInRange(
    events: CalendarEvent[],
    rangeStart: string,
    rangeEnd: string
  ): CalendarEvent[] {
    const staticEvents: CalendarEvent[] = [];
    const recurringTemplates: CalendarEvent[] = [];
    for (const e of events) {
      if (e.is_recurring && e.recurrence_rule && e.auto_generated) {
        staticEvents.push(e);
      } else if (e.is_recurring && e.recurrence_rule && !e.auto_generated) {
        recurringTemplates.push(e);
      } else {
        staticEvents.push(e);
      }
    }

    for (const template of recurringTemplates) {
      const rule = parseRecurrenceRule(template.recurrence_rule!);
      const baseDuration = new Date(template.end_date).getTime() - new Date(template.start_date).getTime();
      const occurrences = generateOccurrences(rule, new Date(rangeStart), new Date(rangeEnd), Math.max(3600000, baseDuration));
      for (const occ of occurrences) {
        staticEvents.push({
          ...template,
          start_date: occ.start.toISOString(),
          end_date: occ.end.toISOString(),
          auto_generated: true
        });
      }
    }

    staticEvents.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    return staticEvents;
  }
};
