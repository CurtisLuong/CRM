import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryAccount } from '@/data/repositories/session';
import { cachedProfilePhone, profilePhone, useMyPhone } from '@/features/team/profile';

const account = (id: string, raw: unknown, saved = true) =>
  ({
    sync: { local: { userId: id, isClosed: false } },
    remote: { getUiStateRemote: vi.fn().mockResolvedValue(raw), saveUiStateRemote: vi.fn().mockResolvedValue(saved) },
  }) as unknown as RepositoryAccount;

beforeEach(() => localStorage.clear());

describe('LV-01: số điện thoại cá nhân', () => {
  it('chỉ nhận chuỗi, không hiển thị object hoặc giá trị sai kiểu', () => {
    expect(profilePhone({ profile: { phone: '0901234567', unknown: true } })).toBe('0901234567');
    for (const raw of [null, undefined, {}, { profile: { phone: {} } }, { profile: { phone: 901 } }])
      expect(profilePhone(raw)).toBe('');
  });
  it('đọc remote rồi cache; lưu patch profile.phone, giữ dữ liệu khi lưu lỗi', async () => {
    const a = account('a', { profile: { phone: '0901111111', unknown: 'giữ' }, retarget: { keep: true } });
    const { result } = renderHook(() => useMyPhone(a));
    await waitFor(() => expect(result.current.phone).toBe('0901111111'));
    expect(cachedProfilePhone('a')).toBe('0901111111');
    await act(async () => {
      expect(await result.current.savePhone(' 0902222222 ')).toBe(true);
    });
    expect(a.remote.saveUiStateRemote).toHaveBeenCalledWith({ profile: { phone: '0902222222' } });
    expect(cachedProfilePhone('a')).toBe('0902222222');
    vi.mocked(a.remote.saveUiStateRemote).mockResolvedValueOnce(false);
    await act(async () => {
      expect(await result.current.savePhone('0903333333')).toBe(false);
    });
    expect(result.current.phone).toBe('0902222222');
    await act(async () => {
      expect(await result.current.savePhone('')).toBe(true);
    });
    expect(cachedProfilePhone('a')).toBe('');
  });
  it('ngoại tuyến/lỗi đọc giữ cache; đổi tài khoản không rò SĐT; bỏ phản hồi cũ', async () => {
    localStorage.setItem('crm_profile:a', JSON.stringify({ profile: { phone: '0901111111' } }));
    const a = account('a', undefined);
    const b = account('b', { profile: { phone: '0902222222' } });
    let complete: (value: unknown) => void = () => {};
    vi.mocked(a.remote.getUiStateRemote).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { result, rerender } = renderHook(({ current }) => useMyPhone(current), { initialProps: { current: a } });
    expect(result.current.phone).toBe('0901111111');
    rerender({ current: b });
    await waitFor(() => expect(result.current.phone).toBe('0902222222'));
    await act(async () => complete({ profile: { phone: 'không dùng' } }));
    expect(result.current.phone).toBe('0902222222');
    expect(cachedProfilePhone('a')).toBe('0901111111');
    rerender({ current: a });
    await act(async () => {});
    expect(result.current.phone).toBe('0901111111');
  });
});
