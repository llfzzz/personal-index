import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const distDir = new URL('../dist/', import.meta.url);
const routes = ['notes', 'experiments', 'connect', 'editor'];

for (const route of routes) {
  const routeDir = join(distDir.pathname, route);
  mkdirSync(routeDir, { recursive: true });
  copyFileSync(join(distDir.pathname, 'index.html'), join(routeDir, 'index.html'));
}
