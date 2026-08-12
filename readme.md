# MdReader

> VSCode-style Markdown reader with AI chat, editor groups, and deep thinking support.

## Features

### Markdown Rendering
- Full [GFM](https://github.github.com/gfm/) support — tables, task lists, strikethrough, autolinks
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

### AI Chat
- Select text in a document to open the AI chat window
- Selected text is sent as quoted context; the full document is included as context
- Streaming AI replies (SSE via Electron IPC)
- Conversation tree with branching — backtrack to any point and create new branches
- Git-style tree diagram visualization
- Regenerate, edit, and resend messages
- Copy message content
- Deep thinking (reasoning) support — collapsible `reasoning_content` block
- Conversation management: save, load, rename, delete conversations (atomic writes, auto-repair on load)
- Settings panel for API endpoint, key, and model (encrypted via Electron `safeStorage`; the key never enters the renderer)
- 🧠 Deep Think sends `chat_template_kwargs: {thinking: true}` (DeepSeek-compatible; ignored by providers that don't support it)

### UI/UX
- Dark mode with system-adaptive styling
- VS Code-style drag handles for pane resizing
- DeepSeek-style chat input with circular send/stop button
- Blue button theme throughout

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron 33 |
| UI Framework | React 18 + TypeScript |
| Build Tool | Vite 6 |
| CSS | Tailwind CSS 3 |
| Markdown | react-markdown + remark-gfm |
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

## Usage

### Opening Files
- Click **📁 Explorer** in the Activity Bar → **Open Folder** to browse directories
- Click any `.md` file to open it in the editor
- Or drag & drop a `.md` file onto the editor area
- Or press `Ctrl+V` with markdown text in your clipboard

### Editor Groups
- **Split**: Right-click a tab → **Split Right** or **Split Down**
- **Drag to split**: Drag a tab to the edge of a pane to create a new split
- **Move tabs**: Drag tabs between groups or within a group to reorder
- **Close**: Click × on a tab to close it; click × on the group header to close the entire group
- **Outline**: Click **📑 Outline** in the Activity Bar to see document headings

### AI Chat
1. Click **⚙️ Settings** in the Activity Bar → configure your API endpoint, key, and model
2. Select text in any open markdown document → the AI Chat window opens at the far right
3. Type your question and press **Enter** or click **↑ Send**
4. The AI receives the full document as context plus your selected text
5. Use **🧠 Deep Think** to enable reasoning mode (DeepSeek R1)
6. Click **🗂 Conversations** to manage saved conversations
7. Use **🌳 Tree View** to navigate conversation branches

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
