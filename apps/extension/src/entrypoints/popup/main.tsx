import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { initObservability } from '../../lib/observability/report';
import { EXTENSION_CONTEXTS } from '../../constants';
import './popup.css';

initObservability(EXTENSION_CONTEXTS.POPUP);

const root = createRoot(document.getElementById('root')!);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
