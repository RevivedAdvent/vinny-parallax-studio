import { icons, type IconName } from './icons.ts';

export interface MenuItem {
  id?: string;
  label?: string;
  icon?: IconName;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  /** Renders a non-interactive heading. */
  heading?: boolean;
  /** Renders a separator line. */
  divider?: boolean;
  /** Nested items render in place as an indented group. */
  children?: MenuItem[];
  run?: () => void;
}

let openMenu: HTMLElement | null = null;
let dismiss: ((event: Event) => void) | null = null;

export function closeMenu() {
  openMenu?.remove();
  openMenu = null;
  if (dismiss) {
    document.removeEventListener('pointerdown', dismiss, true);
    document.removeEventListener('keydown', dismiss, true);
    window.removeEventListener('resize', dismiss);
    window.removeEventListener('scroll', dismiss, true);
    dismiss = null;
  }
}

/**
 * Show a floating menu anchored to a point (viewport coordinates) or an element.
 * Menus close on outside pointerdown, Escape, scroll and resize.
 */
export function showMenu(anchor: { x: number; y: number } | HTMLElement, items: MenuItem[], options: { label?: string } = {}) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  if (options.label) menu.setAttribute('aria-label', options.label);

  for (const item of items) {
    if (!item) continue;
    if (item.divider) { menu.append(document.createElement('hr')); continue; }
    if (item.heading) {
      const heading = document.createElement('div');
      heading.className = 'context-menu-heading';
      heading.textContent = item.label ?? '';
      menu.append(heading);
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-menu-item' + (item.danger ? ' danger' : '');
    button.setAttribute('role', 'menuitem');
    if (item.id) button.dataset.menu = item.id;
    button.disabled = item.disabled === true;
    if (item.checked) button.setAttribute('aria-checked', 'true');
    button.innerHTML = `<span class="menu-icon">${item.icon ? icons[item.icon] : ''}</span><span class="menu-label">${escapeHtml(item.label ?? '')}</span>${item.shortcut ? `<kbd>${escapeHtml(item.shortcut)}</kbd>` : ''}`;
    if (item.run) button.onclick = () => { closeMenu(); item.run!(); };
    if (item.children?.length) {
      const group = document.createElement('div');
      group.className = 'context-menu-group';
      for (const child of item.children) {
        const childButton = document.createElement('button');
        childButton.type = 'button';
        childButton.className = 'context-menu-item';
        childButton.setAttribute('role', 'menuitem');
        childButton.disabled = child.disabled === true;
        childButton.innerHTML = `<span class="menu-icon">${child.icon ? icons[child.icon] : ''}</span><span class="menu-label">${escapeHtml(child.label ?? '')}</span>`;
        if (child.run) childButton.onclick = () => { closeMenu(); child.run!(); };
        group.append(childButton);
      }
      menu.append(button, group);
      continue;
    }
    menu.append(button);
  }
  document.body.append(menu);
  openMenu = menu;

  const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : { left: anchor.x, top: anchor.y, right: anchor.x, bottom: anchor.y, width: 0, height: 0 };
  const size = menu.getBoundingClientRect();
  let left = rect.left, top = rect.bottom + 4;
  if (left + size.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - size.width - 8);
  if (top + size.height > window.innerHeight - 8) top = Math.max(8, rect.top - size.height - 4);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  menu.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({ preventScroll: true });

  dismiss = event => {
    if (event instanceof KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      const trigger = (menu.dataset.trigger ? document.getElementById(menu.dataset.trigger) : null);
      closeMenu();
      trigger?.focus();
      return;
    }
    if (event instanceof PointerEvent && menu.contains(event.target as Node)) return;
    closeMenu();
  };
  document.addEventListener('pointerdown', dismiss, true);
  document.addEventListener('keydown', dismiss, true);
  window.addEventListener('resize', dismiss);
  window.addEventListener('scroll', dismiss, true);
  return menu;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
