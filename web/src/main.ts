import '@momentum-design/tokens/dist/css/core/complete.css';
import '@momentum-design/tokens/dist/css/typography/complete.css';
import '@momentum-design/tokens/dist/css/components/complete.css';
import '@momentum-design/tokens/dist/css/theme/webex/dark-stable.css';
import '@momentum-design/fonts/dist/css/fonts.css';

import '@momentum-design/components/browser';

import './style.css';

const STROKED_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M 3 12 L 21 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
</svg>`;

function parseFilenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const m = /filename="([^"]+)"/.exec(header) || /filename=(.+)/.exec(header);
  return m ? m[1].trim() : null;
}

function showToast(
  el: HTMLElement & { variant?: string; headerText?: string; hidden?: boolean },
  header: string,
  variant: 'success' | 'error' | 'warning',
  body?: string,
) {
  el.hidden = false;
  el.variant = variant;
  el.headerText = header;
  const bodyEl = el.querySelector<HTMLElement>('[data-toast-body]');
  if (bodyEl) bodyEl.textContent = body ?? '';
}

function hideToast(el: HTMLElement & { hidden?: boolean }) {
  el.hidden = true;
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<mdc-themeprovider themeclass="mds-theme-stable-darkWebex" class="app-shell">
  <mdc-iconprovider icon-set="momentum-icons">
    <div class="hero" role="presentation">
      <div class="hero-mesh" aria-hidden="true">
        <img class="hero-mesh__layer hero-mesh__layer--1" src="/hero-mesh/mesh-1.svg" alt="" />
        <img class="hero-mesh__layer hero-mesh__layer--2" src="/hero-mesh/mesh-2.svg" alt="" />
        <img class="hero-mesh__layer hero-mesh__layer--3" src="/hero-mesh/mesh-3.svg" alt="" />
        <img class="hero-mesh__layer hero-mesh__layer--4" src="/hero-mesh/mesh-4.svg" alt="" />
        <img class="hero-mesh__layer hero-mesh__layer--5" src="/hero-mesh/mesh-5.svg" alt="" />
        <img class="hero-mesh__layer hero-mesh__layer--6" src="/hero-mesh/mesh-6.svg" alt="" />
        <img class="hero-mesh__layer hero-mesh__layer--7" src="/hero-mesh/mesh-7.svg" alt="" />
      </div>
      <div class="glass-card">
        <div class="glass-card__intro">
          <h1 class="glass-card__title">SVG to SF Symbol</h1>
          <p class="glass-card__body">
            Yep! You read that right… It’s an honest to goodness converter for SF Symbols. Upload a stroked SVG icon.
            Then we’ll convert it to an SF Symbol Template.
          </p>
        </div>
        <input type="file" id="file-input" class="visually-hidden" accept=".svg,image/svg+xml" />
        <div class="glass-card__actions">
          <button type="button" class="btn-pill btn-pill--secondary" id="pick-btn">Choose file</button>
          <button type="button" class="btn-pill btn-pill--primary" id="convert-btn" disabled>Convert</button>
          <mdc-spinner id="busy-spinner" size="midsize" class="glass-card__spinner" style="display: none" aria-label="Converting"></mdc-spinner>
        </div>
        <p class="glass-card__file" id="file-label">No file selected</p>
      </div>
    </div>
  </mdc-iconprovider>
</mdc-themeprovider>
<div class="toast-stack" aria-live="polite">
  <mdc-toast id="toast-ok" variant="success" hidden header-text="Done">
    <mdc-text slot="toast-body-normal" tagname="span" type="body-midsize-regular" data-toast-body></mdc-text>
  </mdc-toast>
  <mdc-toast id="toast-err" variant="error" hidden header-text="Error">
    <mdc-text slot="toast-body-normal" tagname="span" type="body-midsize-regular" data-toast-body></mdc-text>
  </mdc-toast>
</div>
`;

const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
const pickBtn = document.querySelector('#pick-btn')!;
const convertBtn = document.querySelector('#convert-btn')!;
const fileLabel = document.querySelector('#file-label')!;
const busySpinner = document.querySelector<HTMLElement>('#busy-spinner')!;
const toastOk = document.querySelector('#toast-ok') as HTMLElement & {
  variant?: string;
  headerText?: string;
  hidden?: boolean;
};
const toastErr = document.querySelector('#toast-err') as HTMLElement & {
  variant?: string;
  headerText?: string;
  hidden?: boolean;
};

let selectedFile: File | null = null;
let lastBlobUrl: string | null = null;

pickBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0] ?? null;
  selectedFile = f;
  fileLabel.textContent = f ? f.name : 'No file selected';
  (convertBtn as HTMLButtonElement).disabled = !f;
  hideToast(toastOk);
  hideToast(toastErr);
});

convertBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  hideToast(toastOk);
  hideToast(toastErr);
  (convertBtn as HTMLButtonElement).disabled = true;
  busySpinner.style.display = '';

  const body = new FormData();
  body.append('file', selectedFile, selectedFile.name);

  try {
    const res = await fetch('/api/convert', { method: 'POST', body });
    if (!res.ok) {
      const raw = await res.text();
      let detail = res.statusText || `HTTP ${res.status}`;
      const trimmed = raw.trim();
      if (trimmed) {
        try {
          const j = JSON.parse(trimmed) as { detail?: string | { msg?: string } };
          if (typeof j.detail === 'string') detail = j.detail;
          else if (j.detail && typeof j.detail === 'object' && 'msg' in j.detail)
            detail = String((j.detail as { msg: string }).msg);
          else detail = trimmed.slice(0, 800);
        } catch {
          detail = trimmed.slice(0, 800);
        }
      }
      showToast(toastErr, 'Conversion failed', 'error', detail);
      return;
    }

    const blob = await res.blob();
    if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = URL.createObjectURL(blob);
    const name =
      parseFilenameFromDisposition(res.headers.get('Content-Disposition')) ??
      `${selectedFile.name.replace(/\.svg$/i, '')}_SFSymbol.svg`;

    const a = document.createElement('a');
    a.href = lastBlobUrl;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();

    showToast(
      toastOk,
      'Complete',
      'success',
      'Your SF Symbol SVG download should start automatically.',
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    showToast(toastErr, 'Request failed', 'error', msg);
  } finally {
    busySpinner.style.display = 'none';
    (convertBtn as HTMLButtonElement).disabled = !selectedFile;
  }
});

toastOk.addEventListener('close', () => hideToast(toastOk));
toastErr.addEventListener('close', () => hideToast(toastErr));

// Dev-only: expose minimal SVG for quick manual tests (optional).
if (import.meta.env.DEV) {
  (window as unknown as { __demoSvg: () => string }).__demoSvg = () => STROKED_SVG;
}
