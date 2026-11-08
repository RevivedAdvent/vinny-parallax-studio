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

  // ---- preview size regression: the viewer must not shrink ----
  const layout = () => page.evaluate(() => {
    const rect = selector => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return [Math.round(box.width), Math.round(box.height)];
    };
    const canvas = document.querySelector('#canvas-host canvas');
    return {
      viewer: rect('#viewer'), host: rect('#canvas-host'), canvas: [canvas.clientWidth, canvas.clientHeight],
      side: rect('.side-nav')[0], inspector: rect('#context-inspector')[0],
    };
  });
  const baseline = await layout();
  assert.deepEqual(baseline.viewer, [812, 742], 'viewer keeps its 1400x900 size');
  assert.deepEqual(baseline.canvas, [810, 456], 'preview canvas keeps its 1400x900 size');
  assert.equal(baseline.side, 240, 'layers panel keeps its width');
  assert.equal(baseline.inspector, 300, 'inspector keeps its width');

  // Only the two tool toggles are shown until a tool is activated.
  assert.equal(await page.locator('[data-tool="select"]').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('[data-zoom="in"]').isVisible(), false);
  assert.equal(await page.locator('[data-view="fit"]').count(), 0, 'fit-to-view control removed');
  assert.equal(await page.locator('[data-section="appearance"]').count(), 0, 'redundant Appearance section removed');
  assert.equal(await page.locator('.link-scale').count(), 0, 'non-functional scale indicator removed');
  for (const edge of ['left', 'right', 'top', 'bottom', 'centre']) assert.equal(await page.locator(`[data-align="${edge}"]`).count(), 1);
  await page.locator('[data-tool="select"]').click();

  // ---- viewport selection ----
  const canvasBox = async () => page.locator('#canvas-host canvas').boundingBox();
  const state = () => page.evaluate(() => window.cameraStudio.getState().config);
  const drag = async (from, delta) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + delta.x, from.y + delta.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(220);
  };

  let box = await canvasBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('#layer-list .layer-row.selected');
  const selectedId = await page.locator('#layer-list').getAttribute('data-selected');
  const frontId = (await page.locator('#layer-list > .layer-row').first().getAttribute('data-drag')).split(':')[1];
  assert.equal(selectedId, frontId, 'clicking the preview selects the front-most layer');
  assert.equal(await page.locator('.inspector-summary .selected-name').innerText(), '03-layer 2', 'the inspector follows the viewport selection');
  // The compact numeric inputs must fit values and their units without clipping
  // or squeezing the slider, even in the narrower responsive inspector.
  for (const width of [1100, 1400, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const controls = await page.evaluate(() => {
      const panel = document.querySelector('#context-inspector').getBoundingClientRect();
      const samples = { x: '-1920', y: '-1080', scale: '1.1465', rotation: '-180.5', opacity: '100' };
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      return [...document.querySelectorAll('.transform-row')].map(row => {
        const wrap = row.querySelector('.number-wrap').getBoundingClientRect();
        const input = row.querySelector('input[type=number]');
        const inputBox = input.getBoundingClientRect();
        const slider = row.querySelector('input[type=range]').getBoundingClientRect();
        const unit = row.querySelector('.unit').getBoundingClientRect();
        const steppers = row.querySelector('.number-steppers').getBoundingClientRect();
        const buttons = [...row.querySelectorAll('.number-step')];
        const style = getComputedStyle(input);
        context.font = `${style.fontSize} ${style.fontFamily}`;
        return { key: row.dataset.row, rightGap: panel.right - wrap.right, sliderWidth: slider.width,
          boxWidth: wrap.width, sliderGap: wrap.left - slider.right, textAlign: style.textAlign,
          inputWidth: inputBox.width, sampleWidth: context.measureText(samples[row.dataset.row]).width,
          unitFits: !row.querySelector('.unit').textContent || (unit.left >= inputBox.right && unit.right <= steppers.left),
          stepsFit: buttons.length === 2 && steppers.right <= wrap.right && buttons.every(button => getComputedStyle(button).backgroundColor === 'rgba(0, 0, 0, 0)') };
      });
    });
    assert.equal(controls.length, 5);
    for (const control of controls) {
      assert.ok(control.rightGap >= 10 && control.sliderWidth >= 70 && control.boxWidth < 84 && control.sliderGap >= 10 &&
        control.textAlign === 'left' && control.inputWidth >= control.sampleWidth && control.unitFits && control.stepsFit,
        `transform ${control.key} fits at ${width}px: ${JSON.stringify(control)}`);
    }
  }
  await page.setViewportSize({ width: 1400, height: 900 });
  const opacityInput = page.locator('[data-prop="opacity"]');
  await opacityInput.fill('75');
  await opacityInput.dispatchEvent('change');
  await page.waitForFunction(id => window.cameraStudio.getState().config.layers.find(layer => layer.id === id).opacity === 0.75, selectedId);
  assert.equal(await page.locator('[data-slider="opacity"]').inputValue(), '75', 'exact value updates the slider');
  await page.getByRole('button', { name: 'Increase Opacity' }).click();
  await page.waitForFunction(id => window.cameraStudio.getState().config.layers.find(layer => layer.id === id).opacity === 0.76, selectedId);
  await opacityInput.focus();
  await opacityInput.press('ArrowDown');
  await page.waitForFunction(id => window.cameraStudio.getState().config.layers.find(layer => layer.id === id).opacity === 0.75, selectedId);
  const xInput = page.locator('[data-prop="x"]');
  await page.getByRole('button', { name: 'Increase X' }).click();
  await page.waitForFunction(id => window.cameraStudio.getState().config.layers.find(layer => layer.id === id).x === 1, selectedId);
  await page.getByRole('button', { name: 'Decrease X' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(id => window.cameraStudio.getState().config.layers.find(layer => layer.id === id).x === 0, selectedId);
  assert.equal(await xInput.inputValue(), '0');
  const scaleInput = page.locator('[data-prop="scale"]');
  const initialScale = await scaleInput.inputValue();
  await scaleInput.fill('1.1465');
  await scaleInput.dispatchEvent('change');
  await page.waitForFunction(id => window.cameraStudio.getState().config.layers.find(layer => layer.id === id).scale === 1.1465, selectedId);
  await page.getByRole('button', { name: 'Increase Scale' }).click();
  await page.waitForFunction(id => window.cameraStudio.getState().config.layers.find(layer => layer.id === id).scale === 1.1565, selectedId);
  await page.getByRole('button', { name: 'Decrease Scale' }).click();
  await page.waitForFunction(id => window.cameraStudio.getState().config.layers.find(layer => layer.id === id).scale === 1.1465, selectedId);
  await scaleInput.fill(initialScale);
  await scaleInput.dispatchEvent('change');
  await page.waitForFunction(({ id, value }) => window.cameraStudio.getState().config.layers.find(layer => layer.id === id).scale === value, { id: selectedId, value: Number(initialScale) });
  await opacityInput.fill('100');
  await opacityInput.dispatchEvent('change');
  await page.waitForFunction(id => window.cameraStudio.getState().config.layers.find(layer => layer.id === id).opacity === 1, selectedId);
  assert.equal(await page.locator('.sel-outline').count(), 1, 'the selection box is drawn');
  assert.equal(await page.locator('.sel-handle').count(), 4, 'four corner handles are drawn');
  assert.equal(await page.locator('.sel-rotate').count(), 1, 'a rotation handle is drawn');
  assert.equal(await page.locator('.sel-anchor').count(), 1, 'the anchor point is drawn');

  // ---- drag to move syncs x and y ----
  box = await canvasBox();
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await drag(centre, { x: 60, y: 30 });
  let config = await state();
  const dragged = config.layers.find(layer => layer.id === selectedId);
  assert.ok(dragged.x > 0 && dragged.y > 0, `dragging the artwork moves it (${dragged.x}, ${dragged.y})`);
  assert.equal(await page.locator('[data-prop="x"]').inputValue(), String(dragged.x), 'the inspector tracks the drag');
  assert.equal(config.layers.filter(layer => layer.x !== 0).length, 1, 'only the dragged layer moved');

  // ---- corner resize changes one uniform scale ----
  const beforeResize = (await state()).layers.find(layer => layer.id === selectedId).scale;
  const corner = await page.locator('.sel-handle').nth(2).boundingBox();
  await drag({ x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 }, { x: 90, y: 70 });
  const afterResize = (await state()).layers.find(layer => layer.id === selectedId).scale;
  assert.ok(afterResize > beforeResize, `corner drag scales the layer up (${beforeResize} → ${afterResize})`);
  assert.equal(await page.locator('[data-slider="scale"]').count(), 1, 'scale stays a single uniform value');

  // ---- rotation handle ----
  const rotationHandle = await page.locator('.sel-rotate').boundingBox();
  await drag({ x: rotationHandle.x + rotationHandle.width / 2, y: rotationHandle.y + rotationHandle.height / 2 }, { x: 70, y: 60 });
  const rotated = (await state()).layers.find(layer => layer.id === selectedId);
  assert.ok(Math.abs(rotated.rotation) > 1, `rotation handle turns the layer (${rotated.rotation}°)`);
  assert.equal(await page.locator('[data-prop="rotation"]').inputValue(), String(rotated.rotation), 'the inspector shows the rotation');

  // ---- locking prevents direct manipulation ----
  await page.locator('.layer-row.selected .lock-toggle').click();
  await page.waitForSelector('.layer-row.locked');
  assert.equal(await page.locator('.sel-handle').count(), 0, 'locked layers hide their resize handles');
  assert.equal(await page.locator('.number-step:disabled').count(), 10, 'locked layers disable all transform steppers');
  const lockedBefore = (await state()).layers.find(layer => layer.id === selectedId);
  box = await canvasBox();
  await drag({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: -80, y: -40 });
  const lockedAfter = (await state()).layers.find(layer => layer.id === selectedId);
  assert.deepEqual([lockedAfter.x, lockedAfter.y], [lockedBefore.x, lockedBefore.y], 'locked layers cannot be dragged');
  assert.equal(lockedAfter.locked, true, 'lock state is stored on the layer');
  await page.locator('.layer-row.selected .lock-toggle').click();
  await page.waitForFunction(() => !document.querySelector('.layer-row.locked'));

  // ---- multi selection moves as a group ----
  const rowA = page.locator('#layer-list > .layer-row', { hasText: '03-layer 2' });
  const rowB = page.locator('#layer-list > .layer-row', { hasText: '01-background' });
  await rowA.click();
  await rowB.click({ modifiers: ['Control'] });
  await page.waitForFunction(() => document.querySelectorAll('#layer-list .layer-row.selected').length === 2);
  assert.match(await page.locator('.inspector-summary .selected-name').innerText(), /2 layers selected/);
  const before = await state();
  const groupIds = [before.layers.find(layer => layer.name === '03-layer 2').id, before.layers.find(layer => layer.name === '01-background').id];
  box = await canvasBox();
  await drag({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: 40, y: 0 });
  const after = await state();
  const deltaX = groupIds.map(id => after.layers.find(layer => layer.id === id).x - before.layers.find(layer => layer.id === id).x);
  assert.ok(deltaX.every(value => Math.abs(value) > 1), `both selected layers moved (${deltaX.map(value => value.toFixed(2)).join(', ')})`);
  assert.ok(Math.abs(deltaX[0] - deltaX[1]) < .05, 'group drag translates every selected layer equally');

  // ---- shift click extends the selection as a range ----
  await rowA.click();
  await page.locator('#layer-list .layer-row').last().click({ modifiers: ['Shift'] });
  await page.waitForFunction(() => document.querySelectorAll('#layer-list .layer-row.selected').length >= 2);
  assert.ok(await page.locator('#layer-list .layer-row.selected').count() >= 2, 'shift-click extends the selection to a range');

  // ---- context menu operations ----
  await rowA.click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  const menuLabels = await page.locator('.context-menu .menu-label').allInnerTexts();
  for (const label of ['Rename', 'Duplicate', 'Delete', 'Lock', 'Bring to front', 'Send to back', 'Fit to canvas', 'Reset transform']) assert.ok(menuLabels.includes(label), `context menu offers ${label}`);
  await page.locator('.context-menu-item', { hasText: 'Reset transform' }).click();
  await page.waitForFunction(() => {
    const layers = window.cameraStudio.getState().config.layers;
    return layers.every(layer => layer.x === 0 && layer.y === 0 && layer.scale === 1 && layer.rotation === 0);
  });
  assert.equal(await page.locator('[data-prop="scale"]').inputValue(), '1', 'reset transform restores the inspector values');

  // ---- clicking empty canvas clears, arrow keys nudge ----
  box = await canvasBox();
  await page.mouse.click(box.x + 6, box.y + 6);
  await page.waitForFunction(() => !document.querySelector('#layer-list .layer-row.selected'));
  assert.equal(await page.locator('.sel-outline').count(), 0, 'clicking empty canvas clears the selection');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('#layer-list .layer-row.selected');
  const nudgedId = await page.locator('#layer-list').getAttribute('data-selected');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(id => window.cameraStudio.getState().config.layers.find(layer => layer.id === id).x === 2, nudgedId);
  assert.equal(await page.locator('[data-prop="x"]').inputValue(), '2', 'arrow keys nudge the selection');

  await rowA.click();
  await page.locator('[data-align="left"]').click();
  await page.waitForFunction(() => window.cameraStudio.getState().config.layers.find(layer => layer.name === '03-layer 2').x !== 0);
  const leftAligned = (await state()).layers.find(layer => layer.name === '03-layer 2');
  assert.ok(Math.abs(leftAligned.x - (leftAligned.width * leftAligned.scale / 2 - (await state()).width / 2)) < .01, 'left alignment places the image edge at the canvas edge');
  await page.locator('[data-align="centre"]').click();
  await page.waitForFunction(() => window.cameraStudio.getState().config.layers.find(layer => layer.name === '03-layer 2').x === 0);
  await rowA.click({ button: 'right' });
  await page.locator('.context-menu-item', { hasText: 'Fit to canvas' }).click();
  await page.waitForFunction(() => window.cameraStudio.getState().config.layers.some(layer => layer.name === '03-layer 2' && layer.scale !== 1));
  const fitted = (await state()).layers.find(layer => layer.name === '03-layer 2');
  const sceneSize = await page.evaluate(() => { const c = window.cameraStudio.getState().config; return [c.width, c.height]; });
  assert.ok(Math.abs(fitted.scale - Math.min(sceneSize[0] / fitted.width, sceneSize[1] / fitted.height)) < 1e-6, 'fit to canvas scales the artwork into the frame');

  const beforeDuplicate = (await state()).layers.length;
  await rowA.click({ button: 'right' });
  await page.locator('.context-menu-item', { hasText: 'Duplicate' }).click();
  await page.waitForFunction(count => window.cameraStudio.getState().config.layers.length === count + 1, beforeDuplicate);
  assert.equal(await page.locator('#layer-list .layer-row').count(), beforeDuplicate + 1 + 1, 'duplicate adds a row (plus the folder row)');

  // ---- search filters the hierarchy ----
  await page.locator('#asset-files').setInputFiles(['test-images/01-background.png', 'test-images/02-layer 1.png', 'test-images/04-layer 3.png']);
  await page.waitForFunction(count => document.querySelectorAll('#layer-list .layer-row').length === count, beforeDuplicate + 5);
  assert.equal(await page.locator('#layer-search').isVisible(), true, 'the filter appears once the stack is long');
  await page.locator('#layer-search').fill('background');
  await page.waitForFunction(() => document.querySelectorAll('#layer-list .layer-row.filtered').length > 0);
  const visibleNames = await page.locator('#layer-list .layer-row:not(.folder-row):not(.filtered) .layer-name').allInnerTexts();
  assert.ok(visibleNames.length >= 1, 'the filter keeps matches');
  assert.ok(visibleNames.every(name => name.toLowerCase().includes('background')), `the filter hides other layers (${visibleNames.join(', ')})`);
  assert.ok(await page.locator('#layer-list .layer-row.filtered').count() >= 3, 'non-matching layers are hidden');
  await page.locator('#layer-search').fill('');
  await page.waitForFunction(() => document.querySelectorAll('#layer-list .layer-row.filtered').length === 0);

  // ---- replace image keeps identity ----
  const target = page.locator('#layer-list .layer-row', { hasText: '04-layer 3' }).first();
  await target.click();
  await page.locator('[data-section-toggle="advanced"]').click();
  await page.waitForSelector('#replace-image-file', { state: 'attached' });
  const beforeReplace = (await state()).layers.find(layer => layer.name === '04-layer 3');
  await page.locator('#replace-image-file').setInputFiles('test-images/04-layer 3.png');
  await page.waitForFunction(id => {
    const layer = window.cameraStudio.getState().config.layers.find(candidate => candidate.id === id);
    return layer && layer.asset !== '/art.png';
  }, beforeReplace.id);
  const replaced = (await state()).layers.find(layer => layer.id === beforeReplace.id);
  assert.deepEqual([replaced.name, replaced.x, replaced.y, replaced.scale], [beforeReplace.name, beforeReplace.x, beforeReplace.y, beforeReplace.scale], 'replace keeps name and transform');
  assert.deepEqual([replaced.width, replaced.height], [1363, 768], 'replace stores the new asset dimensions');

  // ---- floating view controls ----
  const alignOverlay = () => page.evaluate(() => {
    const canvas = document.querySelector('#canvas-host canvas').getBoundingClientRect();
    const overlay = document.querySelector('#arrange-overlay svg').getBoundingClientRect();
    return [Math.abs(canvas.x - overlay.x), Math.abs(canvas.y - overlay.y), Math.abs(canvas.width - overlay.width), Math.abs(canvas.height - overlay.height)];
  });
  assert.ok((await alignOverlay()).every(value => value < 1.5), 'selection overlay sits exactly on the canvas');
  const fitLevel = await page.locator('.zoom-level').innerText();
  assert.equal(fitLevel, '100%', 'the entire fitted canvas is 100% at the default view');
  assert.equal(await page.locator('#format').isVisible(), false, 'preview format overlay is hidden');
  const backgroundColors = await page.evaluate(() => Object.fromEntries(['body', '.appbar', '.workspace-nav', '.side-nav', '.context-inspector', '.viewer'].map(selector => [selector, getComputedStyle(document.querySelector(selector)).backgroundColor])));
  assert.ok(Object.values(backgroundColors).every(color => color === 'rgb(0, 0, 0)'), `workspace surfaces are black: ${JSON.stringify(backgroundColors)}`);
  const helpPosition = await page.evaluate(() => {
    const panel = document.querySelector('.side-nav').getBoundingClientRect();
    const help = document.querySelector('.arrange-help').getBoundingClientRect();
    return { bottomGap: panel.bottom - help.bottom, height: panel.height };
  });
  assert.ok(helpPosition.bottomGap >= 0 && helpPosition.bottomGap < 40, `help is at the bottom of the layers panel: ${JSON.stringify(helpPosition)}`);
  await page.locator('[data-zoom="in"]').click();
  await page.waitForFunction(previous => document.querySelector('.zoom-level')?.textContent !== previous, fitLevel);
  const zoomedLevel = parseInt(await page.locator('.zoom-level').innerText(), 10);
  assert.ok(zoomedLevel > parseInt(fitLevel, 10), `zoom in raises the scale (${fitLevel} → ${zoomedLevel}%)`);
  assert.ok((await alignOverlay()).every(value => value < 1.5), 'the overlay follows the zoomed canvas');
  assert.deepEqual(await layout(), baseline, 'zooming does not resize the preview');
  await page.locator('[data-toggle="grid"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.grid-layer line').length > 20);
  assert.equal(await page.locator('.arrange-toolbar [data-toggle="grid"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-toggle="grid"]').click();
  await page.locator('.zoom-level').click();
  await page.waitForFunction(() => document.querySelector('.zoom-level')?.textContent === '100%');
  assert.deepEqual(await layout(), baseline, 'reset returns to the fitted view without resizing the preview');
  const fittedBox = await canvasBox();
  const viewerBox = await page.locator('#viewer').boundingBox();
  assert.ok(fittedBox.x >= viewerBox.x - 1 && fittedBox.y >= viewerBox.y - 1 && fittedBox.x + fittedBox.width <= viewerBox.x + viewerBox.width + 1 && fittedBox.y + fittedBox.height <= viewerBox.y + viewerBox.height + 1, '100% shows the full canvas inside the viewer');
  await page.locator('[data-tool="pan"]').click();
  box = await canvasBox();
  const pannedFrom = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await drag(pannedFrom, { x: 50, y: 20 });
  const panned = await canvasBox();
  assert.ok(Math.abs(panned.x - box.x - 50) < 3 && Math.abs(panned.y - box.y - 20) < 3, 'the pan tool moves the canvas view');
  assert.ok((await alignOverlay()).every(value => value < 1.5), 'the overlay follows panning');
  await page.locator('.zoom-level').click();
  await page.waitForFunction(() => document.querySelector('#canvas-host canvas').style.transform.includes('translate(0px, 0px)'));
  assert.ok(Math.abs((await canvasBox()).x - box.x) < 2, '100% reset also recentres after panning');
  await page.locator('[data-zoom="in"]').click();
  await page.waitForFunction(() => document.querySelector('.zoom-level').textContent === '125%');
  await page.locator('[data-tab="story"]').click();
  await page.waitForFunction(() => document.querySelector('#canvas-host canvas').style.transform === '');
  assert.equal(await page.locator('#arrange-toolbar').isVisible(), false, 'Arrange toolbar is hidden outside Arrange even when enabled');
  await page.locator('[data-tab="arrange"]').click();
  await page.waitForFunction(() => document.querySelector('#canvas-host canvas').style.transform.includes('scale'));
  // Clicking the active tool again turns all viewport interaction off.
  await page.locator('[data-tool="pan"]').click();
  assert.equal(await page.locator('[data-tool="pan"]').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('[data-toggle="grid"]').isVisible(), false);
  const inactiveBefore = await state();
  const inactiveBox = await canvasBox();
  await drag({ x: inactiveBox.x + inactiveBox.width / 2, y: inactiveBox.y + inactiveBox.height / 2 }, { x: 35, y: 20 });
  const inactiveAfter = await state();
  assert.deepEqual(inactiveAfter.layers.map(l => [l.x, l.y]), inactiveBefore.layers.map(l => [l.x, l.y]), 'disabled tools cannot move layers');
  const inactiveCanvas = await canvasBox();
  assert.ok(Math.abs(inactiveCanvas.x - inactiveBox.x) < 1, 'disabled tools cannot pan');
  await page.mouse.move(inactiveBox.x + inactiveBox.width / 2, inactiveBox.y + inactiveBox.height / 2);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(100);
  assert.ok(Math.abs((await canvasBox()).x - inactiveBox.x) < 1, 'disabled tools ignore wheel pan');
  await page.locator('[data-tab="story"]').click();
  assert.equal(await page.locator('#arrange-toolbar').isVisible(), false, 'Arrange toolbar is hidden in other workspaces');
  assert.equal(await page.locator('#arrange-overlay').isVisible(), false, 'Arrange overlay is hidden in other workspaces');
  assert.equal(await page.locator('#canvas-host canvas').evaluate(el => el.style.transform), '', 'Arrange zoom does not leak into Story');
  await page.locator('[data-tab="arrange"]').click();
  await page.locator('[data-tool="select"]').click();

  await page.screenshot({ path: 'output/arrange-editor.png' });
  assert.deepEqual(await layout(), baseline, 'the preview keeps its size after every editing gesture');

  // ---- other viewport sizes keep their layout ----
  for (const [width, height, expected] of [[1920, 1080, { viewer: [1332, 922], canvas: [1330, 748], side: 240, inspector: 300 }], [1100, 800, { viewer: [592, 642], canvas: [590, 332], side: 200, inspector: 260 }]]) {
    const sized = await runtime.browser.newPage({ viewport: { width, height } });
    sized.on('pageerror', error => errors.push(error.message));
    await sized.goto(runtime.url);
    await sized.locator('[data-tab="arrange"]').click();
    await sized.locator('#asset-files').setInputFiles(['test-images/01-background.png', 'test-images/02-layer 1.png']);
    await sized.waitForFunction(() => document.querySelectorAll('#layer-list .layer-row').length === 2);
    const measured = await sized.evaluate(() => {
      const rect = selector => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return [Math.round(box.width), Math.round(box.height)];
      };
      const canvas = document.querySelector('#canvas-host canvas');
      return { viewer: rect('#viewer'), canvas: [canvas.clientWidth, canvas.clientHeight], side: rect('.side-nav')[0], inspector: rect('#context-inspector')[0] };
    });
    assert.deepEqual(measured, expected, `preview layout holds at ${width}x${height}`);
    await sized.locator('[data-tool="select"]').click();
    await sized.waitForFunction(() => document.querySelector('.zoom-level').textContent === '100%');
    await sized.close();
  }

  assert.deepEqual(errors, [], 'no page errors');
  console.log('Arrange layers, folders, dragging, folders, viewport manipulation, inspector, context menu and preview size verified');
} finally {
  await runtime.close();
}
