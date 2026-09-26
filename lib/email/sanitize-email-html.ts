import postcss from 'postcss';
import { sanitizeRichHtmlWithStyleFilter } from '@/lib/security/sanitize-html';

export const MAX_EMAIL_HTML_BYTES = 1_000_000;

export class EmailHtmlTooLargeError extends Error {
  constructor() {
    super('Email HTML must not exceed 1 MB');
    this.name = 'EmailHtmlTooLargeError';
  }
}

const ALLOWED_CSS_AT_RULES = new Set([
  'font-face',
  'keyframes',
  'media',
  'supports',
  '-webkit-keyframes',
]);

function decodeCssEscapes(value: string): string {
  return value.replace(/\\([\da-f]{1,6})\s?|\\(.)/gi, (_match, hex: string | undefined, escaped: string | undefined) => {
    if (!hex) return escaped ?? '';
    const codePoint = Number.parseInt(hex, 16);
    return String.fromCodePoint(codePoint <= 0x10ffff ? codePoint : 0xfffd);
  });
}

function isAllowedCssUrl(value: string): boolean {
  const url = decodeCssEscapes(value).trim().replace(/^['"]|['"]$/g, '').trim();
  return /^(?:https?:)?\/\//i.test(url)
    || /^data:image\/(?:png|gif|jpe?g|webp);base64,[a-z\d+/=\s]+$/i.test(url);
}

function hasUnsafeCssValue(value: string): boolean {
  const normalized = decodeCssEscapes(value).replace(/\/\*[\s\S]*?\*\//g, '');
  const compact = normalized.replace(/\s+/g, '').toLowerCase();
  if (/expression\(|javascript:|vbscript:|behavior:|-moz-binding:/.test(compact)) return true;

  const urlPattern = /url\s*\(\s*(?:(["'])(.*?)\1|([^)]*))\s*\)/gi;
  const urls = [...normalized.matchAll(urlPattern)];
  if (/url\s*\(/i.test(normalized) && urls.length === 0) return true;
  if (urls.some(match => !isAllowedCssUrl(match[2] ?? match[3] ?? ''))) return true;
  return /url\s*\(/i.test(normalized.replace(urlPattern, ''));
}

function sanitizeStylesheet(css: string): string {
  let root: postcss.Root;
  try {
    root = postcss.parse(css);
  } catch {
    return '';
  }

  root.walkAtRules(rule => {
    if (!ALLOWED_CSS_AT_RULES.has(rule.name.toLowerCase()) || hasUnsafeCssValue(rule.params)) {
      rule.remove();
    }
  });
  root.walkDecls(declaration => {
    const property = decodeCssEscapes(declaration.prop).trim().toLowerCase();
    if (property === 'behavior' || property === '-moz-binding' || hasUnsafeCssValue(declaration.value)) {
      declaration.remove();
    }
  });

  const safeCss = root.toString();
  return /<\/style/i.test(safeCss) ? '' : safeCss;
}

function sanitizeInlineStyle(css: string): string {
  let root: postcss.Root;
  try {
    root = postcss.parse(`.email-inline-style { ${css} }`);
  } catch {
    return '';
  }

  root.walkAtRules(rule => {
    rule.remove();
  });
  root.walkDecls(declaration => {
    const property = decodeCssEscapes(declaration.prop).trim().toLowerCase();
    if (property === 'behavior' || property === '-moz-binding' || hasUnsafeCssValue(declaration.value)) {
      declaration.remove();
    }
  });

  const rule = root.nodes.find(node => node.type === 'rule');
  if (rule?.type !== 'rule' || !rule.nodes?.length) return '';
  return rule.nodes
    .filter(node => node.type === 'decl')
    .map(node => node.toString())
    .join('; ');
}

/**
 * Sanitize email HTML while retaining safe stylesheet blocks used by responsive
 * email templates. Full-document imports are reduced to their body fragment;
 * CSS is parsed and restricted before it is stored or previewed.
 */
export function sanitizeEmailHtml(input: string): string {
  const source = input ?? '';
  if (new TextEncoder().encode(source).byteLength > MAX_EMAIL_HTML_BYTES) {
    throw new EmailHtmlTooLargeError();
  }

  const stylesheets: string[] = [];
  const withoutStyles = source.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_style, css: string) => {
    stylesheets.push(css);
    return '';
  });

  const bodyMatch = withoutStyles.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  const fragment = bodyMatch
    ? bodyMatch[1]
    : withoutStyles
      .replace(/<!doctype\b[^>]*>/gi, '')
      .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, '')
      .replace(/<\/?(?:html|body)\b[^>]*>/gi, '');

  const safeStyles = stylesheets
    .map(sanitizeStylesheet)
    .filter(Boolean)
    .map(css => `<style type="text/css">${css}</style>`);
  const safeBody = sanitizeRichHtmlWithStyleFilter(fragment.trim(), sanitizeInlineStyle);
  return [...safeStyles, safeBody].filter(Boolean).join('\n');
}
