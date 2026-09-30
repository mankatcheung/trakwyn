import { createRoot } from 'react-dom/client';
import { ApiUrlForm } from './ApiUrlForm';
import '../popup/popup.css';

const root = createRoot(document.getElementById('root')!);
root.render(<ApiUrlForm />);
