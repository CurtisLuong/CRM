import type { FeatureRoute } from '@/app/routes';
import { THEME_OPTIONS, useThemePref } from '@/app/theme';

/** Trang kiểm tra token chữ/màu (T2.C1): mọi cấp chữ với dấu tiếng Việt, cả sáng và tối. Không phải màn của người dùng. */

const SAMPLE = 'Trường, Hưởng, Ngữ, Tự, Đường';

const TYPE_SCALE = [
  { role: 'display', cls: 'text-display', spec: '28/34 · 600' },
  { role: 'title', cls: 'text-title', spec: '20/28 · 600' },
  { role: 'section', cls: 'text-section', spec: '16/24 · 600' },
  { role: 'body-strong', cls: 'text-body-strong', spec: '15/22 · 600' },
  { role: 'body', cls: 'text-body', spec: '15/22 · 400' },
  { role: 'small', cls: 'text-small', spec: '13/18 · 400' },
  { role: 'label', cls: 'text-label', spec: '12/16 · 500' },
  { role: 'mono-data', cls: 'text-mono-data font-data', spec: '13/18 · 500 mono' },
] as const;

const MONO_SAMPLES = ['09:30', '1.250.000.000 ₫', 'A-1203', '0912 345 678'];

const TEXT_TONES = [
  { token: '--text', cls: 'text-text' },
  { token: '--text-2', cls: 'text-text-2' },
  { token: '--text-3', cls: 'text-text-3' },
] as const;

const SWATCHES = [
  { token: '--bg', cls: 'bg-bg' },
  { token: '--surface', cls: 'bg-surface' },
  { token: '--surface-2', cls: 'bg-surface-2' },
  { token: '--surface-3', cls: 'bg-surface-3' },
  { token: '--border', cls: 'bg-border' },
  { token: '--border-strong', cls: 'bg-border-strong' },
  { token: '--accent', cls: 'bg-accent' },
  { token: '--accent-soft', cls: 'bg-accent-soft' },
] as const;

const SEMANTIC = [
  { token: '--danger', cls: 'bg-danger-bg text-danger', text: 'Quá hạn' },
  { token: '--warning', cls: 'bg-warning-bg text-warning', text: 'Đến hạn' },
  { token: '--success', cls: 'bg-success-bg text-success', text: 'Xong' },
  { token: '--ai', cls: 'bg-ai-bg text-ai', text: 'Gợi ý AI' },
  { token: '--accent', cls: 'bg-accent text-accent-fg', text: 'Gọi ngay' },
  { token: '--accent-soft', cls: 'bg-accent-soft text-accent', text: 'Đang chọn' },
] as const;

function ThemePicker() {
  const [pref, setPref] = useThemePref();
  return (
    <fieldset className="flex gap-1 rounded-control border border-border bg-surface-2 p-1">
      <legend className="sr-only">Giao diện</legend>
      {THEME_OPTIONS.map((o) => (
        <label
          key={o.value}
          className="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-[8px] px-3 text-body-strong text-text-2 has-checked:bg-accent-soft has-checked:text-accent has-focus-visible:outline-2 has-focus-visible:outline-accent"
        >
          <input
            type="radio"
            name="theme"
            value={o.value}
            checked={pref === o.value}
            onChange={() => setPref(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

function DevType() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-title">Kiểu chữ &amp; màu</h1>
        <p className="text-small text-text-2">Trang kiểm tra token Design System v3 — dấu tiếng Việt ở mọi cỡ chữ.</p>
        <ThemePicker />
      </header>

      <section aria-labelledby="type-scale" className="flex flex-col gap-3">
        <h2 id="type-scale" className="text-section">
          Cấp chữ
        </h2>
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface shadow-e1">
          {TYPE_SCALE.map((t) => (
            <li key={t.role} data-role={t.role} className="flex flex-col gap-1 px-4 py-3">
              <span className="text-label text-text-3">
                {t.role} · {t.spec}
              </span>
              <span className={`${t.cls} break-words`}>{SAMPLE}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tones" className="flex flex-col gap-3">
        <h2 id="tones" className="text-section">
          Màu chữ
        </h2>
        <ul className="flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3 shadow-e1">
          {TEXT_TONES.map((t) => (
            <li key={t.token} className={`${t.cls} text-body`}>
              {t.token} — {SAMPLE}
            </li>
          ))}
          <li className="flex flex-wrap gap-x-3 font-data text-mono-data text-text-2">
            {MONO_SAMPLES.map((v) => (
              <span key={v} className="whitespace-nowrap">
                {v}
              </span>
            ))}
          </li>
        </ul>
      </section>

      <section aria-labelledby="semantic" className="flex flex-col gap-3">
        <h2 id="semantic" className="text-section">
          Màu ngữ nghĩa
        </h2>
        <ul className="flex flex-wrap gap-2">
          {SEMANTIC.map((s) => (
            <li key={s.text} className={`${s.cls} rounded-full px-3 py-1 text-label`} title={s.token}>
              {s.text}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="surfaces" className="flex flex-col gap-3">
        <h2 id="surfaces" className="text-section">
          Nền &amp; viền
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SWATCHES.map((s) => (
            <li key={s.token} className="flex flex-col gap-1">
              <span className={`${s.cls} h-12 rounded-control border border-border`} aria-hidden="true" />
              <code className="font-data text-mono-data text-text-2">{s.token}</code>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export const route: FeatureRoute = { path: '/dev/type', element: <DevType /> };
