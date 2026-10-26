import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { CustomerMemory } from '@/features/profile/memory';
import { ProfileNeedsFields, type ProjectCatalog } from '@/features/profile/needs';
import { ToastProvider } from '@/ui';

const customer = {
  id: 'c1',
  owner_id: 'u1',
  full_name: 'Nguyễn Lan',
  phone: '0901234567',
  projects: ['Dự án A', 'Dự án B'],
} as Customer;

const catalog: ProjectCatalog = {
  projects: () => [
    { id: 'a', name: 'Dự án A' },
    { id: 'b', name: 'Dự án B' },
  ],
  load: async () => true,
  onChange: () => () => {},
  addProject: async (name) => ({ id: 'new', name }),
  archiveProject: async () => {},
};

function NeedsHarness({ onSaveProjects }: { onSaveProjects: (names: string[]) => Promise<boolean> }) {
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [supplementOpen, setSupplementOpen] = useState(false);
  return (
    <ToastProvider>
      <ProfileNeedsFields
        customer={customer}
        writable
        busy={false}
        showEmpty={supplementOpen}
        stayVisible={new Set(['projects'])}
        onToggleSupplement={() => setSupplementOpen((open) => !open)}
        onSaveField={() => {}}
        onSaveProjects={onSaveProjects}
        catalog={catalog}
        online
        projectsOpen={projectsOpen}
        onToggleProjects={() => setProjectsOpen((open) => !open)}
      />
    </ToastProvider>
  );
}

function MemoryHarness() {
  const [open, setOpen] = useState(false);
  return (
    <ToastProvider>
      <CustomerMemory
        customer={{ ...customer, contact_prefs: {} }}
        writable
        onSave={() => {}}
        hideEmpty={!open}
        sections={{ contact: false, interests: false, household: false, closure: false }}
        supplement={{ open, count: 3, onToggle: () => setOpen((value) => !value) }}
      />
    </ToastProvider>
  );
}

describe('PC-01 — ô gọn Dự án quan tâm', () => {
  it('hiện tên đã chọn, mở/đóng bộ chọn mà không lưu hồ sơ', async () => {
    const user = userEvent.setup();
    const onSaveProjects = vi.fn(async () => true);
    render(<NeedsHarness onSaveProjects={onSaveProjects} />);

    const box = screen.getByRole('button', { name: 'Dự án quan tâm: Dự án A, Dự án B' });
    expect(box.getAttribute('aria-expanded')).toBe('false');
    expect(box.textContent).toContain('Dự án A, Dự án B');
    expect(screen.queryByRole('list', { name: 'Dự án trong danh mục' })).toBeNull();

    await user.click(box);
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('list', { name: 'Dự án trong danh mục' })).toBeTruthy();

    await user.click(box);
    expect(box.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list', { name: 'Dự án trong danh mục' })).toBeNull();
    expect(onSaveProjects).not.toHaveBeenCalled();
  });

  it('đổi nút Bổ sung thành Thu gọn khi mở ở Nhu cầu và Trí nhớ', async () => {
    const user = userEvent.setup();
    const onSaveProjects = vi.fn(async () => true);
    const needs = render(<NeedsHarness onSaveProjects={onSaveProjects} />);

    const needsButton = screen.getByRole('button', { name: 'Bổ sung (8)' });
    await user.click(needsButton);
    expect(screen.getByRole('button', { name: 'Thu gọn' }).getAttribute('aria-expanded')).toBe('true');
    needs.unmount();

    render(<MemoryHarness />);
    const memoryButton = screen.getByRole('button', { name: 'Bổ sung (3)' });
    await user.click(memoryButton);
    expect(screen.getByRole('button', { name: 'Thu gọn' }).getAttribute('aria-expanded')).toBe('true');
  });
});
