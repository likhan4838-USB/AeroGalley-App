import type { MenuProps } from 'antd';
import { NAV_MODULES } from './navConfig';
import type { NavSubItem } from './navConfig';

export type BreadcrumbItem = {
  label: string;
  path: string;
};

export type RouteMeta = {
  key: string;
  label: string;
  moduleLabel: string;
  openKeys: string[];
  breadcrumb: BreadcrumbItem[];
  group: string;
  searchText: string;
};

type SearchPage = {
  route: string;
  label: string;
  module: string;
  group: string;
  searchText: string;
};

function buildSubItems(children: NavSubItem[]): MenuProps['items'] {
  return children.map(sub => ({
    key: sub.key,
    label: sub.label,
    icon: sub.icon,
    ...(sub.children ? { children: buildSubItems(sub.children) } : {}),
  }));
}

function getFirstLeafKey(children: NavSubItem[]): string {
  const first = children[0];
  if (!first) return '';
  if (first.children) return getFirstLeafKey(first.children);
  return first.key;
}

function buildSearchText(parts: string[]): string {
  return parts.join(' ').toLowerCase();
}

const routeMetaMap = new Map<string, RouteMeta>();
const routeMatchKeys: string[] = [];

function indexChildren(
  children: NavSubItem[],
  moduleKey: string,
  moduleLabel: string,
  breadcrumbTrail: BreadcrumbItem[],
  openKeyTrail: string[],
  groupTrail: string[],
): void {
  for (const child of children) {
    if (child.children) {
      indexChildren(
        child.children,
        moduleKey,
        moduleLabel,
        [...breadcrumbTrail, { label: child.label, path: getFirstLeafKey(child.children) }],
        [...openKeyTrail, child.key],
        [...groupTrail, child.label],
      );
      continue;
    }

    if (!child.key.startsWith('/')) {
      continue;
    }

    const group = groupTrail.join(' / ');
    routeMetaMap.set(child.key, {
      key: child.key,
      label: child.label,
      moduleLabel,
      openKeys: [moduleKey, ...openKeyTrail],
      breadcrumb: [...breadcrumbTrail, { label: child.label, path: child.key }],
      group,
      searchText: buildSearchText([child.label, moduleLabel, ...groupTrail]),
    });
    routeMatchKeys.push(child.key);
  }
}

export const MENU_ITEMS: MenuProps['items'] = NAV_MODULES.map(mod => ({
  key: mod.key,
  label: mod.label,
  icon: mod.icon,
  popupClassName: 'sb-popup',
  popupOffset: [8, 0],
  children: buildSubItems(mod.children),
}));

for (const mod of NAV_MODULES) {
  const firstLeaf = getFirstLeafKey(mod.children);
  indexChildren(
    mod.children,
    mod.key,
    mod.label,
    [{ label: mod.label, path: firstLeaf }],
    [],
    [],
  );
}

routeMatchKeys.sort((left, right) => right.length - left.length);

export const NAV_ROUTE_META_MAP = routeMetaMap;
export const NAV_VALID_ROUTE_KEYS = new Set(routeMetaMap.keys());

function collectExpandableKeys(children: NavSubItem[], acc: string[]): void {
  for (const child of children) {
    if (child.children) {
      acc.push(child.key);
      collectExpandableKeys(child.children, acc);
    }
  }
}

export const NAV_EXPANDABLE_KEYS: string[] = (() => {
  const keys: string[] = [];
  for (const mod of NAV_MODULES) {
    keys.push(mod.key);
    collectExpandableKeys(mod.children, keys);
  }
  return keys;
})();

export const NAV_SEARCH_PAGES: SearchPage[] = Array.from(routeMetaMap.values()).map(route => ({
  route: route.key,
  label: route.label,
  module: route.moduleLabel,
  group: route.group,
  searchText: route.searchText,
}));

export function resolveSelectedNavKey(pathname: string): string {
  const matchedKey = routeMatchKeys.find(
    routeKey => pathname === routeKey || pathname.startsWith(`${routeKey}/`),
  );

  return matchedKey ?? pathname;
}