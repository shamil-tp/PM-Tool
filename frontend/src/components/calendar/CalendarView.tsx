import React, { useState, useEffect, useMemo } from 'react';
import { Calendar as CalendarIcon, Plus, Trash2, Edit2, X, RefreshCw, ChevronLeft, ChevronRight, Grid, List } from 'lucide-react';
import { calendarService, CalendarEvent } from '../../services/calendarService';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useOperationalData } from '../../context/OperationalDataContext';

interface EventFormData {
  summary: string;
  description: string;
  start: string;
  end: string;
  visibility: 'private' | 'global' | 'team';
  team_id: string;
}

// Timezone-aware date string builder for datetime-local inputs
const toLocalISOString = (date: Date) => {
  const tzoffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzoffset).toISOString().slice(0, 16);
};

export function CalendarView() {
  const { user, profile } = useAuth();
  const { workspace } = useWorkspace();
  const { teams } = useOperationalData();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // View states
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  
  const [formData, setFormData] = useState<EventFormData>({
    summary: '',
    description: '',
    start: toLocalISOString(new Date()),
    end: toLocalISOString(new Date(Date.now() + 3600000)),
    visibility: 'private',
    team_id: ''
  });

  const notifyToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    window.dispatchEvent(
      new CustomEvent('notify-toast', {
        detail: { message, type }
      })
    );
  };

  const fetchEvents = async () => {
    setLoading(true);
    setError('');
    try {
      if (!workspace?.id) return;
      
      // Default to showing past month and next 3 months
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      const data = await calendarService.getEvents(workspace.id, startDate, endDate);
      setEvents(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Could not fetch events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspace?.id) {
      fetchEvents();
    }
  }, [workspace?.id]);

  const handleOpenModal = (event?: CalendarEvent) => {
    if (event) {
      // If it is a company event or holiday, and user is not admin/PM, block editing
      const isCompanyEvent = event.sourceType === 'company' || event.sourceType === 'holiday' || event.sourceType === 'festival';
      const isReadOnlyRole = profile?.role === 'viewer';
      if (isCompanyEvent && profile?.role !== 'pm' && profile?.role !== 'super_admin') {
        notifyToast("Only PMs and Admins can modify company/global events.", "info");
        return;
      }
      if (isReadOnlyRole) {
        notifyToast("Viewers cannot modify events.", "info");
        return;
      }
      
      setEditingEvent(event);
      setFormData({
        summary: event.summary,
        description: event.description || '',
        start: toLocalISOString(new Date(event.start)),
        end: toLocalISOString(new Date(event.end)),
        visibility: event.visibility || 'private',
        team_id: event.team_id || ''
      });
    } else {
      if (profile?.role === 'viewer') {
        notifyToast("Viewers cannot create events.", "info");
        return;
      }
      setEditingEvent(null);
      setFormData({
        summary: '',
        description: '',
        start: toLocalISOString(new Date()),
        end: toLocalISOString(new Date(Date.now() + 3600000)),
        visibility: 'private',
        team_id: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenModalForDate = (date: Date) => {
    if (profile?.role === 'viewer') return;
    setEditingEvent(null);
    
    const start = new Date(date);
    start.setHours(9, 0, 0, 0);
    
    const end = new Date(date);
    end.setHours(10, 0, 0, 0);
    
    setFormData({
      summary: '',
      description: '',
      start: toLocalISOString(start),
      end: toLocalISOString(end),
      visibility: 'private',
      team_id: ''
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!workspace?.id) throw new Error("No active workspace");

      if (editingEvent) {
        await calendarService.updateEvent(editingEvent.id, {
          ...formData,
          start: new Date(formData.start).toISOString(),
          end: new Date(formData.end).toISOString()
        });
        notifyToast('Event updated successfully.', 'success');
      } else {
        await calendarService.createEvent({
          ...formData,
          workspace_id: workspace.id,
          event_type: 'meeting',
          title: formData.summary,
          start: new Date(formData.start).toISOString(),
          end: new Date(formData.end).toISOString(),
          start_date: new Date(formData.start).toISOString(),
          end_date: new Date(formData.end).toISOString()
        } as any);
        notifyToast('Event created successfully.', 'success');
      }
      setIsModalOpen(false);
      fetchEvents();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save event');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    setLoading(true);
    try {
      await calendarService.deleteEvent(id);
      notifyToast('Event deleted.', 'success');
      fetchEvents();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to delete event');
    } finally {
      setLoading(false);
    }
  };

  // Month grid calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0: Sun, 1: Mon, etc.
  const prevMonthDays = new Date(year, month, 0).getDate();

  const days = useMemo(() => {
    const tempDays = [];
    
    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      tempDays.push({
        day: prevMonthDays - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, prevMonthDays - i)
      });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      tempDays.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i)
      });
    }
    
    // Next month padding
    const remaining = 42 - tempDays.length;
    for (let i = 1; i <= remaining; i++) {
      tempDays.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i)
      });
    }
    
    return tempDays;
  }, [currentDate, daysInMonth, firstDayIndex, prevMonthDays]);

  const getDayEvents = (date: Date) => {
    const cellStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const cellEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
    
    return events.filter(e => {
      const eventStart = new Date(e.start).getTime();
      return eventStart >= cellStart && eventStart <= cellEnd;
    });
  };

  const getEventBadgeStyle = (event: CalendarEvent) => {
    const type = (event.sourceType || 'meeting').toLowerCase();
    if (type === 'holiday' || type === 'festival' || type === 'regional' || type === 'company') {
      return 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20';
    }
    if (event.visibility === 'global') {
      return 'bg-blue-500/10 border-blue-500/20 text-blue-500 hover:bg-blue-500/20';
    }
    if (event.visibility === 'team') {
      return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20';
    }
    // Default Private
    return 'bg-amber-500/10 border-amber-500/20 text-amber-500 hover:bg-amber-500/20';
  };

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 border-b border-outline-variant gap-4 bg-surface-container-lowest">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-primary" />
            Scheduling & Calendar
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Personal scheduling, team events, and holidays synchronized in one view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-surface-container rounded-lg p-1 border border-outline-variant mr-2">
            <button
              onClick={() => setViewMode('month')}
              className={`p-1.5 rounded transition-all ${viewMode === 'month' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
              title="Month View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-all ${viewMode === 'list' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button 
            onClick={fetchEvents}
            className="p-2 bg-surface-container hover:bg-surface-container-high rounded text-on-surface-variant transition-colors"
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {profile?.role !== 'viewer' && (
            <button
              onClick={() => handleOpenModal()}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-on-primary rounded text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Event</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        {error && (
          <div className="m-6 p-4 bg-error/10 border border-error/20 text-error rounded-lg">
            {error}
          </div>
        )}

        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center h-60">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : viewMode === 'month' ? (
          /* Month Grid View */
          <div className="flex-1 flex flex-col p-2 sm:p-6 min-h-0">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
                <h2 className="text-xl font-semibold text-on-surface">
                  {currentDate.toLocaleString('default', { month: 'long' })} {year}
                </h2>
                <div className="flex items-center bg-surface-container rounded-lg p-1 border border-outline-variant">
                  <button
                    onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                    className="p-1.5 hover:bg-surface-container-high rounded text-on-surface-variant transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentDate(new Date())}
                    className="px-3 py-1 text-xs font-semibold text-on-surface hover:bg-surface-container-high rounded transition-colors"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                    className="p-1.5 hover:bg-surface-container-high rounded text-on-surface-variant transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-xs font-medium text-on-surface-variant">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-amber-500/20 border border-amber-500/30" />
                  Private Meetings
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500/30" />
                  Team Events
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-blue-500/20 border border-blue-500/30" />
                  Global Events
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-rose-500/20 border border-rose-500/30" />
                  Holidays
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col border border-outline-variant rounded-xl overflow-hidden bg-surface-container-lowest shadow-inner">
              {/* Days of week header */}
              <div className="grid grid-cols-7 border-b border-outline-variant bg-surface-container-low text-center">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                  <div key={day} className="py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                    <span className="hidden sm:inline">{day}</span>
                    <span className="sm:hidden">{day.charAt(0)}</span>
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="flex-1 grid grid-cols-7 auto-rows-fr">
                {days.map((d, index) => {
                  const cellEvents = getDayEvents(d.date);
                  const isToday = new Date().toDateString() === d.date.toDateString();
                  
                  return (
                    <div
                      key={index}
                      className={`min-h-[60px] sm:min-h-[80px] p-1 sm:p-2 border-r border-b border-outline-variant/40 flex flex-col group relative transition-colors ${
                        d.isCurrentMonth ? 'bg-surface-container-lowest' : 'bg-surface-container-low/10 text-on-surface-variant/40'
                      } hover:bg-surface-container-high/20`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                            isToday ? 'bg-primary text-on-primary shadow-sm' : d.isCurrentMonth ? 'text-on-surface' : 'text-on-surface-variant/40'
                          }`}>
                            {d.day}
                          </span>
                          {!d.isCurrentMonth && (
                            <span className="text-[10px] font-semibold text-on-surface-variant/30 uppercase tracking-wider">
                              {d.date.toLocaleString('default', { month: 'short' })}
                            </span>
                          )}
                        </div>
                        
                        {profile?.role !== 'viewer' && d.isCurrentMonth && (
                          <button
                            onClick={() => handleOpenModalForDate(d.date)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-surface-container-high rounded text-primary transition-all duration-200"
                            title="Add Event"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      
                      <div className="flex-1 overflow-y-auto pr-0.5 scrollbar-thin flex flex-row flex-wrap sm:flex-col content-start gap-1 sm:gap-1 max-h-[48px] sm:max-h-full">
                        {cellEvents.map(event => (
                          <button
                            key={event.id}
                            onClick={() => handleOpenModal(event)}
                            className={`sm:w-full text-left text-[10px] sm:px-2 sm:py-1 rounded-full sm:rounded border border-transparent sm:border-current/10 transition-all truncate flex items-center justify-center sm:justify-start font-medium ${getEventBadgeStyle(event)}`}
                            title={event.summary}
                          >
                            <span className="hidden sm:inline truncate">{event.summary || '(No Title)'}</span>
                            <span className="sm:hidden w-1.5 h-1.5 rounded-full inline-block bg-current" />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : events.length === 0 ? (
          /* List View empty state */
          <div className="flex flex-col items-center justify-center h-60 text-on-surface-variant">
            <CalendarIcon className="w-12 h-12 opacity-20 mb-4" />
            <p>No events found for the upcoming period.</p>
            {profile?.role !== 'viewer' && (
              <button
                onClick={() => handleOpenModal()}
                className="mt-4 px-4 py-2 text-sm text-primary hover:bg-primary/10 rounded transition-colors"
              >
                Create your first event
              </button>
            )}
          </div>
        ) : (
          /* List View Cards */
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {events.map((event) => {
              const startDate = new Date(event.start);
              const endDate = new Date(event.end);
              return (
                <div key={event.id} className="p-4 bg-surface-container-lowest border border-outline-variant rounded-xl hover:border-primary/30 transition-all group flex flex-col h-full shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-on-surface truncate pr-2" title={event.summary}>
                      {event.summary || '(No title)'}
                    </h3>
                    {profile?.role !== 'viewer' && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleOpenModal(event)}
                          className="p-1 hover:bg-surface-container rounded text-on-surface-variant"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(event.id)}
                          className="p-1 hover:bg-error/10 hover:text-error rounded text-on-surface-variant"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-xs text-on-surface-variant mb-3 flex flex-col gap-1">
                    <span>{startDate.toLocaleDateString()}</span>
                    <span>
                      {startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                  
                  {event.description && (
                    <p className="text-sm text-on-surface-variant line-clamp-3 mt-auto pt-3 border-t border-outline-variant/30">
                      {event.description}
                    </p>
                  )}
                  
                  {event.sourceType && (
                    <div className="mt-3 flex justify-between items-center text-[9px] uppercase font-mono tracking-wider">
                      <span className="text-on-surface-variant">Type:</span>
                      <span className={`px-2 py-0.5 rounded-full border ${getEventBadgeStyle(event)}`}>
                        {event.visibility || 'Private'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Event Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-surface-container-high w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-outline-variant flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-4 border-b border-outline-variant">
              <h2 className="font-semibold text-on-surface">{editingEvent ? 'Edit Event' : 'New Event'}</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-surface-container rounded text-on-surface-variant transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-4 flex flex-col gap-4">
              <div>
                <label className="block text-xs uppercase font-mono text-on-surface-variant mb-1">Title</label>
                <input 
                  type="text" 
                  value={formData.summary}
                  onChange={e => setFormData({...formData, summary: e.target.value})}
                  className="w-full bg-surface border border-outline-variant rounded-lg p-2.5 text-on-surface focus:border-primary outline-none"
                  required
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs uppercase font-mono text-on-surface-variant mb-1">Start Time</label>
                  <input 
                    type="datetime-local" 
                    value={formData.start}
                    onChange={e => setFormData({...formData, start: e.target.value})}
                    className="w-full bg-surface border border-outline-variant rounded-lg p-2.5 text-on-surface focus:border-primary outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase font-mono text-on-surface-variant mb-1">End Time</label>
                  <input 
                    type="datetime-local" 
                    value={formData.end}
                    onChange={e => setFormData({...formData, end: e.target.value})}
                    className="w-full bg-surface border border-outline-variant rounded-lg p-2.5 text-on-surface focus:border-primary outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase font-mono text-on-surface-variant mb-1">Visibility</label>
                <select 
                  value={formData.visibility}
                  onChange={e => setFormData({...formData, visibility: e.target.value as any})}
                  className="w-full bg-surface border border-outline-variant rounded-lg p-2.5 text-on-surface focus:border-primary outline-none"
                >
                  <option value="private">Private (Only You)</option>
                  {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
                    <option value="global">Global (All Users)</option>
                  )}
                  {(profile?.role === 'pm' || profile?.role === 'admin' || profile?.role === 'super_admin') && (
                    <option value="team">Team (Specific Team)</option>
                  )}
                </select>
              </div>

              {formData.visibility === 'team' && (
                <div>
                  <label className="block text-xs uppercase font-mono text-on-surface-variant mb-1">Team</label>
                  <select 
                    value={formData.team_id}
                    onChange={e => setFormData({...formData, team_id: e.target.value})}
                    className="w-full bg-surface border border-outline-variant rounded-lg p-2.5 text-on-surface focus:border-primary outline-none"
                    required={formData.visibility === 'team'}
                  >
                    <option value="">Select a team...</option>
                    {teams?.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div>
                <label className="block text-xs uppercase font-mono text-on-surface-variant mb-1">Description (Optional)</label>
                <textarea 
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-surface border border-outline-variant rounded-lg p-2.5 text-on-surface focus:border-primary outline-none min-h-[100px] resize-y"
                />
              </div>
              
              <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-outline-variant">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 hover:bg-surface-container rounded-lg font-medium text-sm text-on-surface transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 rounded-lg font-medium text-sm text-on-primary transition-colors disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
