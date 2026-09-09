# MdReader

> VSCode-style Markdown reader with AI chat, editor groups, and deep thinking support.

## Features

### Markdown Rendering
- Full [GFM](https://github.github.com/gfm/) support — tables, task lists, strikethrough, autolinks
- **LaTeX math** — inline `$...$` and block math rendered locally via KaTeX (dark-mode aware); block math uses `$$` on its own lines (standard remark-math format):

  ```
  $$
  E=mc^2
  $$
  ```
- **Inline HTML** — raw HTML in markdown renders as real elements (`<br>`, `<span style="...">`, `<div>`, `<b>`, …)
- **Literal `\n` escapes** — a two-character `\n` in the text renders as a line break; code blocks, inline code and math are left untouched (soft line breaks keep the CommonMark behavior)
- Syntax highlighting for code blocks via Prism.js
- Document outline with click-to-scroll heading navigation
- Raw source view with line numbers
- File browser with local folder navigation

### Editor Groups
- VSCode-style three-column layout (Activity Bar → Sidebar → Editor Groups)
- Vertical and horizontal split panes via `Allotment`
- Draggable tabs between groups
- Tab reordering within groups
- Drag-to-split: drop a tab at the pane edge to create a new split
- Context menu: Split Right / Split Down / Close

### File Loading
- File picker dialog (Electron native)
- Drag & drop `.md` files from the OS
- Open entire folders and browse in the file tree
- Paste markdown content directly (`Ctrl+V`)
- **Import text snippets as `.md` files** — the Import button in the Explorer toolbar opens an import dialog: paste/type text, pick a `.txt`/`.md` file, or drag one onto the panel; saved with light auto-tidying (first line becomes a heading, blank lines normalized, code fences untouched) into the open folder (auto-named, collision-safe) or via save dialog

### AI Chat
- Select text in a document → an inline question box appears at the end of the selection; type your question right there
- Keep selecting more text while the box is open to accumulate multiple quotes (shown as removable chips)
- **Ctrl+Enter** (or the arrow-up button) fills your question into the AI window's input — nothing is sent until you confirm there
- The full document is included as context; all quotes attach to your next message
- The New AI Chat button in the Activity Bar opens a NEW independent AI window split below the focused pane — each window has its own conversation and history
- Streaming AI replies (SSE via Electron IPC)
- Conversation tree with branching — backtrack to any point and create new branches
- Git-style tree diagram visualization
- Regenerate, edit, and resend messages
- Copy message content
- Deep thinking (reasoning) support — collapsible `reasoning_content` block
- Conversation management: save, load, rename, delete conversations (atomic writes, auto-repair on load)
- Settings panel for API endpoint, key, and model (encrypted via Electron `safeStorage`; the key never enters the renderer)
- Deep Think sends `chat_template_kwargs: {thinking: true}` (DeepSeek-compatible; ignored by providers that don't support it)

### UI/UX
- Dark mode with system-adaptive styling (semantic chrome tokens)
- Modern soft design — rounded corners, soft shadows, unified panel headers/toolbars/buttons
- lucide-react icon set throughout (no emoji)
- VS Code-style drag handles for pane resizing
- DeepSeek-style chat input with circular send/stop button
- Blue accent theme throughout

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron 33 |
| UI Framework | React 18 + TypeScript |
| Build Tool | Vite 6 |
| CSS | Tailwind CSS 3 |
| Markdown | react-markdown + remark-gfm + rehype-raw |
| Math | remark-math + rehype-katex + KaTeX |
| Syntax Highlight | react-syntax-highlighter + Prism.js |
| Split Panes | Allotment |
| AI API | OpenAI-compatible (`/v1/chat/completions`) |

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Install
```bash
git clone https://github.com/Test1-23/MdReader.git
cd MdReader
npm install
```

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

### App Icon
The app icon lives in `assets/` — `icon.svg` is the design source, `icon.png` (1024×1024, transparent) is what ships. To regenerate the PNG after editing the SVG:

```bash
npm run icon:generate
```

## Usage

### Opening Files
- Click **Explorer** in the Activity Bar → **Open Folder** to browse directories
- Click any `.md` file to open it in the editor
- Or drag & drop a `.md` file onto the editor area
- Or press `Ctrl+V` with markdown text in your clipboard

### Importing Text Snippets
1. Click the **Import** button in the Explorer toolbar → the import dialog opens
2. Paste/type the text, click **选择文件** to pick a `.txt`/`.md` file, or drag a file onto the sidebar panel
3. Click **转换为 .md** — the text is lightly tidied (first line → heading, blank lines normalized, code fences untouched) and saved
4. With a folder open, the file lands there with an auto-generated collision-safe name; otherwise a save dialog appears
5. The new file opens in the editor and appears in the file tree

### Editor Groups
- **Split**: Right-click a tab → **Split Right** or **Split Down**
- **Drag to split**: Drag a tab to the edge of a pane to create a new split
- **Move tabs**: Drag tabs between groups or within a group to reorder
- **Close**: Click the close button on a tab to close it; the same button on the group header closes the entire group
- **Outline**: Click **Outline** in the Activity Bar to see document headings

### AI Chat
1. Click **Settings** in the Activity Bar → configure your API endpoint, key, and model
2. Select text in any open markdown document → an **inline question box** appears at the end of the selection; select more text while it's open to accumulate quotes (chips shown in the box, each removable)
3. Type your question (**Enter** adds a new line) and press **Ctrl+Enter** or click the arrow-up button — the AI window opens (or focuses) at the far right with your question filled in and the quotes as chips
4. Review and press **Enter** or the **Send** button in the AI window — all quotes are attached to the message
5. **Esc** / click elsewhere / scroll dismisses the inline box and discards its text and quotes
6. Click the **New AI Chat** button in the Activity Bar to open an additional independent AI window below the focused pane
7. The AI receives the full document as context plus your quotes
8. Use **Deep Think** to enable reasoning mode (DeepSeek R1)
9. Click the **Conversations** view toggle to manage saved conversations
10. Use the **Tree View** toggle to navigate conversation branches

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open file |
| `Ctrl+W` | Close tab |
| `Ctrl+V` | Paste markdown content |
| `Enter` | Send message (in chat input) |
| `Shift+Enter` | New line (in chat input) |

## Project Structure

```
MdReader/
├── electron/             # Electron main process
│   ├── main.ts           # Window creation, IPC registration
│   ├── preload.ts        # contextBridge API
│   └── ipc/              # IPC handlers
├── src/                  # React renderer process
│   ├── components/       # UI components
│   ├── context/          # React Context (Layout + UI)
│   ├── hooks/
│   ├── services/         # Layout operations
│   ├── types/
│   └── utils/            # Layout tree, conversation tree, etc.
├── test/                 # Test markdown files
└── info/                 # Project documentation
```

## License

[MIT](LICENSE)
