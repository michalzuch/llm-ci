# MyLib

MyLib is a fast, composable utility library for JavaScript and TypeScript. It provides a small set of primitives — `pipe`, `compose`, `map`, `filter`, `reduce` — that work seamlessly across sync and async code with zero dependencies.

## Why MyLib?

Most utility libraries are either too heavy (pulling in hundreds of transitive deps) or too minimal (lacking async support). MyLib hits the sweet spot: tree-shakeable, fully typed, and async-native.

## Installation

```bash
npm install mylib
```

## Quick start

```ts
import { pipe } from 'mylib';

const result = await pipe(
  fetchUser(42),
  (user) => user.name.toUpperCase(),
  (name) => `Hello, ${name}!`
);
// → "Hello, ALICE!"
```
