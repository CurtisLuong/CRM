import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initTheme } from './app/theme';
import './styles/fonts.css';
import './app/index.css';

// Áp Sáng/Tối trước khi React vẽ lần đầu → không chớp sai màu.
initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('Thiếu #root trong index.html');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
