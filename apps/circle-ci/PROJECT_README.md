# Remix E2E Test Runner - React UI

A modern, clean React-based UI for managing and running Remix E2E tests locally or on CircleCI.

## 🎨 Features

- **Modern React + TypeScript**: Clean, maintainable component-based architecture
- **Dark Mode**: Built-in dark mode support with persistent preferences
- **Test Management**: Filter, favorite, and run tests with ease
- **CI Integration**: Monitor CircleCI pipelines, workflows, and jobs in real-time
- **Split/Inline Layouts**: Choose your preferred viewing mode
- **Log Panel**: Collapsible, resizable log viewer for test output
- **Artifacts**: View and download test artifacts (screenshots, videos)
- **Responsive**: Works great on different screen sizes

## 🏗️ Architecture

### Frontend (React + Vite)
- **Components**: Modular, reusable UI components
  - `TestTable`: Display and manage test lists
  - `ControlPanel`: Filters, settings, and actions
  - `LogPanel`: Real-time log output viewer
  - `CIPipelineDetails`: CI status and workflow management
- **Hooks**: Custom React hooks for state management
  - `useSettings`: Persists user preferences to localStorage
  - `useFavorites`: Manage favorite tests
  - `useCIStatus`: Poll CircleCI API for pipeline status
- **API Client**: Clean API abstraction layer

### Backend (Express)
Located in `../web-server.js`
- Serves the React build
- Provides REST API for test execution
- Proxies CircleCI API calls

## 🚀 Development

### Install dependencies
\`\`\`bash
npm install
\`\`\`

### Run development server
\`\`\`bash
npm run dev
\`\`\`

This starts Vite dev server on port 5179 with HMR (Hot Module Reloading).
API requests are proxied to the backend server running on port 5178.

### Build for production
\`\`\`bash
npm run build
\`\`\`

Outputs to `dist/` directory.

### Preview production build
\`\`\`bash
npm run preview
\`\`\`

## 📦 Production Usage

1. Build the React app:
   \`\`\`bash
   cd web-ui
   npm run build
   \`\`\`

2. Start the web server (from parent directory):
   \`\`\`bash
   node web-server.js
   \`\`\`

3. Open http://127.0.0.1:5178

## 🔧 Configuration

The app uses environment variables for CircleCI integration:
- `CIRCLECI_TOKEN` or `CIRCLE_TOKEN`: Your CircleCI API token
- `SELECT_TEST_PORT`: Server port (default: 5178)

Store your token in `.env.local` (in the repo root) or set it via the UI.

## 📝 Notes

- All user preferences (filters, favorites, layout, dark mode) are persisted to browser localStorage
- CI polling happens every 5 seconds when a remote test is running
- The log panel is resizable and collapsible for flexible workspace management

## 🎯 Migration from Old UI

The old monolithic `../web/index.html` (700+ lines of HTML/JS/CSS) has been replaced with this modern React architecture:

**Before**: 
- Single 700+ line HTML file
- Inline CSS and vanilla JS
- Manual DOM manipulation
- Hard to maintain and extend

**After**:
- ~15 modular TypeScript/React files
- Proper separation of concerns
- Type safety with TypeScript
- Easy to test and extend
- Modern development workflow with HMR

## 🛠️ Future Improvements

- Add unit tests (Jest + React Testing Library)
- Add integration tests
- Implement real-time WebSocket updates instead of polling
- Add test history and analytics
- Implement test grouping and bulk actions
- Add custom test configurations
