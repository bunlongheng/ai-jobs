import Toast from "./Toast";
import ConfirmModal from "./ConfirmModal";

// Mounts the shared UI overlays (toast + confirm modal) once for EVERY jobs route -
// board and detail alike - so reactions fire a toast and delete shows the uniform
// modal no matter which page you're on. (owner request 2026-08-05)
export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toast />
      <ConfirmModal />
    </>
  );
}
