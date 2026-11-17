import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { SessionProvider } from './app/session';
import { ReauthHost } from './components/ReauthModal';
import { ToastProvider } from './components/Toast';
import './styles/tokens.css';
import './styles/base.css';
import './styles/admin.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/admin">
      <SessionProvider>
        <ToastProvider>
          <App />
          <ReauthHost />
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
