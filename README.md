Pilot 👩‍✈️
========
A TypeScript wrapper for type-checking Gecko javascript

What
----
A drop-in replacement for typescript that adds basic JSM support:

 * teaches it that `*.jsm` files are JS "modules",
 * recognizes `EXPORTED_SYMBOLS` as exports statements,
 * declares local variables from a few `Cu.defineLazyXXX()` methods.

How
---
The implementation (inspired by [ttypescript]) is a wrapper around TS which
`requires()` original modules and patches the exported `ts` namespace object
with custom intercept methods to support JSMs.

Typescript doesn't support custom plugins, maintaining forks is a treadmill,
so a shim that only intercepts and uses a few public methods seemed like the
best alternative.

Use
---
Clone, `npm install`, add `*.jsm` to your `tsconfig` and use as regular `tsc`:

    node d:/git/pilot/lib/tsc -p tsconfig.json

or configure VS Code by pointing at the `tsserver` in user settings:

    "typescript.tsdk": "d:/git/pilot/lib/"

License
-------
MIT

[ttypescript]:
    https://github.com/cevek/ttypescript/
