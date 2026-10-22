// AI Factory — adapter cho từng worker. Mỗi worker = 1 CLI coding agent, chạy trong worktree riêng:
//   deepseek: OpenCode + deepseek/deepseek-flash (trả theo API).       Suy luận: variant `#high`/`#max`.
//   haiku:    Claude Code `claude -p` + claude-haiku-5-5 (gói claude.ai). Suy luận: `--effort high|max`.
//   luna:     Codex `codex exec` + gpt-6-luna (gói ChatGPT).             Suy luận: `-c model_reasoning_effort=high|xhigh`.
// Kiểm chứng trên máy Curtis 2026-10-22 (claude 2.1.308, codex-cli 0.162.1, opencode 2.0.29) — chi tiết docs/factory-playbook.md.
// Mỗi adapter: plan(task) → các mức suy luận 3 lần thử · run(ctx) → kết quả chuẩn · login() → đã đăng nhập chưa ·
//   quota(text) → có phải hết hạn mức/hết tiền không (không tính worker trượt).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function sh(cmd, args, opts = {}) {
  // OpenCode 2.x lấy thư mục dự án từ $PWD, không từ cwd: phải đặt PWD = cwd, nếu không worker sửa nhầm repo chính.
  const env = opts.cwd ? { ...process.env, PWD: opts.cwd } : process.env;
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env, ...opts });
  return { code: r.status ?? (r.error ? 1 : 0), out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '', error: r.error };
}

export const WORKER_NAMES = ['deepseek', 'haiku', 'luna'];

const DEEPSEEK_MODEL = process.env.FACTORY_MODEL || 'deepseek/deepseek-flash';
const HAIKU_MODEL = process.env.FACTORY_HAIKU_MODEL || 'claude-haiku-5-5';
const LUNA_MODEL = process.env.FACTORY_LUNA_MODEL || 'gpt-6-luna';

const plan3 = (hard, normal, top) => (hard ? [top, top, top] : [normal, normal, top]);

/** Chữ báo hết hạn mức / hết tiền của từng CLI (lấy từ chuỗi trong chính bản cài, 2026-10-22). */
export const QUOTA_PATTERNS = {
  // DeepSeek API: 402 "Insufficient Balance"; 429 khi quá tải/giới hạn tốc độ.
  deepseek: /Insufficient Balance|insufficient_balance|\b402\b|Payment Required|rate.?limit|\b429\b/i,
  // Claude Code: "You've hit your limit / monthly limit / spend limit…", lỗi API rate_limit_error.
  haiku: /You['’]ve hit your|usage limit reached|rate_limit_error|\b429\b/i,
  // Codex: mã lỗi usage_limit_reached / rate_limit_exceeded / quota_exceeded / usage_not_included; "usage limit".
  luna: /usage_limit_reached|rate_limit_exceeded|quota_exceeded|usage_not_included|usage limit|\b429\b|too many requests/i,
};

/** Đọc JSONL an toàn. */
function events(jsonl) {
  const out = [];
  for (const line of jsonl.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out;
}

// --- deepseek (OpenCode) ----------------------------------------------------
/** Câu trả lời cuối của OpenCode = phần "text" cuối cùng trong log JSON. */
export function opencodeFinalText(jsonl) {
  let last = '';
  for (const e of events(jsonl)) if (e.type === 'text' && typeof e.part?.text === 'string' && e.part.text.trim()) last = e.part.text;
  return last;
}
function opencodeCost(jsonl) {
  let total = 0;
  const sum = (v) => {
    if (Array.isArray(v)) v.forEach(sum);
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (k === 'cost' && typeof x === 'number') total += x;
        else sum(x);
      }
  };
  for (const e of events(jsonl)) if (e.type === 'step_finish' || JSON.stringify(e).includes('step_finish')) sum(e);
  return total;
}
function opencodeTokens(jsonl) {
  let input = 0;
  let output = 0;
  for (const e of events(jsonl)) {
    const t = e.part?.tokens;
    if (e.type !== 'step_finish' || !t) continue;
    input += (t.input || 0) + (t.cache?.read || 0);
    output += (t.output || 0) + (t.reasoning || 0);
  }
  return { input, output };
}

const deepseek = {
  name: 'deepseek',
  billing: 'api',
  plan: (task) => plan3(task.hard, 'high', 'max'),
  label: (effort) => `${DEEPSEEK_MODEL}#${effort}`,
  run({ wt, title, prompt, model, effort, timeoutMs }) {
    // model = nhãn đầy đủ (vd. deepseek/deepseek-flash#high, ghi đè được bằng FACTORY_MODELS); thiếu → model mặc định#effort.
    // --standalone: server riêng tại worktree (PWD = worktree, sh() tự đặt) → nạp opencode.json (deny) của worktree.
    const r = sh('opencode', ['run', '--standalone', '--model', model || `${DEEPSEEK_MODEL}#${effort}`, '--format', 'json', '--auto', '--title', title, prompt], {
      cwd: wt,
      timeout: timeoutMs,
      input: '',
    });
    return { ...r, text: opencodeFinalText(r.stdout), cost: opencodeCost(r.stdout), tokens: opencodeTokens(r.stdout) };
  },
  /** Reviewer chỉ đọc: thư mục tạm có opencode.json cấm sửa/chạy lệnh/web. */
  review({ dir, prompt, title, timeoutMs }) {
    const model = process.env.FACTORY_REVIEW_MODEL || `${DEEPSEEK_MODEL}#max`;
    const readOnly = {
      $schema: 'https://opencode.ai/config.json',
      permission: { edit: { '*': 'deny' }, bash: { '*': 'deny' }, webfetch: 'deny', websearch: 'deny', external_directory: 'deny' },
    };
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify(readOnly, null, 2));
    const r = sh('opencode', ['run', '--standalone', '--model', model, '--format', 'json', '--auto', '--title', title, prompt], {
      cwd: dir,
      timeout: timeoutMs,
      input: '',
    });
    return { ...r, model, text: opencodeFinalText(r.stdout), cost: opencodeCost(r.stdout), tokens: opencodeTokens(r.stdout) };
  },
  login() {
    if (process.env.DEEPSEEK_API_KEY) return { ok: true, detail: 'DEEPSEEK_API_KEY' };
    const r = sh('opencode', ['auth', 'list'], { input: '' });
    return /deepseek/i.test(r.out)
      ? { ok: true, detail: 'opencode auth: DeepSeek' }
      : { ok: false, hint: 'opencode auth login   (chọn DeepSeek, dán API key từ platform.deepseek.com)' };
  },
};

// --- haiku (Claude Code) ----------------------------------------------------
/** opencode.worker.json (đã mở phạm vi task) → settings của Claude Code: luật allow/deny + sandbox Bash. */
export function claudeSettings(config) {
  const edit = config.permission?.edit ?? {};
  const bash = config.permission?.bash ?? {};
  const rel = (glob) => (glob.startsWith('./') || glob.startsWith('/') ? glob : `./${glob}`);
  const denyFiles = Object.entries(edit)
    .filter(([k, v]) => v === 'deny' && k !== '*')
    .flatMap(([k]) => [`Edit(${rel(k)})`, `Write(${rel(k)})`]);
  // "git commit*" → Bash(git commit:*) (khớp tiền tố lệnh).
  const denyBash = Object.entries(bash)
    .filter(([k, v]) => v === 'deny' && k !== '*')
    .map(([k]) => `Bash(${k.replace(/\s*\*$/, '').trim()}:*)`);
  return {
    permissions: {
      // Chỉ sửa trong thư mục làm việc (worktree); mọi thứ không được allow → tự từ chối (dontAsk).
      allow: ['Read', 'Glob', 'Grep', 'Edit(./**)', 'Write(./**)', 'Bash'],
      deny: [...denyFiles, ...denyBash, 'WebFetch', 'WebSearch'],
    },
    // Sandbox của Claude Code: Bash chỉ ghi được worktree + thư mục tạm, chặn mạng ngoài, vẫn cho máy chủ localhost (e2e).
    sandbox: { enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false, network: { allowLocalBinding: true } },
  };
}
function claudeResult(jsonl) {
  const result = events(jsonl).findLast((e) => e.type === 'result');
  const u = result?.usage ?? {};
  return {
    text: typeof result?.result === 'string' ? result.result : '',
    isError: !!result?.is_error,
    // total_cost_usd = giá niêm yết tương đương; chạy bằng gói nên không bị tính tiền → ghi riêng, không cộng vào trần $.
    listCost: Number(result?.total_cost_usd) || 0,
    tokens: {
      input: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
      output: u.output_tokens || 0,
    },
  };
}

const haiku = {
  name: 'haiku',
  billing: 'gói claude.ai',
  plan: (task) => plan3(task.hard, 'high', 'max'),
  label: (effort) => `${HAIKU_MODEL}@${effort}`,
  run({ wt, prompt, effort, timeoutMs, config, logBase }) {
    mkdirSync(join(logBase, '..'), { recursive: true });
    // Settings đặt ở logs/ (ngoài worktree) để không bị tính là file worker sửa.
    const settings = `${logBase}.claude-settings.json`;
    writeFileSync(settings, `${JSON.stringify(claudeSettings(config), null, 2)}\n`);
    const r = sh(
      'claude',
      [
        '-p',
        '--model',
        HAIKU_MODEL,
        '--effort',
        effort,
        '--permission-mode',
        'dontAsk',
        '--tools',
        'Bash,Read,Edit,Write,Glob,Grep',
        '--settings',
        settings,
        // Không nạp settings/hook/plugin cá nhân của Curtis; chỉ settings dự án + file trên. (--bare không dùng được: bắt API key, không nhận gói.)
        '--setting-sources',
        'project',
        '--strict-mcp-config',
        '--no-session-persistence',
        '--output-format',
        'stream-json',
        '--verbose',
        prompt,
      ],
      { cwd: wt, timeout: timeoutMs, input: '' },
    );
    const res = claudeResult(r.stdout);
    return { ...r, text: res.text, cost: 0, listCost: res.listCost, tokens: res.tokens, isError: res.isError };
  },
  /** Reviewer chỉ đọc: chỉ có Read/Glob/Grep, mức suy luận cao nhất. */
  review({ dir, prompt, timeoutMs }) {
    const r = sh(
      'claude',
      ['-p', '--model', HAIKU_MODEL, '--effort', 'max', '--permission-mode', 'dontAsk', '--tools', 'Read,Glob,Grep', '--setting-sources', 'project', '--strict-mcp-config', '--no-session-persistence', '--output-format', 'stream-json', '--verbose', prompt],
      { cwd: dir, timeout: timeoutMs, input: '' },
    );
    const res = claudeResult(r.stdout);
    return { ...r, model: `${HAIKU_MODEL}@max`, text: res.text, cost: 0, listCost: res.listCost, tokens: res.tokens, isError: res.isError };
  },
  login() {
    const r = sh('claude', ['auth', 'status'], { input: '' });
    try {
      const s = JSON.parse(r.stdout);
      if (s.loggedIn) return { ok: true, detail: `claude ${s.authMethod || ''} ${s.email || ''}`.trim() };
    } catch {}
    return { ok: false, hint: 'claude auth login   (đăng nhập tài khoản claude.ai có gói)' };
  },
};

// --- luna (Codex) -------------------------------------------------------------
function codexResult(jsonl) {
  let text = '';
  let input = 0;
  let output = 0;
  let error = '';
  for (const e of events(jsonl)) {
    if (e.type === 'item.completed' && e.item?.type === 'agent_message' && typeof e.item.text === 'string') text = e.item.text;
    if (e.type === 'turn.completed' && e.usage) {
      input += e.usage.input_tokens || 0;
      output += (e.usage.output_tokens || 0) + (e.usage.reasoning_output_tokens || 0);
    }
    if (e.type === 'error' || e.type === 'turn.failed') error += `${JSON.stringify(e)}\n`;
  }
  return { text, tokens: { input, output }, error };
}

/** Task có lệnh e2e (Playwright) → cần máy chủ localhost; sandbox Codex chỉ cho localhost khi mở network_access. */
export const needsLocalServer = (checks) => checks.some((c) => /playwright|\be2e\b/.test(c));

const luna = {
  name: 'luna',
  billing: 'gói ChatGPT',
  plan: (task) => plan3(task.hard, 'high', 'xhigh'),
  label: (effort) => `${LUNA_MODEL}@${effort}`,
  run({ wt, prompt, effort, timeoutMs, task, logBase }) {
    const last = `${logBase}.last.txt`;
    const r = sh(
      'codex',
      [
        'exec',
        // Bỏ config.toml cá nhân (MCP, profile) — đăng nhập vẫn dùng ~/.codex.
        '--ignore-user-config',
        '-m',
        LUNA_MODEL,
        '-c',
        `model_reasoning_effort="${effort}"`,
        '-c',
        'approval_policy="never"',
        '-c',
        'web_search="disabled"',
        // Sandbox workspace-write: chỉ ghi worktree + tmp; .git chỉ đọc (không commit được). Mạng tắt, trừ khi task có e2e.
        ...(needsLocalServer(task.checks) ? ['-c', 'sandbox_workspace_write.network_access=true'] : []),
        '-s',
        'workspace-write',
        '--ephemeral',
        '--json',
        '-C',
        wt,
        '-o',
        last,
        prompt,
      ],
      // input '' — không có thì codex chờ đọc thêm stdin.
      { cwd: wt, timeout: timeoutMs, input: '' },
    );
    const res = codexResult(r.stdout);
    return { ...r, out: `${r.out}\n${res.error}`, text: res.text, cost: 0, tokens: res.tokens };
  },
  /** Reviewer chỉ đọc: sandbox read-only, thư mục tạm ngoài git. */
  review({ dir, prompt, timeoutMs }) {
    const r = sh(
      'codex',
      ['exec', '--ignore-user-config', '-m', LUNA_MODEL, '-c', 'model_reasoning_effort="xhigh"', '-c', 'approval_policy="never"', '-c', 'web_search="disabled"', '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '--json', '-C', dir, prompt],
      { cwd: dir, timeout: timeoutMs, input: '' },
    );
    const res = codexResult(r.stdout);
    return { ...r, out: `${r.out}\n${res.error}`, model: `${LUNA_MODEL}@xhigh`, text: res.text, cost: 0, tokens: res.tokens };
  },
  login() {
    const r = sh('codex', ['login', 'status'], { input: '' });
    return r.code === 0 && /logged in/i.test(r.out)
      ? { ok: true, detail: r.out.trim().split('\n')[0] }
      : { ok: false, hint: 'codex login   (đăng nhập tài khoản ChatGPT có gói)' };
  },
};

export const WORKERS = { deepseek, haiku, luna };

export function workerOf(name) {
  const w = WORKERS[name];
  if (!w) throw new Error(`Worker không hợp lệ: "${name}" (chọn ${WORKER_NAMES.join(' | ')}).`);
  return w;
}

/** Lần chạy này có phải dừng vì hết hạn mức/hết tiền không (không phải lỗi của worker). */
export function isQuotaError(name, r) {
  if (r.timedOut) return false;
  const failed = r.code !== 0 || r.isError || !r.text;
  return failed && QUOTA_PATTERNS[name].test(`${r.out ?? ''}\n${r.text ?? ''}`);
}

/** Reviewer phải khác worker: deepseek → luna (hết hạn mức → haiku); haiku/luna → deepseek#max. */
export function reviewersFor(worker) {
  return worker === 'deepseek' ? ['luna', 'haiku'] : ['deepseek'];
}

/** Worker đã làm nhánh: đọc dòng "Worker: <mã>" trong commit của factory-run (commit cũ "Worker: deepseek/…" → deepseek). */
export function workerFromCommit(message) {
  return message.match(new RegExp(`Worker:\\s*(${WORKER_NAMES.join('|')})`, 'i'))?.[1]?.toLowerCase() ?? '';
}
