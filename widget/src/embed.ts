// Runs synchronously when the script tag is parsed — document.currentScript is valid here
const scriptEl = document.currentScript as HTMLScriptElement | null;
if (scriptEl) {
  const tenant = scriptEl.getAttribute('data-tenant') ?? '';
  const apiKey = scriptEl.getAttribute('data-api') ?? '';
  const apiUrl = scriptEl.getAttribute('data-api-url') ?? window.location.origin;
  const scriptSrc = scriptEl.src;
  const baseUrl = scriptSrc.substring(0, scriptSrc.lastIndexOf('/'));

  const params = new URLSearchParams({
    tenant,
    apiKey,
    apiUrl,
  });
  const iframeSrc = `${baseUrl}/iframe.html?${params.toString()}`;

  const PANEL_W = 380;
  const PANEL_H = 580;
  const BUBBLE = 56;

  const btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Open support chat');
  btn.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'right:24px',
    `width:${BUBBLE}px`,
    `height:${BUBBLE}px`,
    'border-radius:50%',
    'background:#1d4ed8',
    'border:none',
    'cursor:pointer',
    'box-shadow:0 4px 14px rgba(0,0,0,0.22)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'z-index:2147483647',
    'transition:transform 0.15s ease',
    'padding:0',
  ].join(';');
  btn.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed',
    `bottom:${BUBBLE + 32}px`,
    'right:24px',
    `width:${PANEL_W}px`,
    `height:${PANEL_H}px`,
    'border-radius:12px',
    'overflow:hidden',
    'box-shadow:0 8px 32px rgba(0,0,0,0.18)',
    'display:none',
    'z-index:2147483646',
    'background:#fff',
  ].join(';');

  const iframe = document.createElement('iframe');
  iframe.src = iframeSrc;
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  iframe.setAttribute('title', 'Support Chat');
  panel.appendChild(iframe);

  let open = false;
  btn.addEventListener('click', () => {
    open = !open;
    panel.style.display = open ? 'block' : 'none';
    btn.style.transform = open ? 'scale(0.88)' : 'scale(1)';
  });

  function inject() {
    document.body.appendChild(panel);
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
}
