import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AppShell, titleFor } from "@/components/layout/AppShell";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { PrefsProvider, usePrefs } from "@/contexts/PrefsContext";
import { RequestsProvider } from "@/contexts/RequestsContext";
import { ApiError } from "@/lib/api";
import Assistant from "@/pages/Assistant";
import Costs from "@/pages/Costs";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Provision from "@/pages/Provision";
import RequestTracker from "@/pages/RequestTracker";
import Requests from "@/pages/Requests";
import Resources from "@/pages/Resources";
import Settings from "@/pages/Settings";

// Retry policy from the spec (§2, Errors): AWS rate limits (429) are retried after a few
// seconds, at most twice; a dropped connection once. Everything else shows a retry button.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => {
        const status = error instanceof ApiError ? error.status : -1;
        if (status === 429) return count < 2;
        if (status === 0) return count < 1;
        return false;
      },
      retryDelay: (attempt, error) => (error instanceof ApiError && error.status === 429 ? 3000 * (attempt + 1) : 1000),
      refetchOnWindowFocus: false,
    },
  },
});

/** Signed-in area: per-user request tracker and chat, inside the app shell. */
function ProtectedLayout() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  return (
    <RequestsProvider key={user.email}>
      <ChatProvider key={user.email}>
        <AppShell title={titleFor(location.pathname)}>
          <Outlet />
        </AppShell>
      </ChatProvider>
    </RequestsProvider>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = usePrefs();
  return <Toaster theme={resolvedTheme} position="top-right" richColors closeButton />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PrefsProvider>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/provision" element={<Provision />} />
                <Route path="/requests" element={<Requests />} />
                <Route path="/requests/:requestId" element={<RequestTracker />} />
                <Route path="/resources" element={<Resources />} />
                <Route path="/costs" element={<Costs />} />
                <Route path="/assistant" element={<Assistant />} />
                <Route path="/settings" element={<Settings />} />
                {/* Earlier URLs */}
                <Route path="/dashboard" element={<Navigate to="/" replace />} />
                <Route path="/cloud" element={<Navigate to="/resources" replace />} />
                <Route path="/activity" element={<Navigate to="/requests" replace />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
          <ThemedToaster />
        </PrefsProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
