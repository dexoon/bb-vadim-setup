// .doc / .rtf / .odt: the plugin's server converts the file to HTML with macOS
// `textutil`, the panel shows the result in a sandboxed frame. Layout is
// simplified — text, lists and tables survive; images and headers don't.
import { useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { PluginFileOpenerSource } from "@get-bb/plugin-sdk/app";
import type { RpcContract } from "./rpc";
import type { LegacyDocExt } from "./formats";
import { Loading, Notice, Toolbar } from "./opener-ui";
import { SandboxFrame, withFrameCsp } from "./SandboxFrame";

const FRAME_STYLE = "<style>body{margin:0 auto;padding:24px 32px;max-width:860px;background:#fff}</style>";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

type State = { status: "converting" } | { status: "ready"; html: string } | { status: "error"; message: string };

export function LegacyDocView({
  bytes,
  ext,
  path,
  source,
  onReload,
}: {
  bytes: Uint8Array;
  ext: LegacyDocExt;
  path: string;
  source: PluginFileOpenerSource;
  onReload: () => void;
}) {
  const rpc = useRpc<RpcContract>();
  const [state, setState] = useState<State>({ status: "converting" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "converting" });
    rpc.call("convertToHtml", { ext, base64: bytesToBase64(bytes) }).then(
      (result) => {
        if (cancelled) return;
        if (result.ok) setState({ status: "ready", html: withFrameCsp(result.html).replace(/<\/head>/i, `${FRAME_STYLE}</head>`) });
        else setState({ status: "error", message: result.message });
      },
      (cause: unknown) => {
        if (!cancelled) setState({ status: "error", message: cause instanceof Error ? cause.message : String(cause) });
      },
    );
    return () => {
      cancelled = true;
    };
    // rpc is a stable client from BB.
  }, [bytes, ext]);

  if (state.status === "converting") return <Loading label="Конвертирую документ…" />;
  if (state.status === "error") return <Notice alert message={state.message} path={path} source={source} onRetry={onReload} />;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <Toolbar path={path} source={source} onReload={onReload}>
        <span>Документ .{ext} · упрощённый вид: без картинок и колонтитулов</span>
      </Toolbar>
      <SandboxFrame title="Документ" html={state.html} />
    </div>
  );
}
