// ==UserScript==
// @name         React 18 + Tailwind (Shadow DOM, GitHub UMD component) — robust
// @namespace    daniel.userscripts
// @version      1.5.0
// @description  Isolert Shadow DOM med React 18 og remote UMD-komponent. Root: fixed bottom-right 350x350, bg black, text white, rounded-xl. Ekstra logging/diagnostikk.
// @match        *://*/*
// @run-at       document-end
// @grant        GM_addElement
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  // React 18 (UMD)
  const REACT_SRC = 'https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js';
  const REACT_DOM_SRC = 'https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js';

  // Tailwind-utilities i ShadowRoot via Twind (frivillig)
  const TWIND_SRC = 'https://cdn.jsdelivr.net/npm/twind@1.1.3/dist/twind.umd.min.js';
  const TWIND_PRESET_AUTOPREFIX_SRC = 'https://cdn.jsdelivr.net/npm/twind@1.1.3/dist/preset-autoprefix.umd.min.js';
  const TWIND_PRESET_TAILWIND_SRC = 'https://cdn.jsdelivr.net/npm/@twind/preset-tailwind@1.1.4/dist/preset-tailwind.umd.min.js';

  // Din bygde komponent (UMD)
  const REMOTE_COMPONENT_URL = 'https://raw.githubusercontent.com/dingemoe/ui/main/dist/hello-component.umd.js';

  const HOST_ID = 'react-tailwind-shadow-host-iso';

  // ---- helpers -------------------------------------------------------------

  const log = (...args) => console.log('[shadow-umd]', ...args);
  const err = (...args) => console.error('[shadow-umd]', ...args);

  const domReady = () => new Promise((resolve) => {
    if (document.readyState === 'interactive' || document.readyState === 'complete') return resolve();
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });

  function loadScript(src, attrs = {}) {
    return new Promise((resolve, reject) => {
      try {
        GM_addElement(document.head || document.documentElement, 'script', Object.assign({
          src,
          crossorigin: 'anonymous',
          async: false,
          onload: () => { log('loaded', src); resolve(); },
          onerror: () => reject(new Error('Failed to load ' + src))
        }, attrs));
      } catch (e) { reject(e); }
    });
  }

  // ---- UI host -------------------------------------------------------------

  function createShadowHost() {
    // synlig “boot stripe” så du vet at scriptet kjører
    const stripe = document.createElement('div');
    stripe.textContent = 'BOOTED userscript';
    stripe.style.cssText = 'position:fixed;bottom:360px;right:0;z-index:2147483647;background:#ef4444;color:#fff;font:12px/1.4 system-ui;padding:2px 6px;border-radius:6px 0 0 6px;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    document.documentElement.appendChild(stripe);
    setTimeout(() => stripe.remove(), 1500);

    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;

      // Nøyaktig ønsket stil (og max z-index)
      host.style.all = 'initial';
      host.style.position = 'fixed';
      host.style.zIndex = '2147483647';
      host.style.bottom = '0';
      host.style.right = '0';
      host.style.width = '350px';
      host.style.height = '350px';
      host.style.background = 'black';
      host.style.color = 'white';
      host.style.borderRadius = '0.75rem'; // ~ rounded-xl
      host.style.overflow = 'hidden';
      host.style.pointerEvents = 'auto';
      host.style.boxShadow = '0 12px 30px rgba(0,0,0,.35)';

      (document.body || document.documentElement).appendChild(host);
    }

    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });

    // React mount node fyller hele flaten
    let mount = shadow.getElementById('root');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'root';
      mount.style.width = '100%';
      mount.style.height = '100%';
      shadow.appendChild(mount);
    }

    // Lokal reset i shadow
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      *, *::before, *::after { box-sizing: border-box; }
      html, body, #root { margin: 0; padding: 0; }
    `;
    shadow.appendChild(style);

    return { host, shadow, mount };
  }

  function initTwind(shadow) {
    const tw = window.twind;
    const presetAutoprefix = window.presetAutoprefix;
    const presetTailwind = window.presetTailwind;
    if (!tw || !presetTailwind) return null;
    const twConfig = { presets: [presetAutoprefix(), presetTailwind()] };
    return tw.install(twConfig, shadow);
  }

  // ---- UMD loader (robust) ------------------------------------------------

  async function fetchText(url) {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return res.text();
  }

  function pickLikelyExport(beforeKeys, afterKeys) {
    const newKeys = afterKeys.filter(k => !beforeKeys.includes(k));
    // prøv å prioritere noen vanlige navn
    const priority = ['RemoteComponent', 'default', 'App', 'HelloComponent', 'Component'];
    for (const name of priority) if (afterKeys.includes(name)) return name;
    // ellers ta første nye nøkkel som peker på en funksjon/objekt
    for (const k of newKeys) {
      try {
        const v = window[k];
        if (typeof v === 'function' || (v && typeof v === 'object')) return k;
      } catch (_) {}
    }
    return null;
  }

  async function loadRemoteUMD(url) {
    const code = await fetchText(url);

    const beforeKeys = Object.getOwnPropertyNames(window);
    // Eval i globalt scope, med React injisert
    const factory = new Function('window', 'document', 'React', `
      try {
        ${code}
        return true;
      } catch (e) {
        console.error('UMD eval error:', e);
        return false;
      }
    `);

    const ok = factory(window, document, window.React);
    if (!ok) throw new Error('Eval failure (see console)');

    const afterKeys = Object.getOwnPropertyNames(window);
    const pick = pickLikelyExport(beforeKeys, afterKeys);

    const candidates = [
      window.RemoteComponent,
      window.default,
      window.App,
      window.HelloComponent,
      window.Component,
      pick ? window[pick] : null
    ].filter(Boolean);

    log('UMD candidates:', candidates.length, 'picked key:', pick);

    const first = candidates[0] || null;
    if (!first) throw new Error('UMD did not expose a usable component');

    return first;
  }

  // ---- UI shells ----------------------------------------------------------

  function Shell(React) {
    return function () {
      return React.createElement(
        'div',
        { style: { width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'black', color: 'white' } },
        React.createElement('div', { style: { fontSize: 12, opacity: 0.8 } }, 'Laster fjern komponent …')
      );
    };
  }

  function ErrorView(React, message) {
    return React.createElement(
      'div',
      { style: { padding: 12, fontSize: 12, background: 'black', color: '#fca5a5', height: '100%', overflow: 'auto' } },
      String(message)
    );
  }

  // ---- boot ---------------------------------------------------------------

  (async function boot() {
    await domReady();

    if (window.__reactShadowTailwindBooted) return;
    window.__reactShadowTailwindBooted = true;

    // React
    if (!window.React) await loadScript(REACT_SRC);
    if (!window.ReactDOM) await loadScript(REACT_DOM_SRC);

    const { host, shadow, mount } = createShadowHost();

    // (Valgfritt) Twind
    try {
      if (!window.twind) await loadScript(TWIND_SRC);
      if (!window.presetAutoprefix) await loadScript(TWIND_PRESET_AUTOPREFIX_SRC);
      if (!window.presetTailwind) await loadScript(TWIND_PRESET_TAILWIND_SRC);
      initTwind(shadow);
    } catch (_) {}

    const React = window.React;
    const ReactDOM = window.ReactDOM;

    const root = ReactDOM.createRoot(mount);
    root.render(React.createElement(Shell(React)));

    // Debug API
    window.__shadowUmd = {
      host, shadow, mount,
      reload: async () => {
        try {
          const Remote = await loadRemoteUMD(REMOTE_COMPONENT_URL);
          const element = (typeof Remote === 'function') ? React.createElement(Remote)
                        : React.isValidElement(Remote) ? Remote
                        : React.createElement('div', null, 'Invalid UMD component export');
          root.render(React.createElement('div', { style: { width: '100%', height: '100%', background: 'black', color: 'white' } }, element));
        } catch (e) {
          err(e);
          root.render(ErrorView(React, 'Failed to load remote component: ' + (e && e.message ? e.message : e)));
        }
      }
    };

    try {
      log('Fetching UMD from:', REMOTE_COMPONENT_URL);
      const Remote = await loadRemoteUMD(REMOTE_COMPONENT_URL);
      const element = (typeof Remote === 'function') ? React.createElement(Remote)
                    : React.isValidElement(Remote) ? Remote
                    : React.createElement('div', null, 'Invalid UMD component export');

      root.render(
        React.createElement('div', { style: { width: '100%', height: '100%', background: 'black', color: 'white' } }, element)
      );
      log('Rendered remote component.');
    } catch (e) {
      err(e);
      root.render(ErrorView(React, 'Failed to load remote component: ' + (e && e.message ? e.message : e)));
    }

    // Toggle med Ctrl+Alt+X
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'x') {
        host.style.display = (host.style.display === 'none') ? 'block' : 'none';
      }
    });
  })().catch(e => err('boot error:', e));
})();
