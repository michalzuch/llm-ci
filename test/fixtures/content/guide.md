# Getting Started

This guide walks you through installing MyLib and building your first pipeline.

## Installation

Install from npm:

```bash
npm install mylib
# or
pnpm add mylib
```

## Core concept: pipe

`pipe` takes a starting value and passes it through a series of functions left-to-right. Each function receives the return value of the previous one.

```ts
import { pipe } from 'mylib';

const shout = (s: string) => s.toUpperCase() + '!';
const trim = (s: string) => s.trim();

const result = pipe('  hello world  ', trim, shout);
// → "HELLO WORLD!"
```

## Async pipelines

Any step can return a Promise — MyLib handles the await automatically:

```ts
const user = await pipe(
  42,
  (id) => fetch(`/api/users/${id}`).then(r => r.json()),
  (user) => user.displayName
);
```

## Error handling

Wrap your pipeline in a standard try/catch — errors propagate naturally:

```ts
try {
  const result = await pipe(input, validate, transform, save);
} catch (err) {
  console.error('Pipeline failed:', err);
}
```
