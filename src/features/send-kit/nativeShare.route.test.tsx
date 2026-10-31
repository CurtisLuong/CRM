import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendKitItem } from './model';
import type { NativeShareFilesPlugin } from './nativeShare';
import { route } from './route';

const state = vi.hoisted(() => ({
  account: null as unknown,
  customers: [] as unknown[],
  items: [] as SendKitItem[],
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock('@/app/session', () => ({ isDemo: () => false }));
vi.mock('@/data/hooks', () => ({ useRepositoryAccount: () => state.account, useCustomers: () => state.customers }));
vi.mock('@/components/ui/sonner', () => ({ toast: state.toast }));
vi.mock('./store', () => ({
  deleteSendKitItem: vi.fn(),
  listSendKitItems: async () => state.items,
  reorderSendKitItems: vi.fn(),
  saveSendKitItem: vi.fn(),
}));
vi.mock('@/features/quick-actions/zalo', () => ({ copyAndOpenZalo: vi.fn(async () => {}) }));

const customer = {
  id: 'c1',
  owner_id: 'u1',
  full_name: 'Lan Nguyễn',
  phone: '0900000000',
  projects: [],
  interactions: [],
};
const item: SendKitItem = {
  id: 'kit1',
  title: 'Bảng giá',
  text: 'Chào chị Lan',
  project: null,
  files: [{ id: 'file1', name: 'bang-gia.txt', type: 'text/plain', size: 9, blob: new Blob(['file-data']) }],
  order: 0,
  updatedAt: 1,
};

let clipboardWriteText: ReturnType<typeof vi.fn>;
let clipboardDescriptor: PropertyDescriptor | undefined;
let createObjectUrlDescriptor: PropertyDescriptor | undefined;
let revokeObjectUrlDescriptor: PropertyDescriptor | undefined;

function mountSendKit() {
  return render(<MemoryRouter initialEntries={['/tai-lieu?customer=c1']}>{route.element}</MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.customers = [customer];
  state.items = [item];
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  clipboardWriteText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboardWriteText } });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:send-kit-file') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

  state.account = {
    sync: { local: { userId: 'u1' } },
    catalog: { load: async () => {}, projects: () => [] },
    customers: { getSnapshot: () => [customer], update: vi.fn(async () => {}) },
  };
});

afterEach(() => {
  delete (window as Window & { Capacitor?: unknown }).Capacitor;
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
  if (createObjectUrlDescriptor) Object.defineProperty(URL, 'createObjectURL', createObjectUrlDescriptor);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (revokeObjectUrlDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeObjectUrlDescriptor);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('SendKit route native sharing', () => {
  it('shares encoded files through ShareFiles, copies text, and records sent only after resolution', async () => {
    const share = vi.fn<NativeShareFilesPlugin['share']>(async () => ({ target: 'package' as const }));
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      Plugins: { ShareFiles: { share } },
    };
    mountSendKit();

    const button = await screen.findByRole('button', { name: /Gửi qua Zalo/ });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        (state.account as { customers: { update: ReturnType<typeof vi.fn> } }).customers.update,
      ).toHaveBeenCalled(),
    );
    expect(share.mock.calls[0]?.[0]).toEqual({
      files: [{ name: 'bang-gia.txt', mimeType: 'text/plain', base64: 'ZmlsZS1kYXRh' }],
      text: 'Chào chị Lan',
      preferPackage: 'com.zing.zalo',
    });
    expect(clipboardWriteText).toHaveBeenCalledWith('Chào chị Lan');
    expect(state.toast.success).toHaveBeenCalledWith('Đã gửi tài liệu', {
      description: 'Đã ghi vào lịch sử khách.',
    });
  });

  it('keeps the legacy download flow on an old APK and tells the user to update', async () => {
    (window as Window & { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true, Plugins: {} };
    mountSendKit();

    const button = await screen.findByRole('button', { name: /Gửi qua Zalo/ });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);

    await waitFor(() => expect(state.toast.info).toHaveBeenCalled());
    expect(state.toast.info).toHaveBeenCalledWith(
      'Đã chép chữ, mở Zalo và tải tệp',
      expect.objectContaining({ description: expect.stringContaining('Cập nhật app để gửi kèm tệp') }),
    );
    expect(
      (state.account as { customers: { update: ReturnType<typeof vi.fn> } }).customers.update,
    ).not.toHaveBeenCalled();
  });
});
