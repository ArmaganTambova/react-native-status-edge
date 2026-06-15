'use strict';

// Runs after the package is installed in a consumer project.
//
// IMPORTANT: this must NEVER throw or exit non-zero — a failing postinstall
// aborts the host app's install. It only prints a short greeting pointing to
// the interactive wizard. (We deliberately do NOT auto-run interactive prompts
// here: prompting during `install` hangs/breaks many package managers and CI.)

try {
  const u = require('./utils');
  const root = u.findConsumerRoot();

  // Don't greet ourselves during local development of the library.
  if (u.isOwnRepo(root)) process.exit(0);

  const inCI =
    process.env.CI != null || process.env.CONTINUOUS_INTEGRATION != null;
  // In non-interactive/CI installs, stay silent to avoid log noise.
  if (inCI || !process.stdout.isTTY) process.exit(0);

  const { c } = u;
  const line = c.cyan(
    '  ────────────────────────────────────────────────────────'
  );
  console.log('');
  console.log(line);
  console.log(
    '  ' +
      c.bold('react-native-status-edge') +
      c.dim('  installed  ·  development preview')
  );
  console.log('');
  console.log('  Finish setup (peer deps + Android edge-to-edge) by running:');
  console.log('      ' + c.green('npx react-native-status-edge setup'));
  console.log('');
  console.log(
    '  ' + c.dim('Tip: `... doctor` just checks your peer dependencies.')
  );
  console.log(line);
  console.log('');
} catch (_) {
  // Never fail the host install.
}

process.exit(0);
