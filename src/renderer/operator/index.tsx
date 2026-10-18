import { createRoot } from 'react-dom/client';
import { StoreProvider } from './store';
import { ConfirmProvider } from './components/ui';
import { App } from './App';
import '../common/slide.css';
import './operator.css';

createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </StoreProvider>,
);
