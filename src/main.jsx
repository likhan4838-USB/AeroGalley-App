import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { WorkflowProvider } from '@/lib/workflow-store';
import { Toaster } from '@/components/ui/sonner';
import { MobileApp } from '@/mobile/MobileApp';

import './index.css';

/*
 * Standalone entry for the AeroGalley App.
 *
 * In the web product this same <MobileApp /> is mounted by the desk shell
 * (CateringShell → AppLayout) when you open "AeroGalley Catering App". Here it
 * is the whole page, so this file reproduces exactly the context the shell used
 * to provide around it — nothing more, nothing less:
 *
 *   StrictMode        · same as the web entry, so effects behave identically
 *   BrowserRouter     · shared modules pulled in by the screens import
 *                       react-router; the router keeps those imports safe
 *   WorkflowProvider  · the live production/QC/stock state the screens read
 *                       and write through useWorkflow()
 *   Toaster           · sonner surface for toast.success / toast.error, with
 *                       the shell's own settings (richColors, top-right)
 *
 * No screen, store or flow is modified — MobileApp still owns its own splash →
 * login → home navigation stack, exactly as it does inside the web app. The
 * only difference is that no `onClose` is passed, because there is nothing to
 * close back to; MobileLayout hides its close affordances when it is absent.
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <WorkflowProvider>
        <MobileApp />
        <Toaster richColors position="top-right" />
      </WorkflowProvider>
    </BrowserRouter>
  </StrictMode>
);
