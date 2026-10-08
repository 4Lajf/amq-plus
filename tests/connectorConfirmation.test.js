import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../amqPlusConnector.user.js', import.meta.url), 'utf8');
const start = source.indexOf('let connectorConfirmationOpen = false;');
const end = source.indexOf('async function unlinkTrainingAccount()', start);
if (start < 0 || end < 0) throw new Error('Connector confirmation implementation not found');
function setup({ supported = true, failOnce = false } = {}) {
 const nodes = [];
 const opener = { isConnected: true, focus: vi.fn() };
 const document = {
  activeElement: opener,
  body: { append: vi.fn() },
  createElement(tag) {
   const node = new EventTarget();
   Object.assign(node, { tag, style: {}, children: [], setAttribute: vi.fn(), focus: vi.fn(), remove: vi.fn(), append(...children) { this.children.push(...children); } });
   if (tag === 'dialog' && supported) node.showModal = () => { if (failOnce) { failOnce = false; throw new Error('render failed'); } };
   nodes.push(node);
   return node;
  }
 };
 const warn = vi.fn();
 const confirm = Function('document', 'sendSystemMessage', `${source.slice(start, end)}; return confirmConnectorAction;`)(document, warn);
 const click = text => nodes.findLast(node => node.tag === 'button' && node.textContent === text).dispatchEvent(new Event('click'));
 return { confirm, warn, nodes, opener, click, document };
}

describe('connector in-page confirmation without AMQ popup globals', () => {
 it('accepts only an explicit confirmation and restores focus after either decision', async () => {
  const ctx = setup();
  let result = ctx.confirm('Title', '<b>literal text</b>', 'Proceed');
  expect(ctx.nodes.find(node => node.tag === 'p').textContent).toBe('<b>literal text</b>');
  expect(ctx.nodes.find(node => node.textContent === 'Cancel').focus).toHaveBeenCalledOnce();
  ctx.click('Cancel');
  expect(await result).toBe(false);
  result = ctx.confirm('Title', 'Text', 'Proceed');
  ctx.click('Proceed');
  expect(await result).toBe(true);
  expect(ctx.opener.focus).toHaveBeenCalledTimes(2);
 });
 it('treats Escape and external close as cancellation', async () => {
  const ctx = setup();
  for (const event of ['cancel', 'close']) {
   const result = ctx.confirm('Title', 'Text', 'Proceed');
   const dialog = ctx.nodes.findLast(node => node.tag === 'dialog');
   dialog.dispatchEvent(new Event(event, { cancelable: true }));
   expect(await result).toBe(false);
   expect(dialog.remove).toHaveBeenCalledOnce();
  }
 });
 it('does not replace an open confirmation with a second action', async () => {
  const ctx = setup();
  const first = ctx.confirm('First', 'Text', 'Proceed');
  expect(await ctx.confirm('Second', 'Text', 'Proceed')).toBe(false);
  expect(ctx.document.body.append).toHaveBeenCalledOnce();
  ctx.click('Proceed');
  expect(await first).toBe(true);
 });
 it('cleans up and releases the guard after rendering failure', async () => {
  const ctx = setup({ failOnce: true });
  await expect(ctx.confirm('Title', 'Text', 'Proceed')).rejects.toThrow('render failed');
  expect(ctx.nodes[0].remove).toHaveBeenCalledOnce();
  const result = ctx.confirm('Title', 'Text', 'Proceed');
  ctx.click('Proceed');
  expect(await result).toBe(true);
 });
 it('refuses the action when the browser cannot render a modal dialog', async () => {
  const ctx = setup({ supported: false });
  expect(await ctx.confirm('Title', 'Text', 'Proceed')).toBe(false);
  expect(ctx.warn).toHaveBeenCalledOnce();
  expect(ctx.document.body.append).not.toHaveBeenCalled();
 });
});
