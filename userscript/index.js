// ==UserScript==
// @name         React 18 + Tailwind (Shadow DOM, GitHub remote component)
// @namespace    daniel.userscripts
// @version      1.1.0
// @description  Safe, isolated Shadow DOM with React 18 and Tailwind-like styling via Twind, and bootstraps a component fetched from a public GitHub repo.
// @author       you
// @match        *://*/*
// @run-at       document-end
// @grant        GM_addElement
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  /**
   * Why Twind instead of Tailwind Play CDN?
   * - Tailwind's Play CDN injects global <style> into document, not into a ShadowRoot.
   * - Twind is a small, Tailwind-compatible runtime that can target a specific ShadowRoot.
   *   This keeps styles perfectly isolated while letting you use Tailwind utility classes.
   */

  /**
   * CONFIG — tweak these
   */
  const REACT_SRC = 'https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js';
  const REACT_DOM_SRC = 'https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js';

  // Best practical option for Tailwind-like utilities in a ShadowRoot:
  const TWIND_SRC = 'https://cdn.jsdelivr.net/npm/twind@1.1.3/dist/twind.umd.min.js';
  const TWIND_PRESET_AUTOPREFIX_SRC = 'https://cdn.jsdelivr.net/npm/twind@1.1.3/dist/preset-autoprefix.umd.min.js';
  const TWIND_PRESET_TAILWIND_SRC = 'https://cdn.jsdelivr.net/npm/@twind/preset-tailwind@1.1.4/dist/preset-tailwind.umd.min.js';

  // A public raw GitHub JS file that exports a React component.
  // Supports two formats:
  // 1) ESM: `export default function Component(props){...}`
  // 2) UMD: sets `window.RemoteComponent = function Component(props){...}`
  const REMOTE_COMPONENT_URL = 'https://raw.githubusercontent.com/uidotdev/react-gh-components/main/examples/HelloComponent.js';

  const HOST_ID = 'react-tailwind-shadow-host-iso';

  /** tiny helper to wait for DOM ready */
  const domReady = () => new Promise((resolve) => {
    if (document.readyState === 'interactive' || document.readyState === 'complete') return resolve();
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });

  /** Load external script with crossorigin via Tampermonkey's GM_addElement */
  function loadScript(src, attrs = {}) {
    return new Promise((resolve, reject) => {
      try {
        GM_addElement(document.head || document.documentElement, 'script', Object.assign({
          src,
          crossorigin: 'anonymous',
          async: false,
          onload: resolve,
          onerror: () => reject(new Error('Failed to load ' + src))
        }, attrs));
      } catch (e) { reject(e); }
    });
  }

  /** Create the Shadow DOM host and root container */
  function createShadowHost() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      // fixed container — adjust as needed
      host.style.all = 'initial';
      host.style.position = 'fixed';
      host.style.zIndex = '2147483647';
      host.style.bottom = '16px';
      host.style.right = '16px';
      host.style.width = '420px';
      host.style.maxWidth = 'min(92vw, 520px)';
      host.style.maxHeight = '80vh';
      host.style.pointerEvents = 'none';
      (document.body || document.documentElement).appendChild(host);
    }
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });

    // React mount node
    let mount = shadow.getElementById('root');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'root';
      mount.style.pointerEvents = 'auto';
      shadow.appendChild(mount);
    }

    // Local style for base layout only (not Tailwind — Twind will handle utilities)
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      *, *::before, *::after { box-sizing: border-box; }
      html, body, #root { margin: 0; padding: 0; }
    `;
    shadow.appendChild(style);

    return { host, shadow, mount };
  }

  /** Initialize Twind inside the ShadowRoot */
  function initTwind(shadow) {
    const tw = window.twind;
    const presetAutoprefix = window.presetAutoprefix;
    const presetTailwind = window.presetTailwind;
    if (!tw || !presetTailwind) throw new Error('Twind not loaded');
    const twConfig = {
      presets: [presetAutoprefix(), presetTailwind()],
      // You can extend here if you need custom colors, etc.
    };
    // Attach to shadow
    const twInstance = tw.install(twConfig, shadow);
    return twInstance;
  }

  /** Load a remote component from GitHub (ESM preferred, UMD fallback) */
  async function loadRemoteComponent(url) {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to fetch remote component: ' + res.status);
    const code = await res.text();

    // Try ESM dynamic import via blob
    try {
      const blob = new Blob([code], { type: 'text/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      const mod = await import(blobUrl);
      URL.revokeObjectURL(blobUrl);
      if (mod && (typeof mod.default === 'function' || typeof mod.default === 'object')) return mod.default;
    } catch (_) { /* fall through to UMD */ }

    // Try UMD: expect global RemoteComponent after eval
    try {
      const fn = new Function(code + '
;return (window.RemoteComponent||null);');
      const cmp = fn.call(window);
      if (cmp) return cmp;
    } catch (e) { console.error('UMD eval failed', e); }

    throw new Error('Could not resolve a component export from remote file. Expected ESM default export or window.RemoteComponent.');
  }

  /** Default placeholder component while remote loads */
  function makeShell(React, twx) {
    return function Shell() {
      return React.createElement(
        'div',
        { className: twx('bg-gray-900 text-gray-100 rounded-2xl shadow-2xl p-4 max-h-[80vh] overflow-auto') },
        React.createElement('div', { className: twx('flex items-center justify-between gap-2 mb-2') },
          React.createElement('h1', { className: twx('text-sm font-semibold tracking-wide') }, 'Shadow React + Tailwind (Twind)')
        ),
        React.createElement('p', { className: twx('text-xs text-gray-300') }, 'Laster fjern komponent fra GitHub …')
      );
    };
  }

  /** Boot */
  (async function boot() {
    await domReady();

    if (window.__reactShadowTailwindBooted) return;
    window.__reactShadowTailwindBooted = true;

    if (!window.React) await loadScript(REACT_SRC);
    if (!window.ReactDOM) await loadScript(REACT_DOM_SRC);

    // Load Twind + presets
    if (!window.twind) await loadScript(TWIND_SRC);
    if (!window.presetAutoprefix) await loadScript(TWIND_PRESET_AUTOPREFIX_SRC);
    if (!window.presetTailwind) await loadScript(TWIND_PRESET_TAILWIND_SRC);

    const { host, shadow, mount } = createShadowHost();

    // Init Twind bound to this shadow root
    const twInstance = initTwind(shadow);
    const twx = (...args) => twInstance.tw(...args); // helper to use inside createElement

    const React = window.React;
    const ReactDOM = window.ReactDOM;

    const root = ReactDOM.createRoot(mount);

    // Render shell immediately
    const Shell = makeShell(React, twx);
    root.render(React.createElement(Shell));

    // Load remote component, then replace shell
    try {
      const Remote = await loadRemoteComponent(REMOTE_COMPONENT_URL);
      // If the component is a default React component, just render it.
      // If it exports a factory, call it with React and twx.
      const element = (typeof Remote === 'function' && Remote.prototype && Remote.prototype.isReactComponent)
        ? React.createElement(Remote)
        : (typeof Remote === 'function')
          ? React.createElement(Remote, { React, tw: twx })
          : React.isValidElement(Remote)
            ? Remote
            : React.createElement('div', { className: twx('text-xs text-red-300') }, 'Ukjent export-type fra remote komponent.');

      root.render(React.createElement('div', { className: twx('bg-gray-900 text-gray-100 rounded-2xl shadow-2xl p-4 max-h-[80vh] overflow-auto') },
        React.createElement('div', { className: twx('flex items-center justify-between gap-2 mb-2') },
          React.createElement('h1', { className: twx('text-sm font-semibold tracking-wide') }, 'Remote component')
        ),
        element
      ));
    } catch (e) {
      console.error(e);
      root.render(React.createElement('div', { className: twx('bg-gray-900 text-gray-100 rounded-2xl shadow-2xl p-4') },
        React.createElement('div', { className: twx('text-red-300 text-xs') }, 'Klarte ikke å laste fjern komponent: ' + (e && e.message ? e.message : e))
      ));
    }

    // Debug helpers
    window.__reactShadowTailwind = {
      host,
      shadow,
      tw: twInstance,
      unmount() { try { root.unmount(); host.remove(); } catch (_) {} },
      reload(url) { return loadRemoteComponent(url || REMOTE_COMPONENT_URL).then((C) => root.render(React.createElement(C))); }
    };

    // Toggle hotkey
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'x') {
        host.style.display = (host.style.display === 'none') ? 'block' : 'none';
      }
    });
  })().catch(err => console.error('[userscript shadow-react+tailwind] boot error:', err));
})();
