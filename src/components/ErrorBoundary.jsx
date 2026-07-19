import { Component } from 'react';

/**
 * ErrorBoundary
 * -------------------------------------------------------------
 * 렌더링 중 예외가 발생하면 React 는 트리 전체를 언마운트해 "검은 화면"만
 * 남는다. 이 바운더리는 크래시를 잡아 원인 메시지와 복구 버튼을 보여줘,
 * 사용자가 무엇이 잘못됐는지 알 수 있게 한다.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // 운영 환경 디버깅을 위해 콘솔에 상세 스택 출력
    console.error('[Emberwave] 렌더링 크래시:', error, info?.componentStack);
  }

  handleReset = () => {
    // 손상된 저장 설정이 원인일 수 있으므로 초기화 후 재시작 옵션 제공
    try {
      localStorage.removeItem('emberwave:settings:v1');
    } catch {
      // 저장소 접근 불가 환경은 무시
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-ink-900 p-6 text-center">
        <div className="max-w-md">
          <p className="text-lg font-semibold text-white">문제가 발생했어요</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            화면을 그리는 중 오류가 발생했습니다. 새로고침하거나, 계속되면 저장된
            설정을 초기화한 뒤 다시 시도해 주세요.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-ink-600 bg-ink-800 p-3 text-left font-mono text-[11px] text-[#ff6b6b]">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-ember-soft"
            >
              새로고침
            </button>
            <button
              onClick={this.handleReset}
              className="rounded-lg border border-ink-600 px-4 py-2 text-sm text-muted transition hover:text-white"
            >
              설정 초기화 후 재시작
            </button>
          </div>
        </div>
      </div>
    );
  }
}
