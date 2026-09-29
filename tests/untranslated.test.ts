import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parseAst } from 'vite';
import { describe, expect, it } from 'vitest';

type Node = { type: string; [key: string]: unknown };

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && typeof (v as Node).type === 'string';

/** Attributes and props whose text reaches the screen or a screen reader. */
const CHECKED_ATTRS = new Set(['title', 'aria-label', 'placeholder', 'alt', 'label']);

/** Words that read the same in every language: units, compass north, instrument abbreviations, language names. */
const ALLOWED = /\b(km\/h|km|m|min|NM|MB|N|SOG|COG|GPS|DTW|BTW|XTE|VMG|ETA|English|Deutsch|v)\b/g;

const english = (text: string) => /[A-Za-z]/.test(text.replace(ALLOWED, ''));

/** Texts an expression shows itself: not arguments of a call (`t('key')`) and not operands of a comparison. */
function ownTexts(e: unknown): string[] {
  if (!isNode(e)) return [];
  switch (e.type) {
    case 'Literal':
      return typeof e.value === 'string' ? [e.value] : [];
    case 'TemplateLiteral':
      return [(e.quasis as { value: { cooked: string } }[]).map((q) => q.value.cooked).join(' ')];
    case 'ConditionalExpression':
      return [...ownTexts(e.consequent), ...ownTexts(e.alternate)];
    case 'LogicalExpression':
      return ownTexts(e.right);
    case 'ArrayExpression':
      return (e.elements as unknown[]).flatMap(ownTexts);
    case 'BinaryExpression':
      return e.operator === '+' ? [...ownTexts(e.left), ...ownTexts(e.right)] : [];
    case 'ParenthesizedExpression':
      return ownTexts(e.expression);
    default:
      return [];
  }
}

const attrName = (n: Node) => (n.name as { name?: string }).name ?? '';
const propName = (n: Node) => (n.key as { name?: string; value?: string }).name ?? (n.key as { value?: string }).value;

/** English texts written into JSX: text children, `{…}` children, and checked attributes and `label` properties. */
export function untranslated(source: string): string[] {
  const hits: string[] = [];
  const check = (texts: string[]) => hits.push(...texts.filter(english).map((s) => s.trim()));
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!isNode(node)) return;
    if (node.type === 'JSXText') check([node.value as string]);
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      for (const child of node.children as Node[])
        if (child.type === 'JSXExpressionContainer') check(ownTexts(child.expression));
    }
    if (node.type === 'JSXAttribute' && CHECKED_ATTRS.has(attrName(node))) {
      const value = node.value as Node | null;
      check(value?.type === 'JSXExpressionContainer' ? ownTexts(value.expression) : ownTexts(value));
    }
    if (node.type === 'Property' && propName(node) === 'label') check(ownTexts(node.value));
    for (const [key, value] of Object.entries(node)) if (key !== 'type' && typeof value === 'object') visit(value);
  };
  visit(parseAst(source, { lang: 'tsx' }));
  return hits;
}

describe('untranslated', () => {
  it('finds English JSX text, children and labels', () => {
    expect(untranslated(`const a = <button className="btn">Delete</button>;`)).toEqual(['Delete']);
    expect(untranslated(`const a = <button title="Move up" aria-label={'Close'}>↑</button>;`)).toEqual([
      'Move up',
      'Close',
    ]);
    expect(untranslated("const a = <span>{busy ? 'Saving…' : `In ${d} — ${text}`}</span>;")).toEqual([
      'Saving…',
      'In   —',
    ]);
    expect(untranslated(`const a = <input placeholder="unknown" />;`)).toEqual(['unknown']);
    expect(untranslated(`const a = <Stat label="Total" value={x} />;`)).toEqual(['Total']);
    expect(untranslated(`const o = [{ value: 5, label: '5 min' }, { value: 0, label: 'Off' }];`)).toEqual(['Off']);
  });

  it('lets keys, symbols, units, data and other attributes pass', () => {
    expect(
      untranslated(`const a = <div className="nav-cell warn" role="button">{t('nav.stop')} ✕ ⚑ ● ⚓ ☾ ☰</div>;`),
    ).toEqual([]);
    expect(
      untranslated('const a = <b data-value="sog">{`${radius} m`}{`${x} km/h`}SOG{formatCoord(lat, \'lat\')}</b>;'),
    ).toEqual([]);
    expect(untranslated(`const a = <p>{job.phase === 'estimating' ? t('course.estimating') : ''}</p>;`)).toEqual([]);
    expect(untranslated(`const a = <li key="x">{place.name}</li>;`)).toEqual([]);
  });
});

describe('UI texts', () => {
  const root = resolve(process.cwd(), 'src/ui');
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.tsx'));

  it('finds the components', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    it(`${relative(root, resolve(root, file))} writes no English into the markup`, () => {
      expect(untranslated(readFileSync(resolve(root, file), 'utf8'))).toEqual([]);
    });
  }
});
