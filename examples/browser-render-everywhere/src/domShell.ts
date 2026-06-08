import type { BrowserHarnessStatus } from './harnessModel.js';

export type BrowserHarnessMode = 'rectangles' | 'bunny' | 'text';

export interface BrowserHarnessShellMount {
  readonly bunnyCanvasSlot: HTMLElement;
  readonly bunnyReport: HTMLPreElement;
  readonly rectangleCanvasSlot: HTMLElement;
  readonly textCanvasSlot: HTMLElement;
  readonly textReport: HTMLPreElement;
}

export interface BrowserHarnessShellOptions {
  readonly bunnyRendererName: string;
  readonly textRendererName: string;
}

export class BrowserHarnessMountError extends Error {
  constructor() {
    super('Browser harness mount failed');
    this.name = new.target.name;
  }
}

interface BrowserHarnessShellBuild {
  readonly mount: BrowserHarnessShellMount;
  readonly shell: HTMLElement;
}

interface DemoPanelMount {
  readonly canvasSlot: HTMLElement;
  readonly panel: HTMLElement;
}

interface BunnyPanelMount extends DemoPanelMount {
  readonly report: HTMLPreElement;
}

interface TextPanelMount extends DemoPanelMount {
  readonly report: HTMLPreElement;
}

interface ModeButtonSet {
  readonly bunny: HTMLButtonElement;
  readonly rectangles: HTMLButtonElement;
  readonly text: HTMLButtonElement;
}

interface DemoPanelSet {
  readonly bunny: HTMLElement;
  readonly rectangles: HTMLElement;
  readonly text: HTMLElement;
}

interface HeadingMount {
  readonly element: HTMLElement;
  readonly marker: HTMLElement;
}

interface ModeSwitch {
  readonly buttons: ModeButtonSet;
  readonly element: HTMLElement;
}

interface RendererNameSet {
  readonly bunny: string;
  readonly rectangles: string;
  readonly text: string;
}

export function mountBrowserHarnessShell(
  root: HTMLElement | null,
  status: BrowserHarnessStatus,
  options: BrowserHarnessShellOptions,
): BrowserHarnessShellMount {
  if (root === null) {
    throw new BrowserHarnessMountError();
  }

  const build = createShell(status, options);
  root.replaceChildren(build.shell);
  return build.mount;
}

export function mountRenderedFixtureCanvas(
  slot: HTMLElement,
  canvas: HTMLCanvasElement,
): void {
  canvas.setAttribute('data-geordi-render-canvas', 'true');
  slot.replaceChildren(canvas);
}

export function mountBunnyCanvas(
  slot: HTMLElement,
  canvas: HTMLCanvasElement,
  report: HTMLPreElement,
  reportText: string,
): HTMLPreElement {
  canvas.setAttribute('data-geordi-bunny-canvas', 'true');
  report.textContent = reportText;
  slot.replaceChildren(canvas);
  return report;
}

export function mountStrictTextCanvas(
  slot: HTMLElement,
  canvas: HTMLCanvasElement,
  report: HTMLPreElement,
  reportText: string,
): HTMLPreElement {
  canvas.setAttribute('data-geordi-strict-text-canvas', 'true');
  report.textContent = reportText;
  slot.replaceChildren(canvas);
  return report;
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

function createShell(
  status: BrowserHarnessStatus,
  options: BrowserHarnessShellOptions,
): BrowserHarnessShellBuild {
  const shell = document.createElement('section');
  shell.className = 'harness-shell';

  const modeSwitch = createModeSwitch();
  const heading = createHeading(status);
  const rectanglePanel = createRectanglePanel(status);
  const bunnyPanel = createBunnyPanel();
  const textPanel = createTextPanel();
  const panels: DemoPanelSet = {
    bunny: bunnyPanel.panel,
    rectangles: rectanglePanel.panel,
    text: textPanel.panel,
  };
  const rendererNames: RendererNameSet = {
    bunny: options.bunnyRendererName,
    rectangles: status.rendererName,
    text: options.textRendererName,
  };

  modeSwitch.buttons.rectangles.addEventListener('click', () => {
    setActiveMode('rectangles', modeSwitch.buttons, panels, heading.marker, rendererNames);
  });
  modeSwitch.buttons.bunny.addEventListener('click', () => {
    setActiveMode('bunny', modeSwitch.buttons, panels, heading.marker, rendererNames);
  });
  modeSwitch.buttons.text.addEventListener('click', () => {
    setActiveMode('text', modeSwitch.buttons, panels, heading.marker, rendererNames);
  });
  setActiveMode('bunny', modeSwitch.buttons, panels, heading.marker, rendererNames);

  shell.append(
    heading.element,
    modeSwitch.element,
    rectanglePanel.panel,
    bunnyPanel.panel,
    textPanel.panel,
  );
  return {
    mount: {
      bunnyCanvasSlot: bunnyPanel.canvasSlot,
      bunnyReport: bunnyPanel.report,
      rectangleCanvasSlot: rectanglePanel.canvasSlot,
      textCanvasSlot: textPanel.canvasSlot,
      textReport: textPanel.report,
    },
    shell,
  };
}

function createHeading(status: BrowserHarnessStatus): HeadingMount {
  const heading = document.createElement('header');
  heading.className = 'harness-heading';

  const title = document.createElement('h1');
  title.textContent = 'Geordi Render Everywhere';

  const marker = document.createElement('span');
  marker.className = 'harness-marker';
  marker.textContent = status.rendererName;

  heading.append(title, marker);
  return {
    element: heading,
    marker,
  };
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

function createModeSwitch(): ModeSwitch {
  const element = document.createElement('nav');
  element.className = 'mode-switch';
  element.setAttribute('aria-label', 'Demo scene');

  const buttons: ModeButtonSet = {
    bunny: createModeButton('bunny', 'Bunny'),
    rectangles: createModeButton('rectangles', 'Rectangles'),
    text: createModeButton('text', 'Text'),
  };
  element.append(buttons.rectangles, buttons.bunny, buttons.text);
  return { buttons, element };
}

function createModeButton(mode: BrowserHarnessMode, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'mode-button';
  button.setAttribute('data-geordi-demo-mode', mode);
  button.textContent = label;
  button.type = 'button';
  return button;
}

function createRectanglePanel(status: BrowserHarnessStatus): DemoPanelMount {
  const panel = createDemoPanel('rectangles', 'Rectangle fixture');
  const metadata = createMetadataPanel('Rectangle metadata');
  const canvasSlot = createViewportSlot();

  metadata.append(createStatusGrid(status));
  panel.append(metadata, canvasSlot);
  return { canvasSlot, panel };
}

function createBunnyPanel(): BunnyPanelMount {
  const panel = createDemoPanel('bunny', 'Stanford bunny fixture');
  const metadata = createMetadataPanel('Bunny metadata');
  const report = document.createElement('pre');
  const canvasSlot = createViewportSlot();

  report.className = 'bunny-report';
  report.setAttribute('data-geordi-bunny-report', 'true');

  metadata.append(report);
  panel.append(metadata, canvasSlot);
  return { canvasSlot, panel, report };
}

function createTextPanel(): TextPanelMount {
  const panel = createDemoPanel('text', 'Strict text fixture');
  const metadata = createMetadataPanel('Text metadata');
  const report = document.createElement('pre');
  const canvasSlot = createViewportSlot();

  report.className = 'text-report';
  report.setAttribute('data-geordi-strict-text-report', 'true');

  metadata.append(report);
  panel.append(metadata, canvasSlot);
  return { canvasSlot, panel, report };
}

function createDemoPanel(mode: BrowserHarnessMode, label: string): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'demo-panel';
  panel.setAttribute('aria-label', label);
  panel.setAttribute('data-geordi-demo-panel', mode);
  return panel;
}

function createMetadataPanel(summaryText: string): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'metadata-panel';

  const summary = document.createElement('summary');
  summary.textContent = summaryText;

  details.append(summary);
  return details;
}

function setActiveMode(
  mode: BrowserHarnessMode,
  buttons: ModeButtonSet,
  panels: DemoPanelSet,
  marker: HTMLElement,
  rendererNames: RendererNameSet,
): void {
  const bunnyActive = mode === 'bunny';
  const rectanglesActive = mode === 'rectangles';
  const textActive = mode === 'text';

  buttons.rectangles.setAttribute('aria-pressed', String(rectanglesActive));
  buttons.bunny.setAttribute('aria-pressed', String(bunnyActive));
  buttons.text.setAttribute('aria-pressed', String(textActive));
  panels.rectangles.hidden = !rectanglesActive;
  panels.bunny.hidden = !bunnyActive;
  panels.text.hidden = !textActive;
  marker.textContent = rendererNames[mode];
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
  return viewport;
}
