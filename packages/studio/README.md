# @hyperframes/studio

Browser-based composition editor UI for Hyperframes. Provides a visual timeline, code editor, and live preview for building video compositions.

## Install

```bash
npm install @hyperframes/studio
```

## What it does

The studio is a React application with:

- **Visual timeline** — drag, resize, and arrange elements on tracks
- **Code editor** — edit HTML and GSAP scripts with CodeMirror (syntax highlighting, autocomplete)
- **Live preview** — see changes in real time as you edit
- **Composition inspector** — view and modify element properties

## Development

The studio is embedded in the `hyperframes dev` command. To develop the studio UI itself:

```bash
cd packages/studio
pnpm dev        # Start Vite dev server
pnpm build      # Build for production
pnpm typecheck  # Type-check
```

## Tech stack

- React 18/19, Zustand (state management)
- CodeMirror 6 (editor)
- Tailwind CSS (styling)
- Vite (bundler)
- Phosphor Icons

## Documentation

Full documentation: [hyperframes.heygen.com/packages/studio](https://hyperframes.heygen.com/packages/studio)

## Related packages

- [`@hyperframes/core`](../core) — types and parsers used by the editor
- [`hyperframes`](../cli) — CLI that serves the studio via `hyperframes dev`
