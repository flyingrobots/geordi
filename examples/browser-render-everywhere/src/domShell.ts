import type { BrowserHarnessStatus } from './harnessModel.js';

export class BrowserHarnessMountError extends Error {
  constructor() {
    super('Browser harness mount failed');
    this.name = new.target.name;
  }
}

export class BrowserHarnessCanvasSlotError extends Error {
  public readonly slotCount: number;

  constructor(slotCount: number) {
    super('Browser harness canvas slot invalid');
    this.name = new.target.name;
    this.slotCount = slotCount;
  }
}

const CANVAS_SLOT_ATTRIBUTE = 'data-harness-canvas-slot' as const;
const CANVAS_SLOT_SELECTOR = `[${CANVAS_SLOT_ATTRIBUTE}="true"]` as const;

export function mountBrowserHarnessShell(
  root: HTMLElement | null,
  status: BrowserHarnessStatus,
): void {
  if (root === null) {
    throw new BrowserHarnessMountError();
  }

  root.replaceChildren(createShell(status));
}

export function mountRenderedFixtureCanvas(
  root: ParentNode | null,
  canvas: HTMLCanvasElement,
): void {
  if (root === null) {
    throw new BrowserHarnessMountError();
  }

  const slots = root.querySelectorAll<HTMLElement>(CANVAS_SLOT_SELECTOR);
  if (slots.length !== 1) {
    throw new BrowserHarnessCanvasSlotError(slots.length);
  }

  const slot = slots.item(0);
  canvas.setAttribute('data-geordi-render-canvas', 'true');
  slot.replaceChildren(canvas);
}

export function mountBunnyCanvas(
  root: ParentNode | null,
  canvas: HTMLCanvasElement,
  reportText: string,
): HTMLParagraphElement {
  if (root === null) {
    throw new BrowserHarnessMountError();
  }

  const section = document.createElement('section');
  section.className = 'bunny-demo';

  const label = document.createElement('p');
  label.className = 'bunny-demo-label';
  label.setAttribute('data-geordi-bunny-report', 'true');
  label.textContent = reportText;

  section.append(label, canvas);
  root.append(section);
  return label;
}

export function mountBrowserHarnessFailure(root: HTMLElement | null): void {
  if (root === null) {
    return;
  }

  const failure = document.createElement('section');
  failure.className = 'harness-failure';
  failure.textContent = 'Render failed';
  root.replaceChildren(failure);
}

function createShell(status: BrowserHarnessStatus): HTMLElement {
  const shell = document.createElement('section');
  shell.className = 'harness-shell';
  shell.append(createHeading(status), createStatusGrid(status), createViewportSlot());
  return shell;
}

function createHeading(status: BrowserHarnessStatus): HTMLElement {
  const heading = document.createElement('header');
  heading.className = 'harness-heading';

  const title = document.createElement('h1');
  title.textContent = 'Geordi Render Everywhere';

  const marker = document.createElement('span');
  marker.className = 'harness-marker';
  marker.textContent = status.rendererName;

  heading.append(title, marker);
  return heading;
}

function createStatusGrid(status: BrowserHarnessStatus): HTMLElement {
  const grid = document.createElement('dl');
  grid.className = 'status-grid';
  appendStatus(grid, 'Renderer', status.rendererName);
  appendStatus(grid, 'Fixture ID', status.fixtureId);
  appendStatus(grid, 'Artifact Hash', status.artifactHash);
  appendStatus(grid, 'IR', status.irVersion);
  appendStatus(grid, 'Numeric', status.numericProfile);
  appendStatus(grid, 'Fixture', status.fixtureVersion);
  appendStatus(grid, 'Feature Requirements', status.featureRequirements.join(', '));
  appendStatus(grid, 'Runtime Features', String(status.supportedFeatureCount));
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
  viewport.setAttribute(CANVAS_SLOT_ATTRIBUTE, 'true');
  return viewport;
}
