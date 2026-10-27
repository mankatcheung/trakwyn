import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { initObservability } from '../../lib/observability/report';
import { connectPopupPort } from '../../lib/updateReload';
import { EXTENSION_CONTEXTS } from '../../constants';
import './popup.css';

initObservability(EXTENSION_CONTEXTS.POPUP);
// Tells the background a popup is open, so an update does not reload it away (JEF-455).
connectPopupPort();

const root = createRoot(document.getElementById('root')!);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
