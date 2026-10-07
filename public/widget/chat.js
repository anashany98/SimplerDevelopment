/*!
 * CRM AGENTS chat widget loader.
 *
 * Embed:
 *   <script src="https://your-portal/widget/chat.js" data-widget-key="PUBLIC_KEY" async></script>
 *
 * Reads `data-widget-key` from its <script> tag and injects an iframe. Legacy
 * `data-widget-id` embeds remain supported. The iframe is a separate document,
 * so the host site's CSS can never bleed in.
 *
 * postMessage contract (iframe -> loader):
 *   { type: 'sd-chat:resize', height, width, expanded }
 *   { type: 'sd-chat:close' }
 */
(function () {
  'use strict';
  if (window.__sdChatLoaded) return;
  window.__sdChatLoaded = true;

  var script = document.currentScript;
  if (!script) {
    // Old browsers — locate either the current public key or legacy id embed.
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].getAttribute('data-widget-key') || scripts[i].getAttribute('data-widget-id')) { script = scripts[i]; break; }
    }
  }
  if (!script) return;

  var widgetKey = script.getAttribute('data-widget-key');
  var widgetId = script.getAttribute('data-widget-id');
  if (!widgetKey && !widgetId) return;

  // Resolve the platform origin from the script's own URL.
  var src = script.src || '';
  var origin;
  try { origin = new URL(src, window.location.href).origin; } catch (_) { origin = ''; }
  if (!origin) return;

  function newVisitorId(prefix) {
    var value = '';
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        value = window.crypto.randomUUID();
      } else if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        value = Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      }
    } catch (_) { /* fall through */ }
    return value ? prefix + value : '';
  }

  function visitorId() {
    var storageKey = 'sd-chat-visitor-id:' + (widgetKey || widgetId);
    try {
      var existing = window.localStorage.getItem(storageKey);
      if (existing) return existing;
      var fresh = newVisitorId('v_');
      if (!fresh) return '';
      window.localStorage.setItem(storageKey, fresh);
      return fresh;
    } catch (_) {
      return newVisitorId('vt_');
    }
  }

  var iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Chat en vivo');
  iframe.setAttribute('aria-label', 'Chat en vivo');
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.src = origin + '/widget/chat?parentOrigin=' + encodeURIComponent(window.location.origin);
  iframe.style.cssText = [
    'position:fixed',
    'bottom:20px',
    'right:20px',
    'width:72px',
    'height:72px',
    'border:0',
    'background:transparent',
    'z-index:2147483600',
    'color-scheme:normal',
    'transition:width .2s ease, height .2s ease'
  ].join(';');

  var sessionPromise = null;
  function startSession() {
    if (sessionPromise) return sessionPromise;
    var id = visitorId();
    if (!id) return Promise.reject(new Error('Secure browser randomness is required for chat'));
    sessionPromise = window.fetch(origin + '/api/public/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(widgetKey ? { widgetKey: widgetKey, visitorId: id } : { widgetId: Number(widgetId), visitorId: id })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok || !body.success) throw new Error(body.message || 'No se pudo iniciar el chat');
        return body.data;
      });
    }).catch(function (error) {
      // A temporary failure must not poison later open attempts.
      sessionPromise = null;
      throw error;
    });
    return sessionPromise;
  }

  function sendSession() {
    startSession().then(function (session) {
      if (iframe.contentWindow) iframe.contentWindow.postMessage({ type: 'sd-chat:session', session: session }, origin);
    }).catch(function (error) {
      if (iframe.contentWindow) iframe.contentWindow.postMessage({ type: 'sd-chat:error', message: error && error.message ? error.message : 'No se pudo iniciar el chat' }, origin);
    });
  }

  window.addEventListener('message', function (ev) {
    if (ev.origin !== origin) return;
    var data = ev.data;
    if (!data || typeof data !== 'object') return;
    if (ev.source !== iframe.contentWindow) return;
    if (data.type === 'sd-chat:start') {
      sendSession();
    } else if (data.type === 'sd-chat:resize') {
      if (data.expanded) {
        iframe.style.width = (data.width || 380) + 'px';
        iframe.style.height = (data.height || 560) + 'px';
      } else {
        iframe.style.width = '72px';
        iframe.style.height = '72px';
      }
    } else if (data.type === 'sd-chat:close') {
      iframe.style.width = '72px';
      iframe.style.height = '72px';
    }
  });

  function appendWhenReady() {
    if (document.body) document.body.appendChild(iframe);
    else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(iframe); });
  }
  appendWhenReady();
})();
