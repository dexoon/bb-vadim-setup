# @vibecommerce/office-preview

The viewer components of **Office_vibecom**, a plugin for [BB](https://getbb.app): office files
read-only — Excel, OpenDocument and CSV spreadsheets, Word `.docx`, PowerPoint `.pptx` with speaker
notes. Packaged so that another BB plugin can show office files inside its own panel.

The package ships TypeScript sources. It is meant to be compiled by `bb plugin build`, not used on
its own.

```tsx
import { PowerPointOpener, SpreadsheetOpener, WordOpener } from "@vibecommerce/office-preview/openers";

// Same props as a BB file opener: { path, source, Original }
<SpreadsheetOpener path={path} source={source} Original={Original} />
```

- `react` and `@get-bb/plugin-sdk` are optional peer dependencies: BB supplies both at runtime.
- `bb.pluginTailwindContent` in `package.json` lets `bb plugin build` pick up the Tailwind classes
  of these files when the package is a direct dependency of your plugin.
- `LegacyDocOpener` (`.doc`, `.rtf`, `.odt`) calls the `convertToHtml` RPC of the plugin it runs in
  (contract in `rpc.ts`, macOS `textutil` on the server). Without such a server use the other
  openers only.
- SheetJS (`xlsx`) is installed from the SheetJS CDN, as SheetJS recommends.
- Interface strings are in Russian.

License: MIT.
