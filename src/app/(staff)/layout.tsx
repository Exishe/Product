import { ServiceWorkerRegister } from "@/lib/offline/sw-register";

// Staff screens are the installable app: they register the service worker
// that keeps the last screen for offline starts (ADR-048).
export default function StaffLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <ServiceWorkerRegister />
    </>
  );
}
