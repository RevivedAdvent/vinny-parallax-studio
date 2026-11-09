/**
 * Shared compact number field with Arrange-style stepper buttons.
 *
 * The markup and styling match `.number-wrap` / `.number-step` in style.css, so
 * Camera Movements, Parallax and Atmosphere all present numbers the same way.
 * This module only manages presentation and value stepping; validation stays in
 * each workspace's submit handler.
 */

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export function stepperButtons(label: string): string {
  const name = escape(label);
  return `<span class="number-steppers"><button type="button" class="number-step" data-step="up" aria-label="Increase ${name}"></button><button type="button" class="number-step" data-step="down" aria-label="Decrease ${name}"></button></span>`;
}

export function numberFieldHtml(id: string, label: string, value: number, min: number, max: number, step: number | 'any' = 'any', required = true): string {
  return `<label class="field"><span class="field-label">${label}</span><span class="number-wrap"><input id="${id}" type="number" ${required ? 'required' : ''} min="${min}" max="${max}" step="${step}" value="${value}">${stepperButtons(label)}</span></label>`;
}

/** Wire stepper clicks once per inspector host; re-rendered fields keep working. */
export function bindNumberSteppers(host: HTMLElement): void {
  if (host.dataset.steppers === '1') return;
  host.dataset.steppers = '1';
  host.addEventListener('pointerdown', event => {
    if ((event.target as HTMLElement).closest('.number-step')) event.preventDefault();
  });
  host.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.number-step');
    if (!button) return;
    const input = button.closest('.number-wrap')?.querySelector('input[type=number]');
    if (!(input instanceof HTMLInputElement)) return;
    event.preventDefault();
    const step = Number(input.step);
    const size = Number.isFinite(step) && step > 0 ? step : 1;
    const current = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : (Number(input.min) || 0);
    const min = input.min === '' ? -Infinity : Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);
    let next = Number((current + (button.dataset.step === 'down' ? -1 : 1) * size).toPrecision(14));
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
