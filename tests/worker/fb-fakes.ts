// Giả lập Supabase REST + Graph API cho test Worker — KHÔNG gọi mạng thật.
// @vitest-environment node
export type Row = Record<string, unknown>;

export interface WorldOptions {
  customers?: Row[];
  queue?: Row[];
  leads?: Row[];
  health?: Row | null;
  forms?: Row[];
  formLeads?: Record<string, Row[]>;
  graphLeads?: Record<string, Row>;
  leadErrors?: Record<string, { status?: number; code?: number; message?: string }>;
  formNames?: Record<string, string>;
  token?: Row;
  subscribed?: Row[] | null;
  failTable?: string;
  createConflict?: boolean;
  customerLookups?: Row[][];
}

export interface Call {
  url: string;
  method: string;
  body: string | null;
}

export interface World {
  db: { customers: Row[]; fb_lead_queue: Row[]; fb_leads: Row[]; integration_health: Row[] };
  calls: Call[];
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  supabaseCalls: () => Call[];
  graphCalls: () => Call[];
  tablePosts: (table: string) => Call[];
}

const SKIP_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict']);

function responseJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, value] of params.entries()) {
    if (SKIP_PARAMS.has(key)) continue;
    if (value.startsWith('eq.')) {
      if (String(row[key] ?? '') !== value.slice(3)) return false;
    } else if (value === 'is.null') {
      if (row[key] != null) return false;
    } else if (value === 'not.is.null') {
      if (row[key] == null) return false;
    } else if (value.startsWith('lte.')) {
      if (row[key] == null || String(row[key]) > value.slice(4)) return false;
    }
  }
  return true;
}

function compare(a: unknown, b: unknown): number {
  const left = String(a ?? '');
  const right = String(b ?? '');
  return left < right ? -1 : left > right ? 1 : 0;
}

function selectRows(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows.filter((row) => matches(row, params));
  const order = params.get('order');
  if (order) {
    const [field = '', direction = 'asc'] = order.split('.');
    out = [...out].sort((a, b) => compare(a[field], b[field]) * (direction === 'desc' ? -1 : 1));
  }
  const limit = Number(params.get('limit') || 0);
  if (limit > 0) out = out.slice(0, limit);
  return out;
}

function parseBody(init?: RequestInit): Row | Row[] | null {
  if (!init?.body || typeof init.body !== 'string') return null;
  return JSON.parse(init.body) as Row | Row[];
}

function graphError(status: number, message: string, code?: number): Response {
  return responseJson({ error: { message, code } }, status);
}

export function createWorld(options: WorldOptions = {}): World {
  const clock = new Date().toISOString();
  const db: World['db'] = {
    customers: (options.customers || []).map((row) => ({ ...row })),
    fb_lead_queue: (options.queue || []).map((row) => ({ ...row })),
    fb_leads: (options.leads || []).map((row) => ({ ...row })),
    integration_health: options.health ? [{ ...options.health }] : [],
  };
  const calls: Call[] = [];
  let lookupCursor = 0;

  async function fetchMock(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = urlOf(input);
    const method = init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    calls.push({ url, method, body: typeof init?.body === 'string' ? String(init.body) : null });

    if (url.startsWith('https://graph.facebook.com/')) {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean).slice(1); // bỏ version
      const path = parts.join('/');
      const first = parts[0] || '';

      if (path === 'debug_token') {
        return responseJson({
          data: options.token || {
            is_valid: true,
            expires_at: 0,
            data_access_expires_at: 0,
            scopes: ['leads_retrieval'],
          },
        });
      }
      if (path.endsWith('leadgen_forms')) return responseJson({ data: options.forms || [] });
      if (path.endsWith('subscribed_apps')) {
        const subscribed = options.subscribed === undefined ? [{ subscribed_fields: ['leadgen'] }] : options.subscribed;
        return responseJson({ data: subscribed || [] });
      }
      if (parts.length === 2 && parts[1] === 'leads') {
        return responseJson({ data: options.formLeads?.[first] || [] });
      }
      const error = options.leadErrors?.[first];
      if (error) return graphError(error.status || 500, error.message || 'Graph lỗi', error.code);
      const lead = options.graphLeads?.[first];
      if (lead) return responseJson(lead);
      const name = options.formNames?.[first];
      return responseJson({ name: name || null, id: first });
    }

    const parsed = new URL(url);
    const marker = '/rest/v1/';
    const index = parsed.pathname.indexOf(marker);
    if (index < 0) return responseJson({ error: 'unknown url' }, 404);
    const rest = parsed.pathname.slice(index + marker.length);
    const [table = ''] = rest.split('/');
    const params = parsed.searchParams;
    const headers = new Headers(init?.headers);
    const prefer = headers.get('prefer') || '';

    if (table === 'rpc') {
      const body = (parseBody(init) || {}) as Row;
      const customer = db.customers.find((row) => row.id === body.p_customer_id);
      if (!customer) return responseJson('not_found');
      const interaction = (body.p_interaction || {}) as Row;
      const interactions = Array.isArray(customer.interactions) ? (customer.interactions as Row[]) : [];
      if (interactions.some((item) => item.lead_id === interaction.lead_id)) return responseJson('already');
      customer.interactions = [interaction, ...interactions];
      const source = Array.isArray(customer.source) ? (customer.source as string[]) : [];
      if (!source.includes('facebook_ads')) customer.source = [...source, 'facebook_ads'];
      return responseJson('attached');
    }

    if (options.failTable === table) return responseJson({ message: 'Supabase lỗi giả lập' }, 500);

    if (method === 'GET') {
      if (table === 'customers' && options.customerLookups) {
        const rows = options.customerLookups[lookupCursor] || [];
        lookupCursor += 1;
        return responseJson(selectRows(rows, params));
      }
      const rows = db[table as keyof World['db']] || [];
      return responseJson(selectRows(rows, params));
    }

    if (method === 'PATCH') {
      const patch = (parseBody(init) || {}) as Row;
      const rows = db[table as keyof World['db']] || [];
      const matched = rows.filter((row) => matches(row, params));
      for (const row of matched) Object.assign(row, patch);
      return prefer.includes('return=representation') ? responseJson(matched) : new Response(null, { status: 204 });
    }

    if (method === 'POST' && table === 'customers') {
      if (options.createConflict) {
        return responseJson(
          {
            code: '23505',
            message:
              'duplicate key value violates unique constraint "customers_phone_owner_key" Detail: Key (phone)=(0912345678) already exists.',
          },
          409,
        );
      }
      const body = (parseBody(init) || {}) as Row;
      const row: Row = {
        ...body,
        id: body.id || `cust-${db.customers.length + 1}`,
        archived_at: body.archived_at ?? null,
        created_at: body.created_at || clock,
        updated_at: body.updated_at || clock,
      };
      db.customers.push(row);
      return responseJson([row], 201);
    }

    if (method === 'POST' && table === 'fb_lead_queue') {
      const body = parseBody(init);
      const rows = Array.isArray(body) ? body : body ? [body] : [];
      const inserted: Row[] = [];
      for (const row of rows) {
        const existing = db.fb_lead_queue.find((item) => item.lead_id === row.lead_id);
        if (existing) {
          if (prefer.includes('merge-duplicates')) Object.assign(existing, row);
          continue;
        }
        db.fb_lead_queue.push({ ...row });
        inserted.push({ ...row });
      }
      return responseJson(inserted, 201);
    }

    if (method === 'POST' && table === 'fb_leads') {
      const body = (parseBody(init) || {}) as Row;
      const existing = db.fb_leads.find((row) => row.lead_id === body.lead_id);
      if (existing) Object.assign(existing, body);
      else db.fb_leads.push({ ...body, received_at: clock });
      return new Response(null, { status: 201 });
    }

    if (method === 'POST' && table === 'integration_health') {
      const body = (parseBody(init) || {}) as Row;
      const existing = db.integration_health.find((row) => row.id === body.id);
      if (existing) Object.assign(existing, body);
      else db.integration_health.push({ ...body });
      return responseJson([existing || body], 201);
    }

    return responseJson({ error: `chưa hỗ trợ ${method} ${table}` }, 500);
  }

  return {
    db,
    calls,
    fetch: fetchMock,
    supabaseCalls: () => calls.filter((call) => call.url.includes('/rest/v1/')),
    graphCalls: () => calls.filter((call) => call.url.startsWith('https://graph.facebook.com/')),
    tablePosts: (table: string) =>
      calls.filter((call) => call.method === 'POST' && call.url.includes(`/rest/v1/${table}`)),
  };
}
