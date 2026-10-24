import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilePhotoFrame } from '@/features/profile/photos';
import { ToastProvider } from '@/ui';

const photo = (name = 'avatar.png', type = 'image/png') =>
  new File([Uint8Array.from([137, 80, 78, 71])], name, { type });

const base = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  owner_id: 'u1',
  full_name: 'Nguyễn Thị Lan',
  phone: '0901234567',
  avatar_path: null as string | null,
  cover_path: null as string | null,
  ...overrides,
});

const makeRemote = () => ({
  uploadAvatar: vi.fn(async (_customerId: string, _file: Blob & { name?: string }) => 'u1/c1/avatar-new.png'),
  uploadCover: vi.fn(async (_customerId: string, _file: Blob & { name?: string }) => 'u1/c1/cover-new.png'),
  removeAvatar: vi.fn(async (_customerId: string) => undefined),
  removeCover: vi.fn(async (_customerId: string) => undefined),
  avatarUrl: vi.fn((path: string | null | undefined) => (path ? `https://img.test/${path}` : null)),
  coverUrl: vi.fn((path: string | null | undefined) => (path ? `https://img.test/${path}` : null)),
});

type PhotoRemote = ReturnType<typeof makeRemote>;

function renderFrame(
  kind: 'avatar' | 'cover',
  options: { writable?: boolean; customer?: ReturnType<typeof base>; remote?: PhotoRemote } = {},
) {
  const remote = options.remote ?? makeRemote();
  const result = render(
    <ToastProvider>
      <ProfilePhotoFrame
        kind={kind}
        customer={options.customer ?? base()}
        remote={remote}
        writable={options.writable ?? true}
      />
    </ToastProvider>,
  );
  return { ...result, remote };
}

function installClipboard(read: () => Promise<Array<{ types: string[]; getType: (type: string) => Promise<Blob> }>>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read } });
}

function paste(files: File[], items: Array<{ kind: string; type: string; getAsFile: () => File | null }> = []) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & {
    clipboardData?: { files: File[]; items: typeof items };
  };
  event.clipboardData = { files, items };
  window.dispatchEvent(event);
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(window, 'Capacitor');
  vi.restoreAllMocks();
});

describe('CP-02 ảnh hồ sơ khách', () => {
  it('khung ảnh trống có dấu cộng và mở hộp thoại đúng hai nguồn ảnh', async () => {
    const user = userEvent.setup();
    const { remote } = renderFrame('avatar');
    const frame = screen.getByRole('button', { name: 'Ảnh đại diện' });
    expect(frame.querySelector('svg')).toBeTruthy();
    await user.click(frame);
    const dialog = screen.getByRole('dialog', { name: 'Thêm ảnh đại diện' });
    expect(within(dialog).getByRole('button', { name: 'Chọn từ máy' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Dán từ clipboard' })).toBeTruthy();
    expect(remote.uploadAvatar).not.toHaveBeenCalled();
    expect(remote.uploadCover).not.toHaveBeenCalled();
  });

  it('nhãn ảnh bìa và ảnh đại diện là hai khung riêng, mở đúng hộp thoại của từng vị trí', async () => {
    const user = userEvent.setup();
    renderFrame('cover');
    expect(screen.getByRole('button', { name: 'Ảnh bìa' })).toBeTruthy();
    expect(screen.getByText('Ảnh bìa')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Ảnh bìa' }));
    expect(screen.getByRole('dialog', { name: 'Thêm ảnh bìa' })).toBeTruthy();
  });

  it('chọn từ máy: chỉ đọc tệp sau thao tác người dùng rồi tải qua remote', async () => {
    const user = userEvent.setup();
    const { remote } = renderFrame('avatar');
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện' }));
    expect(remote.uploadAvatar).not.toHaveBeenCalled();
    const file = photo();
    fireEvent.change(screen.getByLabelText('Chọn ảnh đại diện từ máy'), { target: { files: [file] } });
    await waitFor(() => expect(remote.uploadAvatar).toHaveBeenCalledWith('c1', file));
    expect(await screen.findByText('Đã thêm ảnh đại diện')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('chỉ nhận ảnh: tệp không phải ảnh bị từ chối, không gọi upload', async () => {
    const user = userEvent.setup();
    const { remote } = renderFrame('avatar');
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện' }));
    fireEvent.change(screen.getByLabelText('Chọn ảnh đại diện từ máy'), {
      target: { files: [new File(['abc'], 'ghi-chu.txt', { type: 'text/plain' })] },
    });
    expect(await screen.findByText('Chỉ nhận ảnh cho ảnh đại diện và ảnh bìa.')).toBeTruthy();
    expect(remote.uploadAvatar).not.toHaveBeenCalled();
  });

  it('clipboard web: navigator.clipboard.read trả ảnh thì tải ảnh đó', async () => {
    const user = userEvent.setup();
    const blob = new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/png' });
    const getType = vi.fn(async () => blob);
    installClipboard(vi.fn(async () => [{ types: ['text/plain', 'image/png'], getType }]));
    const { remote } = renderFrame('cover');
    await user.click(screen.getByRole('button', { name: 'Ảnh bìa' }));
    await user.click(screen.getByRole('button', { name: 'Dán từ clipboard' }));
    await waitFor(() => expect(remote.uploadCover).toHaveBeenCalledTimes(1));
    expect(getType).toHaveBeenCalledWith('image/png');
    const uploaded = remote.uploadCover.mock.calls[0]?.[1] as File;
    expect(uploaded.type).toBe('image/png');
  });

  it('clipboard rỗng hoặc bị chặn quyền báo rõ và vẫn chọn từ máy được', async () => {
    const user = userEvent.setup();
    installClipboard(vi.fn(async () => []));
    const first = renderFrame('avatar');
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện' }));
    await user.click(screen.getByRole('button', { name: 'Dán từ clipboard' }));
    expect(await screen.findByText(/Clipboard chưa có ảnh/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Chọn từ máy' }) as HTMLButtonElement).disabled).toBe(false);
    expect(first.remote.uploadAvatar).not.toHaveBeenCalled();
    first.unmount();

    installClipboard(
      vi.fn(async () => {
        throw new Error('NotAllowedError');
      }),
    );
    const second = renderFrame('avatar');
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện' }));
    await user.click(screen.getByRole('button', { name: 'Dán từ clipboard' }));
    expect(await screen.findByText(/Không đọc được clipboard \(có thể bị chặn quyền\)/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Chọn từ máy' }) as HTMLButtonElement).disabled).toBe(false);
    expect(second.remote.uploadAvatar).not.toHaveBeenCalled();
  });

  it('trình duyệt không hỗ trợ clipboard.read báo rõ và gợi ý Ctrl/Cmd+V', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    renderFrame('avatar');
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện' }));
    await user.click(screen.getByRole('button', { name: 'Dán từ clipboard' }));
    expect(await screen.findByText(/Trình duyệt không đọc được clipboard/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Ctrl/Cmd+V');
  });

  it('Ctrl/Cmd+V trong hộp thoại nhận ảnh từ paste event', async () => {
    const user = userEvent.setup();
    const { remote } = renderFrame('avatar');
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện' }));
    const file = photo('clipboard.png');
    paste([file], [{ kind: 'file', type: 'image/png', getAsFile: () => file }]);
    await waitFor(() => expect(remote.uploadAvatar).toHaveBeenCalledWith('c1', file));
  });

  it('dán nội dung không có ảnh báo rõ, không gọi upload', async () => {
    const user = userEvent.setup();
    const { remote } = renderFrame('avatar');
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện' }));
    paste([], []);
    expect(await screen.findByText(/Clipboard chưa có ảnh/)).toBeTruthy();
    expect(remote.uploadAvatar).not.toHaveBeenCalled();
  });

  it('Android: đọc ảnh qua cầu nối ClipboardImage.read (base64)', async () => {
    const user = userEvent.setup();
    const nativePromise = vi.fn(async () => ({ mime: 'image/png', data: btoa('anh-tu-android') }));
    Object.defineProperty(window, 'Capacitor', {
      configurable: true,
      value: { isNativePlatform: () => true, nativePromise },
    });
    installClipboard(
      vi.fn(async () => {
        throw new Error('WebView không đọc clipboard');
      }),
    );
    const { remote } = renderFrame('cover');
    await user.click(screen.getByRole('button', { name: 'Ảnh bìa' }));
    await user.click(screen.getByRole('button', { name: 'Dán từ clipboard' }));
    await waitFor(() => expect(remote.uploadCover).toHaveBeenCalledTimes(1));
    expect(nativePromise).toHaveBeenCalledWith('ClipboardImage', 'read', {});
    const file = remote.uploadCover.mock.calls[0]?.[1] as File;
    expect(file.type).toBe('image/png');
    expect(file.size).toBe('anh-tu-android'.length);
  });

  it('Android clipboard không có ảnh báo rõ, vẫn chọn từ máy được', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, 'Capacitor', {
      configurable: true,
      value: { isNativePlatform: () => true, nativePromise: vi.fn(async () => ({})) },
    });
    const { remote } = renderFrame('avatar');
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện' }));
    await user.click(screen.getByRole('button', { name: 'Dán từ clipboard' }));
    expect(await screen.findByText(/Clipboard chưa có ảnh/)).toBeTruthy();
    expect(remote.uploadAvatar).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Chọn từ máy' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('có ảnh: xem toàn bộ object-contain, đổi ảnh mở lại hai nguồn, xoá cần xác nhận và Huỷ không xoá', async () => {
    const user = userEvent.setup();
    const customer = base({ avatar_path: 'u1/c1/avatar.png' });
    const { remote } = renderFrame('avatar', { customer });
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện' }));
    const viewer = screen.getByRole('dialog', { name: 'Ảnh đại diện' });
    const image = within(viewer).getByRole('img', { name: 'Ảnh đại diện' });
    expect(image.className).toContain('object-contain');
    expect(image.className).not.toContain('object-cover');
    expect(within(viewer).getByRole('button', { name: 'Đổi ảnh' })).toBeTruthy();
    expect(within(viewer).getByRole('button', { name: 'Xoá ảnh' })).toBeTruthy();

    await user.click(within(viewer).getByRole('button', { name: 'Đổi ảnh' }));
    const picker = screen.getByRole('dialog', { name: 'Đổi ảnh đại diện' });
    expect(within(picker).getByRole('button', { name: 'Chọn từ máy' })).toBeTruthy();
    expect(within(picker).getByRole('button', { name: 'Dán từ clipboard' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện' }));
    await user.click(screen.getByRole('button', { name: 'Xoá ảnh' }));
    const confirm = screen.getByRole('dialog', { name: 'Xoá ảnh đại diện?' });
    await user.click(within(confirm).getByRole('button', { name: 'Huỷ' }));
    expect(remote.removeAvatar).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Ảnh đại diện' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Xoá ảnh' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Xoá ảnh đại diện?' })).getByRole('button', { name: 'Xoá ảnh' }),
    );
    await waitFor(() => expect(remote.removeAvatar).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText('Đã xoá ảnh đại diện')).toBeTruthy();
  });

  it('lỗi upload không báo thành công và giữ ảnh cũ', async () => {
    const user = userEvent.setup();
    const remote = makeRemote();
    remote.uploadAvatar.mockRejectedValue(new Error('Mất mạng'));
    const customer = base({ avatar_path: 'u1/c1/avatar.png' });
    renderFrame('avatar', { customer, remote });
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện' }));
    await user.click(screen.getByRole('button', { name: 'Đổi ảnh' }));
    fireEvent.change(screen.getByLabelText('Chọn ảnh đại diện từ máy'), { target: { files: [photo('moi.png')] } });
    expect(await screen.findByText(/Chưa tải được ảnh đại diện\. Ảnh cũ vẫn được giữ\./)).toBeTruthy();
    expect(screen.queryByText('Đã đổi ảnh đại diện')).toBeNull();
    const frame = screen.getByRole('button', { name: 'Ảnh đại diện', hidden: true });
    expect(frame.querySelector('img')?.getAttribute('src')).toBe('https://img.test/u1/c1/avatar.png');
  });

  it('khách chỉ xem: khung trống không phải nút, ảnh có sẵn vẫn xem được nhưng không có Đổi/Xoá', async () => {
    const user = userEvent.setup();
    const empty = renderFrame('avatar', { writable: false });
    expect(screen.queryByRole('button', { name: 'Ảnh đại diện' })).toBeNull();
    expect(screen.getByRole('img', { name: 'Ảnh đại diện' })).toBeTruthy();
    empty.unmount();

    const remote = makeRemote();
    renderFrame('avatar', { writable: false, customer: base({ avatar_path: 'u1/c1/avatar.png' }), remote });
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện' }));
    expect(screen.getByRole('dialog', { name: 'Ảnh đại diện' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Đổi ảnh' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xoá ảnh' })).toBeNull();
    expect(screen.getByText('Khách nhóm và khách lưu trữ chỉ xem ảnh.')).toBeTruthy();
    expect(remote.uploadAvatar).not.toHaveBeenCalled();
    expect(remote.removeAvatar).not.toHaveBeenCalled();
  });

  it('đổi khách khác thì hộp thoại đang mở tự đóng, không lẫn ảnh', async () => {
    const user = userEvent.setup();
    const remote = makeRemote();
    const { rerender } = render(
      <ToastProvider>
        <ProfilePhotoFrame kind="avatar" customer={base()} remote={remote} writable />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    rerender(
      <ToastProvider>
        <ProfilePhotoFrame kind="avatar" customer={base({ id: 'c2' })} remote={remote} writable />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
