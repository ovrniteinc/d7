import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./lib/auth";
import Sidebar from "./components/shell/Sidebar";
import Topbar from "./components/shell/Topbar";
import TaskDrawer from "./components/shell/TaskDrawer";
import SessionUsageSync from "./components/shell/SessionUsageSync";
import NotificationListener from "./components/shell/NotificationListener";
import Login from "./pages/auth/Login";
import ForcePasswordReset from "./pages/auth/ForcePasswordReset";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import Tasks from "./pages/Tasks";
import Calendar from "./pages/Calendar";
import Blackboard from "./pages/Blackboard";
import WorkTracker from "./pages/WorkTracker";
import Productivity from "./pages/Productivity";
import Reports from "./pages/Reports";
import UserManagement from "./pages/UserManagement";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Sessions from "./pages/Sessions";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function Loading() {
  return (
    <div className="obsidian-bg min-h-screen flex items-center justify-center">
      <div className="relative z-10 text-white/40 text-sm">Loading…</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="obsidian-bg h-screen w-full flex overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <Topbar path={pathname} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
      <TaskDrawer />
      <SessionUsageSync />
      <NotificationListener />
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) {
    return (
      <div className="obsidian-bg min-h-screen flex items-center justify-center">
        <div className="relative z-10 glass-strong p-8 max-w-md text-center space-y-4">
          <h2 className="text-lg font-semibold text-white mb-2">Account setup incomplete</h2>
          <p className="text-sm text-white/50">
            Your sign-in worked, but no workspace profile was found. Ask an admin to create your invite and Firebase Auth account, then sign in again.
          </p>
          <button className="btn btn-ghost" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    );
  }
  if (profile.must_reset_password) return <ForcePasswordReset />;
  if (profile.status === "inactive") {
    return (
      <div className="obsidian-bg min-h-screen flex items-center justify-center">
        <div className="relative z-10 glass-strong p-8 max-w-sm text-center">
          <h2 className="text-lg font-semibold text-white mb-2">Account inactive</h2>
          <p className="text-sm text-white/50">Your account has been deactivated. Contact an administrator.</p>
        </div>
      </div>
    );
  }
  return <Shell>{children}</Shell>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (user && profile && !profile.must_reset_password && profile.status === "active") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/projects" element={<Protected><Projects /></Protected>} />
            <Route path="/tasks" element={<Protected><Tasks /></Protected>} />
            <Route path="/calendar" element={<Protected><Calendar /></Protected>} />
            <Route path="/blackboard" element={<Protected><Blackboard /></Protected>} />
            <Route path="/tracker" element={<Protected><WorkTracker /></Protected>} />
            <Route path="/productivity" element={<Protected><Productivity /></Protected>} />
            <Route path="/reports" element={<Protected><AdminOnly><Reports /></AdminOnly></Protected>} />
            <Route path="/user-management" element={<Protected><AdminOnly><UserManagement /></AdminOnly></Protected>} />
            <Route path="/sessions" element={<Protected><AdminOnly><Sessions /></AdminOnly></Protected>} />
            <Route path="/settings" element={<Protected><AdminOnly><Settings /></AdminOnly></Protected>} />
            <Route path="/profile" element={<Protected><Profile /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: "rgba(22,22,26,0.9)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.9)",
              },
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
