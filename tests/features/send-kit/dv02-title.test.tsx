import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendKitItem } from '@/features/send-kit/model';
import { route } from '@/features/send-kit/route';

const state = vi.hoisted(() => ({
  account: null as unknown,
  items: [] as SendKitItem[],
  listeners: new Set<() => void>(),
}));
vi.mock('@/app/session', () => ({ isDemo: () => false }));
vi.mock('@/data/hooks', () => ({ useRepositoryAccount: () => state.account, useCustomers: () => [] }));
vi.mock('@/lib/document-viewer/preview', () => ({
  ImageDocument: () => <div>Ảnh</div>,
  PdfDocument: () => <div>PDF</div>,
}));

const item = (overrides: Partial<SendKitItem>): SendKitItem => ({
  id: 'item',
  title: 'Tài liệu',
  text: '',
  project: null,
  order: 0,
  updatedAt: 1,
  files: [],
  ...overrides,
});

function setup() {
  state.items = [
    item({
      id: 'project',
      title: 'Tổng quan dự án',
      project: 'Vin Tràng Cát',
      order: 0,
      files: [
        {
          id: 'p1',
          name: 'IMG_20261028_161949.jpg',
          type: 'image/jpeg',
          size: 148480,
          blob: new Blob(['ảnh']),
          cached: true,
        },
        {
          id: 'p2',
          name: 'Scan.pdf',
          type: 'application/pdf',
          size: 849920,
          blob: new Blob(['pdf']),
          cached: true,
        },
      ],
    }),
    item({
      id: 'common',
      title: 'Tài liệu chung',
      project: null,
      order: 1,
      files: [
        {
          id: 'c1',
          name: 'ảnh chung.PNG',
          type: 'image/png',
          size: 2_201_010,
          blob: new Blob(['png']),
          cached: true,
        },
      ],
    }),
  ];
  const repository = {
    list: vi.fn(async () => state.items),
    synchronize: vi.fn(async () => {}),
    watchFiles: () => () => {},
    getSnapshot: () => ({ items: state.items, loadError: '', syncError: '' }),
    subscribe: (callback: () => void) => {
      state.listeners.add(callback);
      return () => state.listeners.delete(callback);
    },
    canEdit: () => true,
    save: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    ensureFiles: vi.fn(async () => state.items),
  };
  state.account = {
    sync: { local: { userId: 'u1' } },
    sendKit: repository,
    catalog: { load: async () => {}, projects: () => [] },
  };
  render(<MemoryRouter>{route.element}</MemoryRouter>);
  return repository;
}

beforeEach(() => {
  state.listeners.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('DV-02 tiêu đề tài liệu trong kho gửi khách', () => {
  it('có dự án thì tiêu đề là "{dự án}. {tiêu đề}", giữ tên tệp qua title', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Xem IMG_20261028_161949.jpg' }));
    const dialog = screen.getByRole('dialog', { name: 'Vin Tràng Cát. Tổng quan dự án' });
    expect(dialog.textContent).toContain('JPG · 145 KB');
    expect(dialog.textContent).toContain('1/2');
    expect(within(dialog).getByRole('heading', { name: 'Vin Tràng Cát. Tổng quan dự án' }).getAttribute('title')).toBe(
      'IMG_20261028_161949.jpg',
    );

    await userEvent.click(within(dialog).getByRole('button', { name: 'Tệp sau' }));
    await waitFor(() => {
      const current = screen.getByRole('dialog', { name: 'Vin Tràng Cát. Tổng quan dự án' });
      expect(current.textContent).toContain('PDF · 830 KB');
      expect(current.textContent).toContain('2/2');
    });
  });

  it('mục Chung chỉ hiện tiêu đề, không ghép tên dự án; dòng phụ đổi theo tệp', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Xem ảnh chung.PNG' }));
    const dialog = screen.getByRole('dialog', { name: 'Tài liệu chung' });
    expect(dialog.textContent).toContain('PNG · 2.1 MB');
    expect(dialog.textContent).not.toContain('1/1');
    expect(within(dialog).queryByRole('heading', { name: /\. Tài liệu chung/ })).toBeNull();
  });
});
