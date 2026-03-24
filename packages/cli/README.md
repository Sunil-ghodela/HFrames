# hyperframes

CLI for creating, previewing, and rendering HTML video compositions.

## Install

```bash
npm install -g hyperframes
```

Or use directly with npx:

```bash
npx hyperframes <command>
```

**Requirements:** Node.js >= 22, FFmpeg

## Commands

### `init`

Scaffold a new Hyperframes project from a template:

```bash
npx hyperframes init my-video
cd my-video
```

### `dev`

Start the live preview studio in your browser:

```bash
npx hyperframes dev
# Server running at http://localhost:3000
# Watching for changes...
```

### `render`

Render a composition to MP4:

```bash
npx hyperframes render ./my-composition.html -o output.mp4
```

### `lint`

Validate your Hyperframes HTML:

```bash
npx hyperframes lint ./my-composition.html
```

### `compositions`

List compositions found in the current project:

```bash
npx hyperframes compositions
```

### `benchmark`

Run rendering benchmarks:

```bash
npx hyperframes benchmark ./my-composition.html
```

### `doctor`

Check your environment for required dependencies (Chrome, FFmpeg, Node.js):

```bash
npx hyperframes doctor
```

### `browser`

Manage the bundled Chrome/Chromium installation:

```bash
npx hyperframes browser
```

### `info`

Print version and environment info:

```bash
npx hyperframes info
```

### `docs`

Open the documentation in your browser:

```bash
npx hyperframes docs
```

### `upgrade`

Upgrade Hyperframes to the latest version:

```bash
npx hyperframes upgrade
```

## Documentation

Full documentation: [hyperframes.heygen.com/packages/cli](https://hyperframes.heygen.com/packages/cli)

## Related packages

- [`@hyperframes/core`](../core) — types, parsers, frame adapters
- [`@hyperframes/engine`](../engine) — rendering engine
- [`@hyperframes/producer`](../producer) — render pipeline
- [`@hyperframes/studio`](../studio) — composition editor UI
