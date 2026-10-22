#!/usr/bin/env node
// AI Factory — merge các nhánh worker vào `factory` sau khi máy tự kiểm (Lead không phải tự chạy test). KHÔNG push.
// Dùng: node scripts/factory-merge.mjs agent/A [agent/B ...] [--into factory] [--check "<lệnh>"]...
// Mỗi nhánh, lần lượt, trong worktree tạm ../wt-merge-<giờ> (repo chính không bị đụng tới):
//   rebase lên đỉnh hiện tại của --into → chạy đủ lệnh kiểm (mặc định: npm run check + npm run e2e)
//   → xanh: merge --no-ff vào đỉnh mới; trượt/xung đột: bỏ qua nhánh đó, đỉnh giữ nguyên, sang nhánh sau.
// Cuối cùng cập nhật nhánh --into (fast-forward; nếu đang mở ở thư mục nào thì merge --ff-only ngay tại đó).
// In đúng 1 dòng mỗi nhánh: "<nhánh> ✓ <sha>" hoặc "<nhánh> ✗ <lý do>". Mã thoát: 0 mọi nhánh vào · 1 có nhánh trượt · 2 lỗi.
// Test trượt ở file nhánh không đụng → chạy lại đúng file đó 1 lần (chập chờn có sẵn) trước khi tính trượt.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDeps, must, retryUntouched, sh } from './factory-run.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = join(ROOT, 'logs');

/** Lệnh kiểm mặc định theo package.json: check (hoặc test) + e2e nếu repo có. */
export function defaultChecks(pkg) {
  const s = pkg?.scripts ?? {};
  const checks = [];
  if (s.check) checks.push('npm run check');
  else if (s.test) checks.push('npm test');
  if (s.e2e) checks.push('npm run e2e');
  return checks;
}

/** Thư mục đang mở nhánh `branch` (git worktree list --porcelain), hoặc null. */
export function checkedOutAt(porcelain, branch) {
  let path = null;
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) path = line.slice(9);
    else if (line === `branch refs/heads/${branch}`) return path;
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const valued = new Set(['--into', '--check']);
  const branches = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
  const into = args.includes('--into') ? args[args.indexOf('--into') + 1] : 'factory';
  const custom = args.flatMap((a, i) => (args[i - 1] === '--check' ? [a] : []));
  if (!branches.length) {
    console.error('Dùng: node scripts/factory-merge.mjs agent/A [agent/B ...] [--into factory] [--check "<lệnh>"]...');
    return 2;
  }
  const pkg = existsSync(join(ROOT, 'package.json')) ? JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) : {};
  const checks = custom.length ? custom : defaultChecks(pkg);
  if (!checks.length) throw new Error('Không có lệnh kiểm (thêm --check "<lệnh>").');
  const oldTip = must('git', ['rev-parse', '--verify', into], { cwd: ROOT });

  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const wt = resolve(ROOT, '..', `wt-merge-${stamp}`);
  must('git', ['worktree', 'add', '-q', '--detach', wt, oldTip], { cwd: ROOT });
  // Cổng e2e riêng: không đụng server của worker/batch đang chạy song song.
  process.env.E2E_PORT ||= String(4290 + (Number(stamp.slice(-2)) % 9));
  mkdirSync(LOG_DIR, { recursive: true });
  const lines = [];
  let tip = oldTip;
  try {
    installDeps(wt);
    for (const branch of branches) {
      const slug = branch.replace(/[^A-Za-z0-9._-]+/g, '_');
      const fail = (why) => {
        lines.push(`${branch} ✗ ${why}`);
        sh('git', ['rebase', '--abort'], { cwd: wt });
        must('git', ['checkout', '-q', '--detach', tip], { cwd: wt });
      };
      if (sh('git', ['rev-parse', '--verify', '-q', branch], { cwd: ROOT }).code !== 0) {
        lines.push(`${branch} ✗ không có nhánh này`);
        continue;
      }
      if (sh('git', ['merge-base', '--is-ancestor', branch, tip], { cwd: ROOT }).code === 0) {
        lines.push(`${branch} ✓ đã có sẵn trong ${into}`);
        continue;
      }
      must('git', ['checkout', '-q', '--detach', branch], { cwd: wt });
      const rb = sh('git', ['rebase', '-q', tip], { cwd: wt });
      if (rb.code !== 0) {
        fail(`xung đột khi rebase lên ${into} — Lead xử lý tay`);
        continue;
      }
      const rebased = must('git', ['rev-parse', 'HEAD'], { cwd: wt });
      const files = must('git', ['diff', '--name-only', tip, rebased], { cwd: wt })
        .split('\n')
        .filter(Boolean)
        .map((path) => ({ path }));
      let log = '';
      let failed = '';
      for (const cmd of checks) {
        const r = sh('sh', ['-c', cmd], { cwd: wt });
        log += `$ ${cmd}\n${r.out}\n`;
        if (r.code === 0 || retryUntouched(wt, cmd, r.out, files, (m) => (log += `${m}\n`))) continue;
        failed = `\`${cmd}\` trượt (exit ${r.code})`;
        break;
      }
      const logFile = join(LOG_DIR, `merge-${slug}.log`);
      writeFileSync(logFile, log);
      if (failed) {
        fail(`${failed} — log ${logFile.slice(ROOT.length + 1)}`);
        continue;
      }
      must('git', ['checkout', '-q', '--detach', tip], { cwd: wt });
      const id = branch.replace(/^agent\//, '');
      const subject = must('git', ['log', '-1', '--format=%s', rebased], { cwd: wt }).replace(/^\w+\([^)]*\):\s*/, '');
      must(
        'git',
        ['merge', '--no-ff', '-q', '-m', `merge(${id}): ${subject}`, '-m', `factory-merge: rebase lên ${into} + ${checks.join(' + ')} xanh.`, rebased],
        { cwd: wt },
      );
      tip = must('git', ['rev-parse', 'HEAD'], { cwd: wt });
      lines.push(`${branch} ✓ ${tip.slice(0, 7)}`);
    }

    if (tip !== oldTip) {
      const at = checkedOutAt(must('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT }), into);
      const r = at
        ? sh('git', ['merge', '--ff-only', '-q', tip], { cwd: at })
        : sh('git', ['update-ref', `refs/heads/${into}`, tip, oldTip], { cwd: ROOT });
      if (r.code !== 0) {
        lines.push(`(!) chưa cập nhật được ${into}${at ? ` ở ${at}` : ''}: ${r.out.trim().split('\n')[0]} — đỉnh mới đã kiểm: ${tip}`);
        for (const l of lines) console.log(l);
        return 2;
      }
    }
  } finally {
    sh('git', ['worktree', 'remove', '--force', wt], { cwd: ROOT });
  }
  for (const l of lines) console.log(l);
  return lines.some((l) => l.includes(' ✗ ')) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`LỖI: ${e.message}`);
    process.exitCode = 2;
  }
}
