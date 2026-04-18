import type { InstanceFileEntry } from "../../features/instanceService";
import type { TranslationKey } from "../../i18n";

interface ConsoleFilesTabProps {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  busy: boolean;
  fileBread: string;
  entries: InstanceFileEntry[];
  selectedFile: string | null;
  editorContent: string;
  setEditorContent: (value: string) => void;
  onGoParent: () => void;
  onCreateFolder: () => void;
  onOpenFile: (path: string) => void;
  onOpenDir: (path: string) => void;
  onSaveFile: () => void;
  formatSize: (size?: number) => string;
}

export function ConsoleFilesTab({
  t,
  busy,
  fileBread,
  entries,
  selectedFile,
  editorContent,
  setEditorContent,
  onGoParent,
  onCreateFolder,
  onOpenFile,
  onOpenDir,
  onSaveFile,
  formatSize,
}: ConsoleFilesTabProps) {
  return (
    <div className="instance-console-files-grid">
      <aside className="instance-console-files-list">
        <div className="instance-console-toolbar">
          <span>{t("console.files.currentDir", { dir: fileBread })}</span>
          <div>
            <button className="chip-button" type="button" onClick={onGoParent}>
              {t("console.files.up")}
            </button>
            <button className="chip-button" type="button" onClick={onCreateFolder} disabled={busy}>
              {t("console.files.newFolder")}
            </button>
          </div>
        </div>

        <div className="instance-console-file-entries">
          {entries.map((entry) => (
            <button
              key={entry.path}
              className="instance-console-file-entry"
              type="button"
              onClick={() => {
                if (entry.isDir) {
                  onOpenDir(entry.path);
                  return;
                }
                onOpenFile(entry.path);
              }}
            >
              <span>{entry.isDir ? `📁 ${entry.name}` : `📄 ${entry.name}`}</span>
              <span>{entry.isDir ? t("console.files.typeDir") : formatSize(entry.size)}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="instance-console-editor">
        <div className="instance-console-toolbar">
          <span>{selectedFile ?? t("console.files.none")}</span>
          <button className="chip-button" type="button" onClick={onSaveFile} disabled={!selectedFile || busy}>
            {t("console.files.save")}
          </button>
        </div>
        <textarea
          value={editorContent}
          onChange={(event) => setEditorContent(event.target.value)}
          placeholder={t("console.files.editorPlaceholder")}
        />
      </section>
    </div>
  );
}
