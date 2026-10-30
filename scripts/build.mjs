import { cp, mkdir, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('public/', root), output, { recursive: true });
await cp(new URL('src/', root), output, { recursive: true });
console.log('Built static website in dist/');
