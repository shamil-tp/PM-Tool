// Custom API Shim to replace @supabase/supabase-js
// This ensures all 88 frontend files continue to work without modification,
// while routing all data requests to our custom Express core backend.

const CORE_BACKEND_URL = '/api';

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.url = new URL(`${CORE_BACKEND_URL}/${table}`, window.location.origin);
    this.method = 'GET';
    this.body = null;
    this.isSingle = false;
  }

  select(columns = '*') {
    if (this.method !== 'POST' && this.method !== 'PATCH' && this.method !== 'DELETE' && this.method !== 'PUT') {
      this.method = 'GET';
    }
    this.url.searchParams.append('select', columns);
    return this;
  }

  insert(data) {
    this.method = 'POST';
    this.body = data;
    return this;
  }

  upsert(data) {
    this.method = 'PUT';
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

  or(condition) {
    this.url.searchParams.append('or', `(${condition})`);
    return this;
  }

  is(column, value) {
    this.url.searchParams.append(column, `is.${value}`);
    return this;
  }

  ilike(column, value) {
    this.url.searchParams.append(column, `ilike.${value}`);
    return this;
  }

  gte(column, value) {
    this.url.searchParams.append(column, `gte.${value}`);
    return this;
  }

  lte(column, value) {
    this.url.searchParams.append(column, `lte.${value}`);
    return this;
  }

  gt(column, value) {
    this.url.searchParams.append(column, `gt.${value}`);
    return this;
  }

  lt(column, value) {
    this.url.searchParams.append(column, `lt.${value}`);
    return this;
  }

  like(column, value) {
    this.url.searchParams.append(column, `like.${value}`);
    return this;
  }

  range(from, to) {
    this.url.searchParams.append('offset', from);
    this.url.searchParams.append('limit', to - from + 1);
    return this;
  }

  match(query) {
    for (const [key, value] of Object.entries(query)) {
      this.eq(key, value);
    }
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    return this;
  }

  // Promise resolution automatically triggers the fetch
  async then(resolve, reject) {
    try {
      const token = localStorage.getItem('local_access_token');
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
        const token = localStorage.getItem('local_access_token');
        const userStr = localStorage.getItem('local_user');
        if (token && userStr) {
          return { data: { session: { access_token: token, user: JSON.parse(userStr) } }, error: null };
        }
        return { data: { session: null }, error: null };
      },
      async getUser() {
        const userStr = localStorage.getItem('local_user');
        if (userStr) {
          return { data: { user: JSON.parse(userStr) }, error: null };
        }
        return { data: { user: null }, error: null };
      },
      async signInWithOAuth({ provider, options }) {
        // Mocked implementation: in a real app this redirects to your custom Express Google OAuth route
        window.location.href = `${CORE_BACKEND_URL}/auth/google/login`;
        return { data: {}, error: null };
      },
      async signOut() {
        localStorage.removeItem('local_access_token');
        localStorage.removeItem('local_refresh_token');
        localStorage.removeItem('local_user');
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

  rpc(name, params) {
    // Return mock data for any RPC call since the local backend doesn't support custom stored procedures
    return Promise.resolve({ data: {}, error: null });
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
