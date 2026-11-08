import { launch } from './runtime.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const runtime = await launch();
const errors = [];
try {
  await mkdir('output', { recursive: true });
  const page = await runtime.browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'Sky' : undefined));

  await page.goto(runtime.url);
  await page.waitForSelector('[data-tab="arrange"]');
  await page.locator('[data-tab="arrange"]').click();
  await page.waitForSelector('#layer-list', { state: 'visible' });

  // Heading controls stay on a single line inside the 240px side panel.
  const heading = await page.evaluate(() => {
    const folder = document.querySelector('#add-folder').getBoundingClientRect();
    const imports = document.querySelector('#import').getBoundingClientRect();
    const headingBox = document.querySelector('.arrange-pane .panel-heading').getBoundingClientRect();
    return { sameLine: Math.abs(folder.y - imports.y) < 1, height: headingBox.height };
  });
  assert.ok(heading.sameLine && heading.height < 30, `layer heading controls fit on one line (${JSON.stringify(heading)})`);

  // Old restack buttons are gone; drag replaces them.
  assert.equal(await page.locator('#layer-up, #layer-down').count(), 0, 'bring forward / send back buttons removed');

  await page.locator('#asset-files').setInputFiles([
    'test-images/01-background.png',
    'test-images/02-layer 1.png',
    'test-images/03-layer 2.png',
  ]);
  await page.waitForFunction(() => document.querySelectorAll('#layer-list .layer-row').length === 3);

  const names = () => page.locator('#layer-list > .layer-row .layer-name').allInnerTexts();
  assert.deepEqual(await names(), ['03-layer 2', '02-layer 1', '01-background'], 'newest import is front-most');

  // Depth no longer appears in the arrange inspector.
  assert.equal(await page.locator('#properties').innerText().then(text => /depth/i.test(text)), false, 'arrange inspector has no depth control');

  // Drag the back layer to the top of the list.
  const rows = page.locator('#layer-list > .layer-row');
  await rows.nth(2).dragTo(rows.nth(0), { targetPosition: { x: 60, y: 2 } });
  await page.waitForFunction(() => document.querySelector('#layer-list .layer-row .layer-name')?.textContent === '01-background');
  assert.deepEqual(await names(), ['01-background', '03-layer 2', '02-layer 1'], 'drag restacks the layer');

  // Folders: create, drop a layer inside, rename, collapse.
  await page.locator('#add-folder').click();
  await page.waitForSelector('#layer-list .folder-group');
  assert.equal(await page.locator('#layer-list .folder-name').innerText(), 'Folder 1', 'folder starts with a default name');

  const folderHead = page.locator('#layer-list .folder-row');
  await page.locator('#layer-list > .layer-row', { hasText: '02-layer 1' }).dragTo(folderHead, { targetPosition: { x: 80, y: 10 } });
  await page.waitForFunction(() => document.querySelectorAll('#layer-list .folder-children .layer-row').length === 1);
  assert.deepEqual(await page.locator('#layer-list .folder-children .layer-name').allInnerTexts(), ['02-layer 1'], 'dragging onto a folder groups the layer');
  assert.equal(await page.locator('#layer-list .folder-count').innerText(), '1', 'folder shows its layer count');

  await page.locator('#layer-list .folder-name').dblclick();
  await page.waitForFunction(() => document.querySelector('#layer-list .folder-name')?.textContent === 'Sky');
  assert.equal(await page.locator('#layer-list .folder-name').innerText(), 'Sky', 'folder can be renamed');

  await page.locator('#layer-list .folder-toggle').click();
  await page.waitForSelector('#layer-list .folder-group.collapsed');
  assert.equal(await page.locator('#layer-list .folder-children').count(), 0, 'collapsing hides folder children');
  await page.locator('#layer-list .folder-toggle').click();
  await page.waitForSelector('#layer-list .folder-children');

  // Move a second layer in, then drag it back out to the top level.
  await page.locator('#layer-list > .layer-row', { hasText: '03-layer 2' }).dragTo(page.locator('#layer-list .folder-row'), { targetPosition: { x: 80, y: 10 } });
  await page.waitForFunction(() => document.querySelectorAll('#layer-list .folder-children .layer-row').length === 2);
  const topLevel = page.locator('#layer-list > .layer-row').first();
  await page.locator('#layer-list .folder-children .layer-row', { hasText: '03-layer 2' }).dragTo(topLevel, { targetPosition: { x: 60, y: 3 } });
  await page.waitForFunction(() => document.querySelectorAll('#layer-list .folder-children .layer-row').length === 1);
  assert.equal(await page.locator('#layer-list .folder-count').innerText(), '1', 'layer leaves the folder when dropped at the top level');

  // Persisted scene keeps folder membership and a contiguous stack.
  await page.locator('#save').click();
  await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved locally');
  const saved = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('storystudio-projects', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const projects = await new Promise((resolve, reject) => {
      const request = db.transaction('projects').objectStore('projects').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const project = projects.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    const scene = project.scenes[0];
    return {
      layers: scene.layers.map(layer => ({ name: layer.name, order: layer.order, folderId: layer.folderId ?? null })),
      folders: scene.folders ?? [],
      depth: scene.layers.map(layer => layer.depth),
    };
  });
  assert.equal(saved.folders.length, 1, 'folder is persisted');
  assert.equal(saved.folders[0].name, 'Sky', 'folder name is persisted');
  const grouped = saved.layers.filter(layer => layer.folderId === saved.folders[0].id);
  assert.deepEqual(grouped.map(layer => layer.name), ['02-layer 1'], 'folder membership is persisted');
  const orders = [...saved.layers].sort((a, b) => b.order - a.order).map(layer => layer.name);
  assert.deepEqual(orders, ['03-layer 2', '01-background', '02-layer 1'], 'layer stack order is persisted front to back');
  const folderOrder = saved.folders[0].order;
  assert.ok(grouped.every(layer => layer.order < folderOrder), 'folder children sit behind the folder slot');
  assert.equal(Math.max(...grouped.map(layer => layer.order)), folderOrder - 1, 'the folder block stays contiguous');
  assert.ok(saved.depth.every(value => typeof value === 'number'), 'layer depth still stored for parallax');

  await page.locator('#layer-list > .layer-row').first().click();
  await page.screenshot({ path: 'output/arrange-folders.png' });
  assert.deepEqual(errors, [], 'no page errors');
  console.log('Arrange layers, folders and drag restacking verified');
} finally {
  await runtime.close();
}
