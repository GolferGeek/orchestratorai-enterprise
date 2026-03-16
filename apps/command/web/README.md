# Orchestrator AI Frontend (Ionic + Vue)

This directory contains the Ionic + Vue frontend application for the Orchestrator AI project.

## Prerequisites

- Node.js (LTS version recommended)
- npm (usually comes with Node.js)
- Ionic CLI (`npm install -g @ionic/cli`)
- Capacitor CLI (`npm install -g @capacitor/cli`)
- For iOS development: Xcode and Cocoapods (`sudo gem install cocoapods`)

## Environment Configuration

This project uses Vite for environment variables. Create a `.env` file in the `apps/web/` directory (this frontend project root) for environment-specific settings:

Example `.env` or `.env.development`:
```env
VITE_API_BASE_URL=http://localhost:8000
```

- `VITE_API_BASE_URL`: The base URL for the backend API.

## Development

1.  Navigate to the monorepo root.
2.  Run `npm run dev:web` to start the Vite development server for the frontend.
    (This typically runs `cd apps/web && npm run dev` after configuration scripts).

Alternatively, to run just the frontend directly:
1.  `cd apps/web`
2.  `npm install` (if you haven't already or dependencies changed)
3.  `npm run dev` (starts Vite dev server, usually on `http://localhost:5173`)

## Building for Production

### Web Deployment

1.  Navigate to `apps/web/`.
2.  Run `npm run build`.
    This will compile the Vue app and output static assets to the `apps/web/dist/` directory.
3.  Deploy the contents of the `dist/` directory to your web hosting provider.

### iOS Compilation & Deployment

1.  **Ensure Cocoapods is working:** If you encounter `pod install` errors during sync/build, ensure your Cocoapods and Ruby environment are correctly set up on your macOS machine.
2.  **Build Web Assets:**
    ```bash
    cd apps/web
    npm run build
    ```
3.  **Sync with Capacitor iOS Project:**
    ```bash
    npx cap sync ios
    ```
    This copies web assets to the native project and updates configurations.
4.  **Open in Xcode:**
    ```bash
    npx cap open ios
    ```
5.  **Build and Run from Xcode:**
    - Select your target device or simulator.
    - Configure code signing with your Apple Developer account.
    - Build and run the app.

## Testing

- Run unit tests: `npm run test:unit` (from within `apps/web/`)
- (E2E tests using Cypress are configured but might not have specific tests for this chat app yet: `npm run test:e2e`) 