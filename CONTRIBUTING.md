# Contributing

**react-native-status-edge is proprietary, source-available software** (see
[LICENSE](./LICENSE)). It is **not** open source.

External contributions, pull requests, forks, and derivative works are **not
accepted**, and the code may not be redistributed, modified, or republished.
Development and distribution rights are reserved exclusively by the author.

If you have found a bug or have a feature request, you may open an issue. For
licensing inquiries or any use beyond the permissions granted in the LICENSE,
contact **Armağan Tambova** <armagantambova@gmail.com>.

---

## Maintainer notes (internal)

This is a Yarn 4 monorepo: the library lives in the repo root and a demo lives
in `example/`. Node version is pinned in [`.nvmrc`](./.nvmrc).

```sh
yarn                 # install
yarn typecheck       # tsc
yarn lint            # eslint (yarn lint --fix to autofix)
yarn test            # jest
yarn prepare         # build lib/ with react-native-builder-bob
yarn example start   # Metro for the demo
yarn example android # run the demo on Android
yarn example ios     # run the demo on iOS (after: cd example/ios && pod install)
```

JS changes hot-reload in the demo; native (Kotlin/Obj-C++) changes require an
app rebuild. Commits follow [conventional commits](https://www.conventionalcommits.org/en)
(enforced by commitlint via lefthook).
