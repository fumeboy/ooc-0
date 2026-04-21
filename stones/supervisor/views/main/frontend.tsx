/**
 * Supervisor 主 View（Phase 3 示例）
 *
 * 展示：
 * - 对象身份（sessionId / objectName）
 * - callMethod 调用入口（Phase 4 接通后可实际提交）
 *
 * @ref docs/superpowers/specs/2026-04-21-trait-namespace-views-and-http-methods-design.md#4.3
 */
import React, { useState } from "react";

interface SupervisorViewProps {
  sessionId?: string;
  objectName?: string;
  callMethod?: (traitId: string, method: string, args: object) => Promise<unknown>;
}

export default function SupervisorMainView(props: SupervisorViewProps) {
  const { sessionId = "", objectName = "supervisor", callMethod } = props;
  const [pinged, setPinged] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePing = async () => {
    setError(null);
    setPinged(null);
    if (!callMethod) {
      setError("callMethod 未注入（Phase 4 未启用 / 非 Flow 上下文）");
      return;
    }
    try {
      const result = await callMethod("self:main", "ping", { from: "ui" });
      setPinged(JSON.stringify(result));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Supervisor 主 View</h2>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Phase 3 示例；演示 DynamicUI + callMethod 链路（Phase 4 生效）。
        </p>
      </div>
      <div className="text-xs font-mono text-[var(--muted-foreground)]">
        <div>sessionId: {sessionId || "（空：stone 级渲染）"}</div>
        <div>objectName: {objectName}</div>
        <div>callMethod: {callMethod ? "已注入" : "未注入"}</div>
      </div>
      <div>
        <button
          onClick={handlePing}
          className="px-3 py-1.5 text-sm rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90"
        >
          调用 self:main ping
        </button>
      </div>
      {pinged && <pre className="text-xs bg-[var(--muted)] p-3 rounded">result: {pinged}</pre>}
      {error && <pre className="text-xs bg-red-50 text-red-600 p-3 rounded">error: {error}</pre>}
    </div>
  );
}
