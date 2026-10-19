import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './states';

type Props = {
  children: ReactNode;
  /** Tên khối để báo lỗi: "Không hiển thị được {label}." */
  label?: string;
  /** Đổi giá trị → xoá trạng thái lỗi (vd. đổi màn). */
  resetKey?: unknown;
};

type State = { error: boolean };

/** Lỗi render trong một khối chỉ ẩn khối đó, khung app vẫn dùng được (DESIGN_SYSTEM §0 L5). */
export class BlockBoundary extends Component<Props, State> {
  state: State = { error: false };

  static getDerivedStateFromError(): State {
    return { error: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('BlockBoundary', error, info);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: false });
    }
  }

  private retry = () => this.setState({ error: false });

  render() {
    if (this.state.error) {
      return <ErrorState title={`Không hiển thị được ${this.props.label ?? 'phần này'}.`} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}
