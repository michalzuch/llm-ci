# API Reference

Complete reference for all MyLib exports.

## pipe(...fns)

Composes functions left-to-right. The first argument is the initial value; subsequent arguments are functions applied in order.

```ts
function pipe<T>(value: T, ...fns: Array<(x: any) => any>): Promise<any>
```

**Returns** a Promise that resolves to the final value.

## compose(...fns)

Like `pipe` but applies functions right-to-left (math convention).

```ts
function compose<T>(...fns: Array<(x: any) => any>): (value: T) => Promise<any>
```

**Returns** a curried function that accepts the initial value.

## map(fn)

Creates a function that applies `fn` to each element of an array (async-safe).

```ts
function map<T, U>(fn: (x: T) => U | Promise<U>): (arr: T[]) => Promise<U[]>
```

## filter(predicate)

Creates a function that filters an array using an async-safe predicate.

```ts
function filter<T>(predicate: (x: T) => boolean | Promise<boolean>): (arr: T[]) => Promise<T[]>
```

## reduce(fn, initial)

Async-safe reduce over an array.

```ts
function reduce<T, U>(fn: (acc: U, x: T) => U | Promise<U>, initial: U): (arr: T[]) => Promise<U>
```
