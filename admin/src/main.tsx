import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { SessionProvider } from './app/session';
import { ReauthHost } from './components/ReauthModal';
import { ToastProvider } from './components/Toast';
import { RealtimeProvider } from './lib/realtime';
import './styles/tokens.css';
import './styles/base.css';
import './styles/admin.css';

/**
 * Company theme (docs/07 §10.1): /theme.css overrides the default tokens (declared with
 * `:where(:root)`). Rendering waits for it (max 1.5 s) so the admin never flashes default colours.
 */
function loadTheme(): Promise<void> {
  return new Promise((done) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/theme.css';
    link.onload = link.onerror = () => done();
    document.head.appendChild(link);
    setTimeout(done, 1500);
  });
}

void loadTheme().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter basename="/admin">
        <SessionProvider>
          <RealtimeProvider>
            <ToastProvider>
              <App />
              <ReauthHost />
            </ToastProvider>
          </RealtimeProvider>
        </SessionProvider>
      </BrowserRouter>
    </StrictMode>,
  ),
);
