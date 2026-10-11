# @vibecommerce/markdown-view

The viewer components of **Markdown_vibecom**, a plugin for [BB](https://getbb.app): Markdown
read-only in a Typora-like look (outline, relative images, refreshed live when the file changes on
disk), and editing in place with [Vditor](https://github.com/Vanessa219/vditor) that saves only the
changed lines. Packaged so that another BB plugin can show Markdown inside its own panel.

The package ships TypeScript sources. It is meant to be compiled by `bb plugin build`, not used on
its own.

```tsx
import { MarkdownOpener } from "@vibecommerce/markdown-view/MarkdownOpener";

// Same props as a BB file opener: { path, source, Original }
<MarkdownOpener path={path} source={source} Original={Original} />
```

- `react` and `@get-bb/plugin-sdk` are optional peer dependencies: BB supplies both at runtime.
- `bb.pluginTailwindContent` in `package.json` lets `bb plugin build` pick up the Tailwind classes
  of these files when the package is a direct dependency of your plugin.
- Both the read-only view and the editor are Vditor, and its script and assets come from the route
  of the Markdown_vibecom plugin server (`/api/v1/plugins/markdown-view/http/vditor`): that plugin
  has to be installed.
- Interface strings are in Russian.

License: MIT.
