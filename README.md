# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## MVP Check Commands

- Full build + rust check:

```bash
pnpm check:mvp
```

- Smoke checks before release:

```bash
pnpm smoke:mvp
```

## Java Runtime Storage

- Java runtime is shared by Java major version across instances.
- Default shared location:
	- `.../Amethyst-Server-Launcher/runtime/shared-java/java-8`
	- `.../Amethyst-Server-Launcher/runtime/shared-java/java-17`
	- `.../Amethyst-Server-Launcher/runtime/shared-java/java-21`
- Optional override with absolute path:

```bash
ASL_JAVA_RUNTIME_DIR=/absolute/path/to/java-cache
```
