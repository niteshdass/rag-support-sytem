import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <div className="p-8 text-2xl font-bold">RAG Support — scaffold</div>
  </React.StrictMode>
);
