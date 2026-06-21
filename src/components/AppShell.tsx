import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";

export function AppShell() {
  return (
    <div className="h-screen bg-background flex overflow-hidden p-4 gap-4">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-0">
        <Outlet />
      </div>
    </div>
  );
}
