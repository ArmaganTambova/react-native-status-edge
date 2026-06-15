'use strict';

// Interactive setup wizard for react-native-status-edge.
// Invoked via `npx react-native-status-edge setup` (and, non-interactively, as
// a `doctor` check). Pure CommonJS, zero runtime dependencies.

const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const u = require('./utils');
const { c } = u;

// The library itself only imports these at runtime.
const REQUIRED_DEPS = ['@shopify/react-native-skia', 'react-native-reanimated'];

function ask(query) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve('');
      return;
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(String(answer || '').trim());
    });
  });
}

async function confirm(query, def) {
  const fallback = def !== false;
  const hint = fallback ? 'Y/n' : 'y/N';
  const a = (await ask(`${query} (${hint}) `)).toLowerCase();
  if (a === '') return fallback;
  return a === 'y' || a === 'yes' || a === 'e' || a === 'evet';
}

function banner() {
  console.log('');
  console.log(c.cyan('  ┌──────────────────────────────────────────────┐'));
  console.log(
    c.cyan('  │ ') +
      c.bold('react-native-status-edge') +
      c.dim('  ·  setup wizard') +
      c.cyan('  │')
  );
  console.log(c.cyan('  └──────────────────────────────────────────────┘'));
  console.log(
    '  ' +
      c.yellow('⚠ Development preview') +
      c.dim(' — not production-ready; APIs may change.')
  );
  console.log('');
}

// ---------------------------------------------------------------------------
// 1) Peer dependencies
// ---------------------------------------------------------------------------

function collectMissingDeps(root) {
  const missing = [];
  for (const dep of REQUIRED_DEPS) {
    if (!u.isInstalled(root, dep)) missing.push(dep);
  }
  // Reanimated 4+ requires react-native-worklets as a separate package.
  const reaMajor = u.majorVersion(
    u.installedVersion(root, 'react-native-reanimated')
  );
  if (reaMajor >= 4 && !u.isInstalled(root, 'react-native-worklets')) {
    missing.push('react-native-worklets');
  }
  return missing;
}

function printDepStatus(root) {
  const reaMajor = u.majorVersion(
    u.installedVersion(root, 'react-native-reanimated')
  );
  const rows = REQUIRED_DEPS.slice();
  if (reaMajor >= 4) rows.push('react-native-worklets');
  for (const dep of rows) {
    const ok = u.isInstalled(root, dep);
    console.log(
      '   ' +
        (ok ? c.green('✓') : c.red('✗')) +
        ' ' +
        dep +
        (ok ? '' : c.dim('  (missing)'))
    );
  }
}

async function checkDependencies(root, pm, interactive) {
  console.log(c.bold('1) Peer dependencies'));
  printDepStatus(root);

  const missing = collectMissingDeps(root);
  if (missing.length === 0) {
    console.log('   ' + c.green('All required peer dependencies are present.'));
    console.log('');
    return true;
  }

  const cmd = u.installCommand(pm, missing);
  console.log('');
  console.log('   ' + c.yellow('Missing: ') + missing.join(', '));

  if (
    interactive &&
    (await confirm('   Install them now with `' + cmd + '`?', true))
  ) {
    console.log('   ' + c.dim('› ' + cmd));
    const parts = cmd.split(' ');
    const r = spawnSync(parts[0], parts.slice(1), {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (r.status === 0) {
      console.log('   ' + c.green('Installed.'));
      console.log('');
      return true;
    }
    console.log(
      '   ' + c.red('Install failed.') + ' Run it yourself: ' + c.bold(cmd)
    );
  } else {
    console.log('   ' + c.dim('Install manually: ') + c.bold(cmd));
  }
  console.log('');
  return false;
}

// ---------------------------------------------------------------------------
// 2) Reanimated babel plugin (worklets won't run without it)
// ---------------------------------------------------------------------------

function checkBabelPlugin(root) {
  console.log(c.bold('2) Reanimated babel plugin'));
  const candidates = [
    'babel.config.js',
    'babel.config.cjs',
    '.babelrc.js',
    '.babelrc',
  ];
  let found = null;
  for (const f of candidates) {
    const p = path.join(root, f);
    if (u.fileExists(p)) {
      found = { file: f, text: u.readText(p) || '' };
      break;
    }
  }
  if (!found) {
    console.log(
      '   ' +
        c.yellow('No babel config found.') +
        c.dim(' Add the Reanimated plugin (must be last).')
    );
    console.log('');
    return;
  }
  const hasPlugin =
    found.text.includes('react-native-worklets/plugin') ||
    found.text.includes('react-native-reanimated/plugin');
  if (hasPlugin) {
    console.log(
      '   ' +
        c.green('✓') +
        ' Reanimated/worklets plugin configured in ' +
        found.file
    );
  } else {
    console.log(
      '   ' + c.yellow('✗') + ' Plugin not detected in ' + found.file + '.'
    );
    console.log('   ' + c.dim('Add it as the LAST plugin:'));
    console.log(
      '   ' +
        c.dim("   plugins: ['react-native-worklets/plugin']  // Reanimated 4")
    );
    console.log(
      '   ' +
        c.dim("   plugins: ['react-native-reanimated/plugin'] // Reanimated 3")
    );
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// 3) Edge-to-edge (the overlay must be able to draw over the status bar/cutout)
// ---------------------------------------------------------------------------

function setEdgeToEdgeGradle(root) {
  const gp = path.join(root, 'android', 'gradle.properties');
  if (!u.fileExists(gp)) {
    return { ok: false, reason: 'android/gradle.properties not found' };
  }
  let text = u.readText(gp) || '';
  const line = 'edgeToEdgeEnabled=true';
  const re = /^[ \t]*edgeToEdgeEnabled[ \t]*=.*$/m;
  if (re.test(text)) {
    const current = text.match(/^[ \t]*edgeToEdgeEnabled[ \t]*=[ \t]*(\S*)/m);
    if (current && /^true$/i.test(current[1]))
      return { ok: true, changed: false, file: gp };
    text = text.replace(re, line);
  } else {
    if (text.length && !text.endsWith('\n')) text += '\n';
    text +=
      '\n# Added by react-native-status-edge: render the app edge-to-edge so the\n' +
      '# glow overlay can draw over the status bar / camera cutout (otherwise the\n' +
      '# animation is clipped on WaterDrop and other top cutouts).\n' +
      line +
      '\n';
  }
  u.writeText(gp, text);
  return { ok: true, changed: true, file: gp };
}

function printManualEdgeToEdge(root, isExpo) {
  console.log('   ' + c.bold('Manual edge-to-edge setup'));
  if (isExpo) {
    console.log(
      '   ' + c.dim('Expo: enable edge-to-edge in app.json / app.config:')
    );
    console.log('   ' + c.dim('     "android": { "edgeToEdgeEnabled": true }'));
    console.log(
      '   ' + c.dim('   (Expo SDK 52+) then run `npx expo prebuild`.')
    );
  } else {
    console.log(
      '   ' + c.dim('React Native 0.81+: in android/gradle.properties add:')
    );
    console.log('   ' + c.dim('     edgeToEdgeEnabled=true'));
    console.log(
      '   ' +
        c.dim('Older RN: install react-native-edge-to-edge and wrap your app,')
    );
    console.log('   ' + c.dim('   or in MainActivity call'));
    console.log(
      '   ' +
        c.dim('     WindowCompat.setDecorFitsSystemWindows(window, false)')
    );
    console.log('   ' + c.dim('   and make the status bar transparent.'));
  }
  console.log(
    '   ' +
      c.dim(
        'iOS needs no change — views already extend under the notch/island.'
      )
  );
}

async function configureEdgeToEdge(root, interactive) {
  console.log(c.bold('3) Edge-to-edge (transparent status bar)'));
  console.log(
    '   ' +
      c.dim(
        'The overlay draws the glow over the cutout. If the top area is opaque\n   (not edge-to-edge), the animation is clipped — especially WaterDrop.'
      )
  );

  const expo = u.isExpo(root);
  const hasAndroid = u.fileExists(
    path.join(root, 'android', 'gradle.properties')
  );

  if (!interactive) {
    printManualEdgeToEdge(root, expo);
    console.log('');
    return;
  }

  console.log('');
  console.log('   How should I set this up?');
  console.log(
    '     ' +
      c.bold('1') +
      ') Configure it for me automatically' +
      (hasAndroid ? '' : c.dim(' (no android/ found)'))
  );
  console.log('     ' + c.bold('2') + ') Just show me the manual steps');
  console.log('     ' + c.bold('3') + ') Skip');
  const choice = (await ask('   Choose [1/2/3] (1): ')) || '1';

  if (choice === '1') {
    if (expo && !hasAndroid) {
      console.log(
        '   ' +
          c.yellow('Expo managed project detected — no native android/ folder.')
      );
      printManualEdgeToEdge(root, true);
    } else {
      const r = setEdgeToEdgeGradle(root);
      if (r.ok && r.changed) {
        console.log(
          '   ' +
            c.green('✓ Set edgeToEdgeEnabled=true in android/gradle.properties')
        );
        console.log(
          '   ' + c.dim('Rebuild the Android app for it to take effect.')
        );
      } else if (r.ok) {
        console.log(
          '   ' +
            c.green('✓ edgeToEdgeEnabled is already true — nothing to do.')
        );
      } else {
        console.log('   ' + c.yellow('Could not auto-configure: ' + r.reason));
        printManualEdgeToEdge(root, expo);
      }
    }
  } else if (choice === '2') {
    printManualEdgeToEdge(root, expo);
  } else {
    console.log('   ' + c.dim('Skipped.'));
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function printNextSteps(root) {
  console.log(c.bold('Next steps'));
  console.log('   • ' + c.dim('iOS: ') + 'cd ios && pod install');
  console.log(
    '   • ' + c.dim('Rebuild the app (native changes need a fresh build).')
  );
  console.log(
    '   • ' + c.dim('Render <StatusEdge isLoading /> at the root of your app.')
  );
  console.log('');
  console.log(
    '   ' +
      c.yellow('Reminder: ') +
      c.dim('this is a development preview, not a production release.')
  );
  console.log('');
}

async function runSetup(opts) {
  const interactive = !!(opts && opts.interactive) && !!process.stdin.isTTY;
  banner();

  const root = u.findConsumerRoot();
  if (u.isOwnRepo(root)) {
    console.log(
      c.dim('  Detected the library repo itself — nothing to set up here.')
    );
    return;
  }

  console.log('  ' + c.dim('Project: ') + root);
  const pm = u.detectPackageManager(root);
  console.log('  ' + c.dim('Package manager: ') + pm);
  console.log('');

  await checkDependencies(root, pm, interactive);
  checkBabelPlugin(root);
  await configureEdgeToEdge(root, interactive);
  printNextSteps(root);
}

async function runDoctor() {
  banner();
  const root = u.findConsumerRoot();
  console.log('  ' + c.dim('Project: ') + root);
  console.log('');
  printDepStatus(root);
  const missing = collectMissingDeps(root);
  console.log('');
  if (missing.length) {
    console.log(
      '  ' +
        c.yellow('Run `npx react-native-status-edge setup` to finish setup.')
    );
  } else {
    console.log('  ' + c.green('Peer dependencies look good.'));
    console.log(
      '  ' +
        c.dim(
          'If the glow is clipped at the top, run setup to enable edge-to-edge.'
        )
    );
  }
  console.log('');
}

function printHelp() {
  console.log('');
  console.log(
    c.bold('react-native-status-edge') + c.dim('  (development preview)')
  );
  console.log('');
  console.log('  Usage:');
  console.log(
    '    npx react-native-status-edge ' +
      c.cyan('setup') +
      '    Interactive setup (deps + edge-to-edge)'
  );
  console.log(
    '    npx react-native-status-edge ' +
      c.cyan('doctor') +
      '   Check peer dependencies only'
  );
  console.log(
    '    npx react-native-status-edge ' + c.cyan('help') + '     Show this help'
  );
  console.log('');
}

module.exports = { runSetup, runDoctor, printHelp };
