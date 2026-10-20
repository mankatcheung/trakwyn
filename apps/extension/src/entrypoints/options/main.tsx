import { createRoot } from 'react-dom/client';
import { ApiUrlForm } from './ApiUrlForm';
import { ParseModeForm } from './ParseModeForm';
import { ErrorBoundary } from '../popup/ErrorBoundary';
import { initObservability } from '../../lib/observability/report';
import { EXTENSION_CONTEXTS } from '../../constants';
import '../popup/popup.css';

initObservability(EXTENSION_CONTEXTS.OPTIONS);

const root = createRoot(document.getElementById('root')!);
root.render(
  <ErrorBoundary>
    <ParseModeForm />
    <ApiUrlForm />
  </ErrorBoundary>,
);
