import type { ParsedPageNode } from './contracts.js';
import {
  PROFUNCTOR_PAGE_CANVAS,
  type ProfunctorPageBlockGeometry,
} from './profile.js';

export interface PreviewNode {
  readonly actionCount: number;
  readonly fill: string;
  readonly geometry: ProfunctorPageBlockGeometry;
  readonly pageNode: ParsedPageNode;
  readonly renderNodeId: string;
  readonly tokenReference: string;
}

export function renderProfunctorPageStructuralPreview(
  pageId: string,
  route: string,
  nodes: readonly PreviewNode[],
): string {
  const body = nodes
    .map((node, index) => renderNode(node, index))
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PROFUNCTOR_PAGE_CANVAS.width}" height="${PROFUNCTOR_PAGE_CANVAS.height}" viewBox="0 0 ${PROFUNCTOR_PAGE_CANVAS.width} ${PROFUNCTOR_PAGE_CANVAS.height}" role="img" aria-labelledby="title description">`,
    '  <title id="title">Geordi structural preview of the Keep Profunctor Page specimen</title>',
    `  <desc id="description">${escapeXml(pageId)} at ${escapeXml(route)}. Diagnostic rectangle geometry with explicit target nonclaims.</desc>`,
    '  <style>',
    '    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }',
    '    .label { font-size: 28px; font-weight: 700; }',
    '    .identity { font-size: 15px; }',
    '    .meta { font-size: 14px; }',
    '    .footer { font-size: 14px; fill: #0b1220; }',
    '  </style>',
    body,
    '  <g aria-label="Target nonclaims">',
    '    <text class="footer" x="64" y="1082">Diagnostic SVG labels use host SVG text; no Geordi text claim.</text>',
    '    <text class="footer" x="64" y="1104">No semantic HTML, native-link, accessibility-tree, or website pixel-parity claim.</text>',
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

function renderNode(node: PreviewNode, index: number): string {
  const { geometry, pageNode } = node;
  if (index === 0) {
    return [
      `  <g aria-label="${escapeXml(geometry.label)}">`,
      `    <rect x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" fill="${node.fill}" />`,
      `    <text class="label" x="24" y="38" fill="${geometry.textFill}">${escapeXml(geometry.label)}</text>`,
      `    <text class="identity" x="112" y="34" fill="${geometry.textFill}">${escapeXml(pageNode.pageNodeId)} · ${escapeXml(node.renderNodeId)}</text>`,
      '  </g>',
    ].join('\n');
  }

  const labelY = geometry.y + 42;
  const identityY = labelY + 28;
  const metaY = identityY + 24;
  const tokenY = metaY + 22;
  return [
    `  <g aria-label="${escapeXml(geometry.label)}">`,
    `    <rect x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" fill="${node.fill}" />`,
    `    <text class="label" x="${geometry.x + 24}" y="${labelY}" fill="${geometry.textFill}">${escapeXml(geometry.label)}</text>`,
    `    <text class="identity" x="${geometry.x + 24}" y="${identityY}" fill="${geometry.textFill}">${escapeXml(pageNode.pageNodeId)}</text>`,
    `    <text class="meta" x="${geometry.x + 24}" y="${metaY}" fill="${geometry.textFill}">${escapeXml(node.renderNodeId)}</text>`,
    `    <text class="meta" x="${geometry.x + 24}" y="${tokenY}" fill="${geometry.textFill}">${escapeXml(node.tokenReference)} · ${node.actionCount} action(s)</text>`,
    '  </g>',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
