import { useMemo } from "react";
import type { RefObject } from "react";
import type { TranslationKey } from "../../i18n";

interface ConsoleLogsTabProps {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  busy: boolean;
  logLevelFilter: "all" | "error" | "command";
  setLogLevelFilter: (value: "all" | "error" | "command") => void;
  logKeyword: string;
  setLogKeyword: (value: string) => void;
  consoleCommand: string;
  setConsoleCommand: (value: string) => void;
  visibleLogs: string[];
  renderedLogs: string[];
  hasMoreLogs: boolean;
  hiddenLogCount: number;
  visibleRatio: number;
  showJumpToBottom: boolean;
  onLoadLogs: () => void;
  onCopyLogs: () => void;
  onExportLogs: () => void;
  onSendCommand: () => void;
  onHandleLogScroll: () => void;
  onJumpToBottom: () => void;
  logPreRef: RefObject<HTMLPreElement>;
}

export function ConsoleLogsTab({
  t,
  busy,
  logLevelFilter,
  setLogLevelFilter,
  logKeyword,
  setLogKeyword,
  consoleCommand,
  setConsoleCommand,
  visibleLogs,
  renderedLogs,
  hasMoreLogs,
  hiddenLogCount,
  visibleRatio,
  showJumpToBottom,
  onLoadLogs,
  onCopyLogs,
  onExportLogs,
  onSendCommand,
  onHandleLogScroll,
  onJumpToBottom,
  logPreRef,
}: ConsoleLogsTabProps) {
  const shownCount = useMemo(() => visibleLogs.length, [visibleLogs.length]);
  const totalCount = useMemo(() => renderedLogs.length, [renderedLogs.length]);

  return (
    <div className="instance-console-log-view">
      <div className="instance-console-toolbar">
        <div>
          <button className="chip-button" type="button" onClick={onLoadLogs}>
            {t("console.logs.refresh")}
          </button>
          <button className="chip-button" type="button" onClick={onCopyLogs}>
            {t("console.logs.copy")}
          </button>
          <button className="chip-button" type="button" onClick={onExportLogs}>
            {t("console.logs.export")}
          </button>
        </div>
        <div className="instance-console-log-filters">
          <select
            value={logLevelFilter}
            onChange={(event) => {
              setLogLevelFilter(event.target.value as "all" | "error" | "command");
            }}
            aria-label={t("console.logs.filterLevel")}
          >
            <option value="all">{t("console.logs.filter.all")}</option>
            <option value="error">{t("console.logs.filter.error")}</option>
            <option value="command">{t("console.logs.filter.command")}</option>
          </select>
          <input
            value={logKeyword}
            onChange={(event) => setLogKeyword(event.target.value)}
            placeholder={t("console.logs.searchPlaceholder")}
            aria-label={t("console.logs.search")}
          />
        </div>
        <div className="instance-console-command-row">
          <input
            value={consoleCommand}
            onChange={(event) => setConsoleCommand(event.target.value)}
            placeholder={t("console.logs.commandPlaceholder")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSendCommand();
              }
            }}
          />
          <button className="chip-button" type="button" onClick={onSendCommand} disabled={busy}>
            {t("console.logs.send")}
          </button>
        </div>
      </div>
      <div className="instance-console-log-scroll-shell">
        {hasMoreLogs && (
          <p className="instance-console-log-more-hint" aria-live="polite">
            {t("console.logs.moreHint", {
              shown: shownCount,
              total: totalCount,
              ratio: visibleRatio,
              hidden: hiddenLogCount,
            })}
          </p>
        )}
        {showJumpToBottom && (
          <button className="instance-console-jump-bottom" type="button" onClick={onJumpToBottom}>
            {t("console.logs.jumpBottom")}
          </button>
        )}
        <pre ref={logPreRef} onScroll={onHandleLogScroll}>
          {visibleLogs.length ? visibleLogs.join("\n") : t("console.logs.noMatch")}
        </pre>
      </div>
    </div>
  );
}
