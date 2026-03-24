import { useState } from "react";

interface Props {
  toolName: string;
  args: unknown;
  result: unknown;
  isError?: boolean;
}

/** Format a namespaced tool name ({serverId}__{toolName}) for display */
function formatToolName(name: string): string {
  const parts = name.split("__");
  return parts.length >= 2 ? parts.slice(1).join("__") : name;
}

export function ToolCallResult({ toolName, args, result, isError }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span>{formatToolName(toolName)}</span>
        <span>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div>
          <div>
            <strong>Arguments</strong>
            <pre>{JSON.stringify(args, null, 2)}</pre>
          </div>
          <div className={isError ? "error" : undefined}>
            <strong>Result</strong>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
