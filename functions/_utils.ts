// /functions/_utils.ts

function getSupabaseConfig(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or Supabase API key');
  }
  return {
    url: url.replace(/\/+$/, ''),
    key,
  };
}

function encodeFilterValue(value) {
  return encodeURIComponent(String(value));
}

function encodeInValue(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

class SupabaseRestQuery {
  constructor(config, table) {
    this.config = config;
    this.table = table;
    this.method = 'GET';
    this.params = new URLSearchParams();
    this.headers = {};
    this.body = undefined;
    this.expectSingle = false;
  }

  select(columns = '*') {
    this.params.set('select', columns);
    return this;
  }

  eq(column, value) {
    this.params.set(column, `eq.${encodeFilterValue(value)}`);
    return this;
  }

  in(column, values) {
    const list = (values || []).map(encodeInValue).join(',');
    this.params.set(column, `in.(${list})`);
    return this;
  }

  order(column, options = {}) {
    const existing = this.params.get('order');
    const direction = options.ascending === false ? 'desc' : 'asc';
    const next = `${column}.${direction}`;
    this.params.set('order', existing ? `${existing},${next}` : next);
    return this;
  }

  single() {
    this.expectSingle = true;
    return this;
  }

  insert(rows) {
    this.method = 'POST';
    this.body = rows;
    this.headers.Prefer = 'return=representation';
    return this;
  }

  upsert(rows, options = {}) {
    this.method = 'POST';
    this.body = rows;
    if (options.onConflict) this.params.set('on_conflict', options.onConflict);
    this.headers.Prefer = 'resolution=merge-duplicates,return=representation';
    return this;
  }

  update(values) {
    this.method = 'PATCH';
    this.body = values;
    this.headers.Prefer = 'return=representation';
    return this;
  }

  delete() {
    this.method = 'DELETE';
    return this;
  }

  async execute() {
    const endpoint = `${this.config.url}/rest/v1/${this.table}`;
    const url = `${endpoint}?${this.params.toString()}`;
    const headers = {
      apikey: this.config.key,
      Authorization: `Bearer ${this.config.key}`,
      ...this.headers,
    };
    if (this.body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.expectSingle) headers.Accept = 'application/vnd.pgrst.object+json';

    const res = await fetch(url, {
      method: this.method,
      headers,
      body: this.body === undefined ? undefined : JSON.stringify(this.body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      return {
        data: null,
        error: {
          message: data?.message || text || `Supabase error ${res.status}`,
          status: res.status,
          details: data,
        },
      };
    }

    return { data, error: null };
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }

  finally(onFinally) {
    return this.execute().finally(onFinally);
  }
}

export function getSupabaseClient(env) {
  const config = getSupabaseConfig(env);
  return {
    from(table) {
      return new SupabaseRestQuery(config, table);
    },
  };
}

export async function getUserFromRequest(context) {
  const userHeader = context.request.headers.get('x-fas-user');
  if (!userHeader) return null;
  try {
    return JSON.parse(userHeader);
  } catch {
    return null;
  }
}
