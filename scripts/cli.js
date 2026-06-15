#!/usr/bin/env node
'use strict';

// CLI entry for react-native-status-edge:
//   npx react-native-status-edge setup    (interactive setup)
//   npx react-native-status-edge doctor   (check peer deps)
//   npx react-native-status-edge help

const { runSetup, runDoctor, printHelp } = require('./wizard');

const cmd = String(process.argv[2] || 'setup').toLowerCase();

(async () => {
  try {
    if (cmd === 'setup' || cmd === 'init') {
      await runSetup({ interactive: true });
    } else if (cmd === 'doctor' || cmd === 'check') {
      await runDoctor();
    } else if (cmd === 'help' || cmd === '-h' || cmd === '--help') {
      printHelp();
    } else {
      console.log('Unknown command: ' + cmd);
      printHelp();
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(e && e.message ? e.message : e);
    process.exitCode = 1;
  }
})();
