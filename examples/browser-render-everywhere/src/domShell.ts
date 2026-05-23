import type { BrowserHarnessStatus } from './harnessModel.js';

export class BrowserHarnessMountError extends Error {
  constructor() {
    super('Browser harness mount failed');
    this.name = new.target.name;
  }
}

export function mountBrowserHarnessShell(
  root: HTMLElement | null,
  status: BrowserHarnessStatus,
): void {
  if (root === null) {
    throw new BrowserHarnessMountError();
  }

  root.replaceChildren(createShell(status));
}

function createShell(status: BrowserHarnessStatus): HTMLElement {
  const shell = document.createElement('section');
  shell.className = 'harness-shell';
  shell.append(createHeading(), createStatusGrid(status), createViewportSlot());
  return shell;
}

function createHeading(): HTMLElement {
  const heading = document.createElement('header');
  heading.className = 'harness-heading';

  const title = document.createElement('h1');
  title.textContent = 'Geordi Render Everywhere';

  const marker = document.createElement('span');
  marker.className = 'harness-marker';
  marker.textContent = 'Browser Canvas';

  heading.append(title, marker);
  return heading;
}

function createStatusGrid(status: BrowserHarnessStatus): HTMLElement {
  const grid = document.createElement('dl');
  grid.className = 'status-grid';
  appendStatus(grid, 'IR', status.irVersion);
  appendStatus(grid, 'Numeric', status.numericProfile);
  appendStatus(grid, 'Fixture', status.fixtureVersion);
  appendStatus(grid, 'Features', String(status.supportedFeatureCount));
  return grid;
}

function appendStatus(grid: HTMLElement, label: string, value: string): void {
  const item = document.createElement('div');
  item.className = 'status-item';

  const term = document.createElement('dt');
  term.textContent = label;

  const description = document.createElement('dd');
  description.textContent = value;

  item.append(term, description);
  grid.append(item);
}

function createViewportSlot(): HTMLElement {
  const viewport = document.createElement('section');
  viewport.className = 'viewport-slot';
  viewport.setAttribute('data-harness-canvas-slot', 'true');
  return viewport;
}
