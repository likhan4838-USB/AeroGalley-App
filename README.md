# AeroGalley App

The AeroGalley Catering mobile prototype, running on its own.

Until now this app lived inside the `test-project` web repository and could only
be reached from the desk shell's user menu → **AeroGalley Catering App**, which
opened it in a modal. This repository runs the very same app as its own product:
`npm run dev` opens the phone, and nothing else.

## Run it

```bash
npm install
npm run dev
```

The browser opens on <http://localhost:5174/> (port 5174, not the web app's
8080, so both can run side by side). The app boots at the splash screen, moves
to sign-in — any credentials are accepted, exactly as in the prototype — and
lands on the home dashboard.

| Script            | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Dev server with HMR, opens the browser         |
| `npm run build`   | Production build into `dist/`                  |
| `npm run preview` | Serve the built `dist/` locally                |
| `npm run lint`    | ESLint over `src`                              |

## What is in here

The app is unchanged — same screens, same navigation stack, same data, same
theme tokens. What came across is the mobile app plus exactly the modules it
imports, at their original paths, so every import resolves the way it always
did:

```
src/mobile/            the app: MobileApp, MobileLayout, BottomNav, 28 screens,
                       theme tokens, nav config, mock data
src/lib/               the shared stores and data the screens read and write
                       (workflow-store, sample-data, galley-*, stock-*, …)
src/routes/            six web pages the screens import seed data and helpers
                       from (delay-management, dispatch, dispatch-monitoring,
                       purchase-return, config-aircraft, transfer-request)
src/components/        UI primitives those shared modules pull in
src/stores/themeStore  the colour presets the phone's Theme Center reuses
src/main.jsx           standalone entry — see below
```

`src/main.jsx` is the only genuinely new file. It reproduces the context the
desk shell used to wrap around the app and nothing more: `StrictMode`, a router
(shared modules import `react-router`), `WorkflowProvider` (the live
production / QC / stock state behind `useWorkflow()`), and the sonner
`<Toaster>` with the shell's own settings.

The single edit to an existing file is in `src/mobile/MobileLayout.jsx`: the
close button, backdrop tap and Escape key stand down when no `onClose` is
passed, because standalone there is nothing to close back to. The phone frame
itself is untouched.

## Relationship to the web app

The prototype still ships inside `test-project` as well — this repository is a
copy, not a cut. The two are independent from here on: edits made here do not
reach the web app, and vice versa.
