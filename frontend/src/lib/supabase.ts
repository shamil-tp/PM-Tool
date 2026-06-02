// Custom API Shim to replace @supabase/supabase-js
// This ensures all 88 frontend files continue to work without modification,
// while routing all data requests to our custom Express core backend.

const CORE_BACKEND_URL = 'http://localhost:5003/api';

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.url = new URL(`${CORE_BACKEND_URL}/${table}`);
    this.method = 'GET';
    this.body = null;
    this.isSingle = false;
  }

  select(columns = '*') {
    this.method = 'GET';
    this.url.searchParams.append('select', columns);
    return this;
  }

  insert(data) {
    this.method = 'POST';
    this.body = data;
    return this;
  }

  update(data) {
    this.method = 'PATCH'; // Standard REST for partial update
    this.body = data;
    return this;
  }

  delete() {
    this.method = 'DELETE';
    return this;
  }

  eq(column, value) {
    this.url.searchParams.append(column, `eq.${value}`);
    return this;
  }

  neq(column, value) {
    this.url.searchParams.append(column, `neq.${value}`);
    return this;
  }

  in(column, values) {
    this.url.searchParams.append(column, `in.(${values.join(',')})`);
    return this;
  }

  contains(column, value) {
    this.url.searchParams.append(column, `cs.${JSON.stringify(value)}`);
    return this;
  }

  order(column, options = { ascending: true }) {
    this.url.searchParams.append('order', `${column}.${options.ascending ? 'asc' : 'desc'}`);
    return this;
  }

  limit(count) {
    this.url.searchParams.append('limit', count);
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    return this;
  }

  // Promise resolution automatically triggers the fetch
  async then(resolve, reject) {
    try {
      const token = localStorage.getItem('jwt_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };

      const response = await fetch(this.url.toString(), {
        method: this.method,
        headers,
        body: this.body ? JSON.stringify(this.body) : undefined,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        return resolve({ data: null, error: errorData });
      }

      let data = await response.json();
      
      if (this.isSingle && Array.isArray(data)) {
        data = data.length > 0 ? data[0] : null;
      }

      resolve({ data, error: null });
    } catch (err) {
      resolve({ data: null, error: { message: err.message || 'Network Error' } });
    }
  }
}

class SupabaseClientMock {
  constructor() {
    this.auth = {
      async getSession() {
        const token = localStorage.getItem('jwt_token');
        const userStr = localStorage.getItem('user_data');
        if (token && userStr) {
          return { data: { session: { access_token: token, user: JSON.parse(userStr) } }, error: null };
        }
        return { data: { session: null }, error: null };
      },
      async signInWithOAuth({ provider, options }) {
        // Mocked implementation: in a real app this redirects to your custom Express Google OAuth route
        window.location.href = `${CORE_BACKEND_URL}/auth/google/login`;
        return { data: {}, error: null };
      },
      async signOut() {
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('user_data');
        return { error: null };
      },
      onAuthStateChange(callback) {
        // Return a mock subscription
        return { data: { subscription: { unsubscribe: () => {} } } };
      }
    };
  }

  from(table) {
    return new QueryBuilder(table);
  }

  channel(name) {
    return {
      on(event, filter, callback) {
        console.log(`[Mock Realtime] Subscribed to ${name} with filter`, filter);
        return this;
      },
      subscribe() {
        return this;
      },
      unsubscribe() {
        return Promise.resolve();
      }
    };
  }

  getChannels() {
    return [];
  }

  removeChannel(channel) {
    return Promise.resolve();
  }
}

export const supabase = new SupabaseClientMock();

export function createRealtimeChannel(name) {
  return supabase.channel(name);
}

export const isSupabaseConfigured = true;
export type User = any;
export type RealtimePostgresChangesPayload<T> = any;
export type PostgrestError = { message: string, details?: string, hint?: string, code?: string };
export type RealtimeChannel = any;
