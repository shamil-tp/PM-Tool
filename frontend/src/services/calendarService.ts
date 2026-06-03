import { supabase } from '../lib/supabase';

const RAW_URL = ((import.meta as any).env.VITE_CALENDAR_API_URL || 'http://localhost:5001').replace(/\/$/, '');
const API_BASE_URL = RAW_URL.endsWith('/api/calendar') ? RAW_URL.replace('/api/calendar', '') : RAW_URL;
const CALENDAR_API_URL = `${API_BASE_URL}/api/calendar`;

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  sourceType?: string;
  sourceKey?: string;
}

export interface UpsertParams {
  sourceType: string;
  sourceKey: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
}

const getHeaders = () => {
  let token = '';
  try {
    const raw = localStorage.getItem('sb-resolve-pm-token');
    const supabaseSessionStr = localStorage.getItem('sb-' + ((import.meta as any).env.VITE_SUPABASE_URL ? new URL((import.meta as any).env.VITE_SUPABASE_URL).hostname.split('.')[0] : '') + '-auth-token');
    if (supabaseSessionStr) {
      const session = JSON.parse(supabaseSessionStr);
      token = session?.access_token || '';
    }
  } catch (e) {
    console.warn(e);
  }
  
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export const calendarService = {
  getAuthUrl(): string {
    let token = '';
    try {
      const supabaseSessionStr = localStorage.getItem('sb-' + ((import.meta as any).env.VITE_SUPABASE_URL ? new URL((import.meta as any).env.VITE_SUPABASE_URL).hostname.split('.')[0] : '') + '-auth-token');
      if (supabaseSessionStr) {
        const session = JSON.parse(supabaseSessionStr);
        token = session?.access_token || '';
      }
    } catch (e) {
      console.warn(e);
    }
    return `${CALENDAR_API_URL}/auth/google${token ? `?token=${token}` : ''}`;
  },

  async getConfig(): Promise<{ googleOAuthEnabled: boolean }> {
    try {
      const response = await fetch(`${CALENDAR_API_URL}/config`, {
        headers: getHeaders()
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('[calendarService] getConfig failed:', e);
    }
    return { googleOAuthEnabled: true }; // default true
  },

  async getEvents(workspaceId: string, startDate: string, endDate: string): Promise<CalendarEvent[]> {
    try {
      const { calendarEventService } = await import('./calendarEventService');
      const events = await calendarEventService.getEventsInRange(workspaceId, startDate, endDate);
      return events.map(row => ({
        id: row.id,
        summary: row.title || 'Meeting',
        description: row.description || '',
        start: row.start_date,
        end: row.end_date,
        sourceType: row.event_type || 'meeting',
        sourceKey: row.source_id || row.id
      }));
    } catch (e: any) {
      console.warn('[calendarService] getEvents failed:', e);
      throw new Error(e.message || 'Failed to fetch events');
    }
  },

  async createEvent(event: Omit<CalendarEvent, 'id'> & { workspace_id?: string; event_type?: string }): Promise<CalendarEvent> {
    try {
      const { calendarEventService } = await import('./calendarEventService');
      const created = await calendarEventService.createEvent({
        workspace_id: event.workspace_id || '',
        title: event.summary,
        description: event.description,
        start_date: event.start,
        end_date: event.end,
        event_type: event.event_type || 'meeting'
      } as any);

      if (!created) throw new Error("Failed to create event");

      return {
        id: created.id,
        summary: created.title,
        description: created.description || '',
        start: created.start_date,
        end: created.end_date,
        sourceType: created.event_type,
        sourceKey: created.id
      };
    } catch (e: any) {
      console.warn('[calendarService] createEvent failed:', e);
      throw e;
    }
  },

  async updateEvent(id: string, event: Partial<CalendarEvent>): Promise<CalendarEvent> {
    try {
      const { calendarEventService } = await import('./calendarEventService');
      const updates: any = {};
      if (event.summary !== undefined) updates.title = event.summary;
      if (event.description !== undefined) updates.description = event.description;
      if (event.start !== undefined) updates.start_date = event.start;
      if (event.end !== undefined) updates.end_date = event.end;

      await calendarEventService.updateEvent(id, updates);
      
      return {
        id,
        summary: event.summary || 'Meeting',
        description: event.description || '',
        start: event.start || new Date().toISOString(),
        end: event.end || new Date().toISOString(),
        sourceType: 'meeting',
        sourceKey: id
      };
    } catch (e: any) {
      console.warn('[calendarService] updateEvent failed:', e);
      throw e;
    }
  },

  async deleteEvent(id: string): Promise<void> {
    try {
      const { calendarEventService } = await import('./calendarEventService');
      // workspaceId is required by deleteEvent signature but we might not have it here easily.
      // We will pass an empty string and the backend will just delete by ID.
      await calendarEventService.deleteEvent(id, '');
    } catch (e: any) {
      console.warn('[calendarService] deleteEvent failed:', e);
      throw e;
    }
  },

  async upsertEvent(params: UpsertParams & { workspace_id?: string }): Promise<CalendarEvent> {
    try {
      const { calendarEventService } = await import('./calendarEventService');
      const result = await calendarEventService.upsertBySourceKey({
        workspace_id: params.workspace_id || '',
        title: params.summary,
        description: params.description,
        start_date: params.start,
        end_date: params.end,
        event_type: params.sourceType,
        source_id: params.sourceKey,
        source_table: 'integration'
      } as any);

      if (!result.event) throw new Error("Failed to upsert event");
      const data = result.event;

      return {
        id: data.id,
        summary: data.title,
        description: data.description || '',
        start: data.start_date,
        end: data.end_date,
        sourceType: data.event_type,
        sourceKey: data.source_id || data.id
      };
    } catch (e: any) {
      console.warn('[calendarService] upsertEvent failed:', e);
      throw new Error(e.message || 'Failed to upsert event');
    }
  }
};
