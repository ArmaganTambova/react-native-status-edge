'use strict';

// Runs after the package is installed in a consumer project.
//
// It automatically runs setup (peer-dependency check + Android edge-to-edge)
// so the user does NOT need to type any command. It is fully NON-INTERACTIVE
// and idempotent.
//
// IMPORTANT: this must NEVER throw or exit non-zero — a failing postinstall
// would abort the host app's install.

(async () => {
  try {
    const u = require('./utils');
    const root = u.findConsumerRoot();
    // Skip when installing inside the library's own repo (local development).
    if (u.isOwnRepo(root)) return;
    const { runSetup } = require('./wizard');
    await runSetup({ interactive: false });
  } catch (_) {
    // Never fail the host install.
  }
})().finally(() => process.exit(0));
