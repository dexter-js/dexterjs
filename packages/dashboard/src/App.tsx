import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { TabNav } from "@/components/layout/TabNav";
import Overview from "@/pages/Overview";
import RoutesPage from "@/pages/Routes";
import Logs from "@/pages/Logs";
import Insights from "@/pages/Insights";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex min-h-screen flex-col bg-[#0a0b10] text-white font-mono">
          <Header />
          <TabNav />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/routes" element={<RoutesPage />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/insights" element={<Insights />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
