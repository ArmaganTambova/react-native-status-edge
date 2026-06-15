'use strict';

// Shared, zero-dependency helpers for the react-native-status-edge setup tooling.
// Runs in the *consumer's* Node environment (install time / `npx`), so this must
// stay CommonJS and avoid any runtime dependency.

const fs = require('fs');
const path = require('path');

const PKG_NAME = 'react-native-status-edge';

const supportsColor =
  !!process.stdout.isTTY &&
  process.env.NO_COLOR == null &&
  process.env.TERM !== 'dumb';

function paint(code, s) {
  return supportsColor ? `[${code}m${s}[0m` : String(s);
}

const c = {
  bold: (s) => paint('1', s),
  dim: (s) => paint('2', s),
  red: (s) => paint('31', s),
  green: (s) => paint('32', s),
  yellow: (s) => paint('33', s),
  blue: (s) => paint('34', s),
  cyan: (s) => paint('36', s),
};

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (_) {
    return null;
  }
}

function writeText(p, data) {
  fs.writeFileSync(p, data);
}

function readJSON(p) {
  const t = readText(p);
  if (t == null) return null;
  try {
    return JSON.parse(t);
  } catch (_) {
    return null;
  }
}

// Walk up from `start` to find the consumer app's project root: the nearest
// ancestor directory with a package.json whose name is NOT this library.
function findConsumerRoot(start) {
  let dir = path.resolve(start || process.env.INIT_CWD || process.cwd());

  // If we're running from inside node_modules/<pkg>, hop above node_modules.
  const marker = `${path.sep}node_modules${path.sep}`;
  const idx = dir.lastIndexOf(marker);
  if (idx !== -1) dir = dir.slice(0, idx);

  let prev = null;
  while (dir && dir !== prev) {
    const pkg = readJSON(path.join(dir, 'package.json'));
    if (pkg && pkg.name !== PKG_NAME) return dir;
    prev = dir;
    dir = path.dirname(dir);
  }
  return process.env.INIT_CWD || process.cwd();
}

function isOwnRepo(root) {
  const pkg = readJSON(path.join(root, 'package.json'));
  return !!pkg && pkg.name === PKG_NAME;
}

function detectPackageManager(root) {
  if (
    fileExists(path.join(root, 'bun.lockb')) ||
    fileExists(path.join(root, 'bun.lock'))
  )
    return 'bun';
  if (fileExists(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fileExists(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fileExists(path.join(root, 'package-lock.json'))) return 'npm';

  const ua = process.env.npm_config_user_agent || '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('bun')) return 'bun';
  return 'npm';
}

function installCommand(pm, pkgs) {
  const list = pkgs.join(' ');
  switch (pm) {
    case 'yarn':
      return `yarn add ${list}`;
    case 'pnpm':
      return `pnpm add ${list}`;
    case 'bun':
      return `bun add ${list}`;
    default:
      return `npm install ${list}`;
  }
}

// Read an installed dependency's package.json from the consumer's node_modules.
function resolveDepPkg(root, name) {
  return readJSON(path.join(root, 'node_modules', name, 'package.json'));
}

// "Installed" = present in node_modules OR declared in the project's manifest.
function isInstalled(root, name) {
  if (resolveDepPkg(root, name)) return true;
  const pkg = readJSON(path.join(root, 'package.json')) || {};
  const all = Object.assign(
    {},
    pkg.dependencies,
    pkg.devDependencies,
    pkg.peerDependencies
  );
  return Object.prototype.hasOwnProperty.call(all, name);
}

function installedVersion(root, name) {
  const dep = resolveDepPkg(root, name);
  return dep ? dep.version : null;
}

function majorVersion(v) {
  if (!v) return 0;
  const m = String(v)
    .replace(/^[^\d]*/, '')
    .match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function isExpo(root) {
  if (isInstalled(root, 'expo')) return true;
  const appJson = readJSON(path.join(root, 'app.json'));
  return !!(appJson && appJson.expo);
}

module.exports = {
  PKG_NAME,
  c,
  fileExists,
  readText,
  writeText,
  readJSON,
  findConsumerRoot,
  isOwnRepo,
  detectPackageManager,
  installCommand,
  resolveDepPkg,
  isInstalled,
  installedVersion,
  majorVersion,
  isExpo,
};
