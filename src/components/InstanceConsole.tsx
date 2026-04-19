import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createInstanceDirectory,
  deleteInstance,
  downloadInstanceJavaRuntime,
  getInstanceConsoleLogs,
  getInstanceProcessStatus,
  getInstanceJavaRuntimeStatus,
  listInstanceFiles,
  readInstanceTextFile,
  sendInstanceCommand,
  startInstanceServer,
  stopInstanceProcess,
  updateInstanceJavaPath,
  exportTextFile,
  writeInstanceTextFile,
  type InstanceConfig,
  type InstanceFileEntry,
} from "../features/instanceService";
import { localizeErrorText } from "../features/errorHandling";
import { javaInstallDirectory, recommendedJavaMajorFromMcVersion } from "../features/javaRuntime";
import { JavaRuntimePromptModal } from "./JavaRuntimePromptModal";
import { DeleteInstancePromptModal } from "./DeleteInstancePromptModal";
import { ConsoleFilesTab } from "./instanceConsole/ConsoleFilesTab";
import { ConsoleLogsTab } from "./instanceConsole/ConsoleLogsTab";
import { ConsoleSettingsTab } from "./instanceConsole/ConsoleSettingsTab";
import { useI18n } from "../i18n";

type ConsoleTab = "logs" | "files" | "settings";

interface InstanceConsoleProps {
  open: boolean;
  instance: InstanceConfig | null;
  onClose: () => void;
  onUpdated: (instance?: InstanceConfig) => Promise<void> | void;
}

interface ConsoleLogEvent {
  instanceId: string;
  stream: string;
  line: string;
}

interface ProcessEvent {
  instanceId: string;
  status: string;
  message: string;
}

const LOG_FILTER_LEVEL_STORAGE_KEY = "asl-console-log-filter-level-v1";
const LOG_FILTER_KEYWORD_STORAGE_KEY = "asl-console-log-filter-keyword-v1";
const LOG_RENDER_CHUNK = 240;

function joinPath(base: string, child: string) {
  if (!base) {
    return child;
  }
  return `${base}/${child}`;
}

function parentPath(path: string) {
  if (!path) {
    return "";
  }
  const chunks = path.split("/").filter(Boolean);
  chunks.pop();
  return chunks.join("/");
}

function formatSize(size?: number) {
  if (!size || size <= 0) {
    return "-";
  }
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${size} B`;
}

export function InstanceConsole({ open, instance, onClose, onUpdated }: InstanceConsoleProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<ConsoleTab>("logs");
  const tabNavRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0, ready: false });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const [javaPath, setJavaPath] = useState("");

  const [logs, setLogs] = useState<string[]>([]);
  const [logLevelFilter, setLogLevelFilter] = useState<"all" | "error" | "command">(() => {
    const value = window.localStorage.getItem(LOG_FILTER_LEVEL_STORAGE_KEY);
    if (value === "error" || value === "command" || value === "all") {
      return value;
    }
    return "all";
  });
  const [logKeyword, setLogKeyword] = useState(() => window.localStorage.getItem(LOG_FILTER_KEYWORD_STORAGE_KEY) ?? "");
  const [logRenderCount, setLogRenderCount] = useState(LOG_RENDER_CHUNK);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [consoleCommand, setConsoleCommand] = useState("");
  const logPreRef = useRef<HTMLPreElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const loadMoreAnchorRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  const pendingLogLinesRef = useRef<string[]>([]);
  const logFlushTimerRef = useRef<number | null>(null);

  const [cwd, setCwd] = useState("");
  const [entries, setEntries] = useState<InstanceFileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [javaPromptOpen, setJavaPromptOpen] = useState(false);
  const [javaPromptReason, setJavaPromptReason] = useState("");
  const [deletePromptOpen, setDeletePromptOpen] = useState(false);
  const [deletePromptRunning, setDeletePromptRunning] = useState(false);
  const javaPromptResolverRef = useRef<((value: boolean) => void) | null>(null);
  const deletePromptResolverRef = useRef<((value: boolean) => void) | null>(null);

  const askForJavaDownload = async (reason?: string) => {
    setJavaPromptReason(reason ?? "");
    setJavaPromptOpen(true);
    return new Promise<boolean>((resolve) => {
      javaPromptResolverRef.current = resolve;
    });
  };

  const resolveJavaPrompt = (value: boolean) => {
    const resolve = javaPromptResolverRef.current;
    javaPromptResolverRef.current = null;
    setJavaPromptOpen(false);
    setJavaPromptReason("");
    resolve?.(value);
  };

  const askForDelete = async (running: boolean) => {
    setDeletePromptRunning(running);
    setDeletePromptOpen(true);
    return new Promise<boolean>((resolve) => {
      deletePromptResolverRef.current = resolve;
    });
  };

  const resolveDeletePrompt = (value: boolean) => {
    const resolve = deletePromptResolverRef.current;
    deletePromptResolverRef.current = null;
    setDeletePromptOpen(false);
    setDeletePromptRunning(false);
    resolve?.(value);
  };

  useEffect(() => {
    if (!instance || !open) {
      return;
    }
    setJavaPath(instance.javaPath ?? "");
    setLogRenderCount(LOG_RENDER_CHUNK);
    shouldAutoScrollRef.current = true;
    setNotice("");
  }, [instance, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const keys: ConsoleTab[] = ["logs", "files", "settings"];
    const activeIndex = keys.findIndex((key) => key === tab);
    const nav = tabNavRef.current;
    const button = tabButtonRefs.current[activeIndex] ?? null;

    if (!nav || !button) {
      return;
    }

    const update = () => {
      setTabIndicator({ left: button.offsetLeft, width: button.offsetWidth, ready: true });
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(nav);
    observer.observe(button);

    return () => {
      observer.disconnect();
    };
  }, [open, tab]);

  const handleLogScroll = () => {
    const node = logPreRef.current;
    if (!node) {
      return;
    }

    const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldAutoScrollRef.current = distanceToBottom <= 24;
    setShowJumpToBottom(distanceToBottom > 140);

    if (node.scrollTop <= 60 && hasMoreLogs) {
      loadMoreAnchorRef.current = {
        scrollTop: node.scrollTop,
        scrollHeight: node.scrollHeight,
      };
      setLogRenderCount((prev) => Math.min(renderedLogs.length, prev + LOG_RENDER_CHUNK));
    }
  };

  const flushPendingLogLines = () => {
    if (!pendingLogLinesRef.current.length) {
      return;
    }

    const batch = pendingLogLinesRef.current;
    pendingLogLinesRef.current = [];
    setLogs((prev) => [...prev, ...batch].slice(-800));
  };

  useEffect(() => {
    window.localStorage.setItem(LOG_FILTER_LEVEL_STORAGE_KEY, logLevelFilter);
  }, [logLevelFilter]);

  useEffect(() => {
    window.localStorage.setItem(LOG_FILTER_KEYWORD_STORAGE_KEY, logKeyword);
  }, [logKeyword]);

  const renderedLogs = useMemo(() => {
    const keyword = logKeyword.trim().toLowerCase();

    return logs.filter((line) => {
      if (logLevelFilter === "error" && !line.includes("[ERR]")) {
        return false;
      }

      if (logLevelFilter === "command" && !line.trimStart().startsWith(">")) {
        return false;
      }

      if (keyword && !line.toLowerCase().includes(keyword)) {
        return false;
      }

      return true;
    });
  }, [logs, logKeyword, logLevelFilter]);

  const visibleLogs = useMemo(() => {
    if (renderedLogs.length <= logRenderCount) {
      return renderedLogs;
    }
    return renderedLogs.slice(renderedLogs.length - logRenderCount);
  }, [renderedLogs, logRenderCount]);

  const hasMoreLogs = renderedLogs.length > visibleLogs.length;
  const hiddenLogCount = renderedLogs.length - visibleLogs.length;
  const visibleRatio = renderedLogs.length ? Math.round((visibleLogs.length / renderedLogs.length) * 100) : 100;

  useEffect(() => {
    setLogRenderCount(LOG_RENDER_CHUNK);
    setShowJumpToBottom(false);
  }, [logKeyword, logLevelFilter]);

  const loadLogs = async () => {
    if (!instance) {
      return;
    }
    try {
      const next = await getInstanceConsoleLogs(instance.id, 600);
      setLogs(next);
    } catch (error) {
      setLogs([t("console.notice.logLoadFailed", { error: localizeErrorText(t, error, "E_CONSOLE_LOGS_LOAD") })]);
    }
  };

  useEffect(() => {
    if (!open || tab !== "logs" || !instance) {
      return;
    }

    void loadLogs();
  }, [open, tab, instance?.id]);

  useEffect(() => {
    if (!open || tab !== "logs") {
      return;
    }

    const node = logPreRef.current;
    if (!node) {
      return;
    }

    if (!shouldAutoScrollRef.current) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [visibleLogs, open, tab]);

  useEffect(() => {
    const node = logPreRef.current;
    const anchor = loadMoreAnchorRef.current;
    if (!node || !anchor) {
      return;
    }

    const heightDelta = node.scrollHeight - anchor.scrollHeight;
    node.scrollTop = Math.max(0, anchor.scrollTop + heightDelta);
    loadMoreAnchorRef.current = null;
  }, [visibleLogs.length]);

  useEffect(() => {
    if (!open || tab !== "logs" || !instance) {
      return;
    }

    let active = true;

    const setup = async () => {
      const unlistenLog = await listen<ConsoleLogEvent>("instance-console-log", (event) => {
        if (!active || !event.payload || event.payload.instanceId !== instance.id) {
          return;
        }

        const prefix = event.payload.stream === "stderr" ? "[ERR] " : "";
        pendingLogLinesRef.current.push(`${prefix}${event.payload.line}`);
        if (logFlushTimerRef.current === null) {
          logFlushTimerRef.current = window.setTimeout(() => {
            logFlushTimerRef.current = null;
            flushPendingLogLines();
          }, 70);
        }
      });

      const unlistenState = await listen<ProcessEvent>("instance-process-state", (event) => {
        if (!active || !event.payload || event.payload.instanceId !== instance.id) {
          return;
        }
        setNotice(event.payload.message);
      });

      return () => {
        unlistenLog();
        unlistenState();
      };
    };

    const unlistenPromise = setup();

    return () => {
      active = false;
      if (logFlushTimerRef.current !== null) {
        window.clearTimeout(logFlushTimerRef.current);
        logFlushTimerRef.current = null;
      }
      flushPendingLogLines();
      void unlistenPromise.then((dispose) => dispose?.());
    };
  }, [open, tab, instance?.id]);

  const loadDir = async (nextPath: string) => {
    if (!instance) {
      return;
    }
    try {
      const items = await listInstanceFiles(instance.id, nextPath || undefined);
      setEntries(items);
      setCwd(nextPath);
    } catch (error) {
      setNotice(t("console.notice.dirLoadFailed", { error: localizeErrorText(t, error, "E_CONSOLE_DIR_LOAD") }));
    }
  };

  useEffect(() => {
    if (!open || tab !== "files" || !instance) {
      return;
    }
    void loadDir("");
  }, [open, tab, instance?.id]);

  const openFile = async (relativePath: string) => {
    if (!instance) {
      return;
    }
    try {
      const text = await readInstanceTextFile(instance.id, relativePath);
      setSelectedFile(relativePath);
      setEditorContent(text);
      setNotice(t("console.notice.fileOpened", { path: relativePath }));
    } catch (error) {
      setNotice(t("console.notice.fileOpenFailed", { error: localizeErrorText(t, error, "E_CONSOLE_FILE_OPEN") }));
    }
  };

  const saveFile = async () => {
    if (!instance || !selectedFile) {
      return;
    }
    setBusy(true);
    try {
      await writeInstanceTextFile(instance.id, selectedFile, editorContent);
      setNotice(t("console.notice.fileSaved", { path: selectedFile }));
    } catch (error) {
      setNotice(t("console.notice.fileSaveFailed", { error: localizeErrorText(t, error, "E_CONSOLE_FILE_SAVE") }));
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async () => {
    if (!instance) {
      return;
    }
    const folderName = window.prompt(t("console.notice.folderPrompt"));
    if (!folderName) {
      return;
    }
    const path = joinPath(cwd, folderName.trim());
    if (!path) {
      return;
    }

    setBusy(true);
    try {
      await createInstanceDirectory(instance.id, path);
      await loadDir(cwd);
      setNotice(t("console.notice.folderCreated", { path }));
    } catch (error) {
      setNotice(t("console.notice.folderCreateFailed", { error: localizeErrorText(t, error, "E_CONSOLE_MKDIR") }));
    } finally {
      setBusy(false);
    }
  };

  const saveJavaPath = async () => {
    if (!instance) {
      return;
    }
    setBusy(true);
    try {
      await updateInstanceJavaPath(instance.id, javaPath.trim() || undefined);
      await onUpdated();
      setNotice(t("console.notice.javaSaved"));
    } catch (error) {
      setNotice(t("console.notice.javaSaveFailed", { error: localizeErrorText(t, error, "E_CONSOLE_JAVA_SAVE") }));
    } finally {
      setBusy(false);
    }
  };

  const startServer = async () => {
    if (!instance) {
      return;
    }
    setBusy(true);
    try {
      const javaStatus = await getInstanceJavaRuntimeStatus(instance.id);
      if (!javaStatus.available) {
        const shouldDownloadJava = await askForJavaDownload(javaStatus.reason ? localizeErrorText(t, javaStatus.reason, "E_JAVA_MISSING") : undefined);

        if (!shouldDownloadJava) {
          setNotice(t("console.notice.startCanceled"));
          return;
        }

        setNotice(t("console.notice.javaDownloading"));
        const javaPath = await downloadInstanceJavaRuntime(instance.id);
        await onUpdated();
        setNotice(t("console.notice.javaDownloaded", { path: javaPath }));
      }

      const result = await startInstanceServer(instance.id);
      setNotice(t("console.notice.started", { pid: result.pid }));
      setTab("logs");
      await loadLogs();
    } catch (error) {
      const errorText = localizeErrorText(t, error, "E_CONSOLE_START");
      setNotice(t("console.notice.startFailed", { error: errorText }));
    } finally {
      setBusy(false);
    }
  };

  const sendCommand = async () => {
    if (!instance) {
      return;
    }
    const command = consoleCommand.trim();
    if (!command) {
      return;
    }

    setBusy(true);
    try {
      await sendInstanceCommand(instance.id, command);
      setLogs((prev) => [...prev.slice(-799), `> ${command}`]);
      setConsoleCommand("");
    } catch (error) {
      setNotice(t("console.notice.commandFailed", { error: localizeErrorText(t, error, "E_CONSOLE_COMMAND") }));
    } finally {
      setBusy(false);
    }
  };

  const copyLogs = async () => {
    if (!renderedLogs.length) {
      setNotice(t("console.notice.noLogsToCopy"));
      return;
    }

    try {
      await navigator.clipboard.writeText(renderedLogs.join("\n"));
      setNotice(t("console.notice.logsCopied"));
    } catch (error) {
      setNotice(t("console.notice.copyFailed", { error: localizeErrorText(t, error, "E_CONSOLE_COPY") }));
    }
  };

  const exportLogs = async () => {
    if (!instance) {
      return;
    }

    if (!logs.length) {
      setNotice(t("console.notice.noLogsToExport"));
      return;
    }

    const exportFiltered = window.confirm(t("console.notice.exportChoose"));
    const exportSource = exportFiltered ? renderedLogs : logs;

    if (!exportSource.length) {
      setNotice(t("console.notice.noFilteredLogs"));
      return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const defaultName = `${instance.name.replace(/\s+/g, "_")}-${stamp}.log`;
    const selected = await save({
      title: t("console.notice.exportTitle"),
      defaultPath: defaultName,
      filters: [{ name: "Log", extensions: ["log", "txt"] }],
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    try {
      await exportTextFile(selected, exportSource.join("\n"));
      setNotice(t("console.notice.logsExported", { path: selected }));
    } catch (error) {
      setNotice(t("console.notice.exportFailed", { error: localizeErrorText(t, error, "E_CONSOLE_EXPORT") }));
    }
  };

  const stopServer = async () => {
    if (!instance) {
      return;
    }

    setBusy(true);
    try {
      await stopInstanceProcess(instance.id);
      setNotice(t("console.notice.stopSent"));
    } catch (error) {
      setNotice(t("console.notice.stopFailed", { error: localizeErrorText(t, error, "E_CONSOLE_STOP") }));
    } finally {
      setBusy(false);
    }
  };

  const removeInstance = async () => {
    if (!instance) {
      return;
    }
    setBusy(true);
    try {
      const processStatus = await getInstanceProcessStatus(instance.id);
      const confirmed = await askForDelete(processStatus.running);
      if (!confirmed) {
        return;
      }

      await deleteInstance(instance.id);
      await onUpdated();
      onClose();
    } catch (error) {
      setNotice(t("console.notice.deleteFailed", { error: localizeErrorText(t, error, "E_CONSOLE_DELETE") }));
    } finally {
      setBusy(false);
    }
  };

  const canShow = open && instance;
  const fileBread = useMemo(() => (cwd ? `/${cwd}` : "/"), [cwd]);

  if (!canShow || !instance) {
    return null;
  }

  return (
    <>
      <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t("console.aria")}>
        <section className="wizard-modal instance-console-modal">
        <header className="instance-console-header">
          <div>
            <p className="panel-label">{t("console.label")}</p>
            <h3>{instance.name}</h3>
            <p className="instance-message">{instance.directory}</p>
          </div>
          <button className="ghost-action instance-console-close" type="button" onClick={onClose}>
            {t("console.close")}
          </button>
        </header>

        <div className="instance-console-quick-actions">
          <button className="chip-button" type="button" onClick={startServer} disabled={busy}>
            {t("console.action.start")}
          </button>
          <button className="chip-button" type="button" onClick={stopServer} disabled={busy}>
            {t("console.action.stop")}
          </button>
          <button className="chip-button" type="button" onClick={removeInstance} disabled={busy}>
            {t("console.action.delete")}
          </button>
        </div>

        <div className="instance-console-tabs" ref={tabNavRef}>
          <span
            className={`instance-console-tab-indicator ${tabIndicator.ready ? "ready" : ""}`}
            style={{ width: `${tabIndicator.width}px`, transform: `translateX(${tabIndicator.left}px)` }}
            aria-hidden="true"
          />
          <button
            className={`tab-button ${tab === "logs" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("logs")}
            ref={(node) => {
              tabButtonRefs.current[0] = node;
            }}
          >
            {t("console.tab.logs")}
          </button>
          <button
            className={`tab-button ${tab === "files" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("files")}
            ref={(node) => {
              tabButtonRefs.current[1] = node;
            }}
          >
            {t("console.tab.files")}
          </button>
          <button
            className={`tab-button ${tab === "settings" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("settings")}
            ref={(node) => {
              tabButtonRefs.current[2] = node;
            }}
          >
            {t("console.tab.settings")}
          </button>
        </div>

        {tab === "logs" && (
          <ConsoleLogsTab
            t={t}
            busy={busy}
            logLevelFilter={logLevelFilter}
            setLogLevelFilter={setLogLevelFilter}
            logKeyword={logKeyword}
            setLogKeyword={setLogKeyword}
            consoleCommand={consoleCommand}
            setConsoleCommand={setConsoleCommand}
            visibleLogs={visibleLogs}
            renderedLogs={renderedLogs}
            hasMoreLogs={hasMoreLogs}
            hiddenLogCount={hiddenLogCount}
            visibleRatio={visibleRatio}
            showJumpToBottom={showJumpToBottom}
            onLoadLogs={() => {
              void loadLogs();
            }}
            onCopyLogs={() => {
              void copyLogs();
            }}
            onExportLogs={() => {
              void exportLogs();
            }}
            onSendCommand={() => {
              void sendCommand();
            }}
            onHandleLogScroll={handleLogScroll}
            onJumpToBottom={() => {
              const node = logPreRef.current;
              if (!node) {
                return;
              }
              node.scrollTop = node.scrollHeight;
              shouldAutoScrollRef.current = true;
              setShowJumpToBottom(false);
            }}
            logPreRef={logPreRef}
          />
        )}

        {tab === "files" && (
          <ConsoleFilesTab
            t={t}
            busy={busy}
            fileBread={fileBread}
            entries={entries}
            selectedFile={selectedFile}
            editorContent={editorContent}
            setEditorContent={setEditorContent}
            onGoParent={() => {
              void loadDir(parentPath(cwd));
            }}
            onCreateFolder={() => {
              void createFolder();
            }}
            onOpenFile={(path) => {
              void openFile(path);
            }}
            onOpenDir={(path) => {
              void loadDir(path);
            }}
            onSaveFile={() => {
              void saveFile();
            }}
            formatSize={formatSize}
          />
        )}

        {tab === "settings" && (
          <ConsoleSettingsTab
            t={t}
            busy={busy}
            javaPath={javaPath}
            setJavaPath={setJavaPath}
            onSaveJavaPath={() => {
              void saveJavaPath();
            }}
          />
        )}

        {notice && <p className="instance-message">{notice}</p>}
        </section>
      </div>

      <JavaRuntimePromptModal
        open={javaPromptOpen}
        instanceName={instance.name}
        recommendedJavaMajor={recommendedJavaMajorFromMcVersion(instance.version)}
        installDirectory={javaInstallDirectory(instance.version)}
        reason={javaPromptReason || undefined}
        onConfirm={() => resolveJavaPrompt(true)}
        onCancel={() => resolveJavaPrompt(false)}
      />

      <DeleteInstancePromptModal
        open={deletePromptOpen}
        instanceName={instance.name}
        running={deletePromptRunning}
        onConfirm={() => resolveDeletePrompt(true)}
        onCancel={() => resolveDeletePrompt(false)}
      />
    </>
  );
}
