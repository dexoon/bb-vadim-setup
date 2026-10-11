# `vendor/` — просмотрщики для Explorer_vibecom

Last Updated: 2026-10-11

`markdown-view.tgz` и `office-preview.tgz` — пакеты `@vibecommerce/markdown-view` и
`@vibecommerce/office-preview`, упакованные `npm pack` из `../../markdown-view/src` и
`../../office-preview/src`. `package.json` ставит их отсюда (`file:vendor/*.tgz`). Руками не
править: после правки `src/` просмотрщика — `npm run pack-viewers` в `files-editor/`, тест
`lib/vendor-viewers.test.ts` сверяет архивы с исходниками.
