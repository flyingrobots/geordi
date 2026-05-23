import './style.css';
import { mountBrowserHarnessShell } from './domShell.js';
import { createBrowserHarnessStatus } from './harnessModel.js';

mountBrowserHarnessShell(
  document.querySelector<HTMLElement>('#app'),
  createBrowserHarnessStatus(),
);
