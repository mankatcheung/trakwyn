import { Component, type ReactNode } from 'react';
import { captureException } from '../../lib/observability/report';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Catches a render error in the popup or the options page (JEF-387). Without
 * it React unmounts the whole tree and the user is left with a blank popup;
 * with it the error is reported and there is a way back.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    void captureException(error, { action: 'render' });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="container center">
        <div className="error-icon">⚠️</div>
        <p className="error-text">Something went wrong.</p>
        <button onClick={() => window.location.reload()} className="btn btn-ghost">
          Reload
        </button>
      </div>
    );
  }
}
