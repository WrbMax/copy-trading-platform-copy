import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LangProvider } from "./contexts/LangContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import ExchangeApi from "./pages/ExchangeApi";
import Strategy from "./pages/Strategy";
import Orders from "./pages/Orders";
import Earnings from "./pages/Earnings";
import Team from "./pages/Team";
import Funds from "./pages/Funds";
import Points from "./pages/Points";
import Invite from "./pages/Invite";
// Admin
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminSignalSources from "./pages/admin/AdminSignalSources";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminFunds from "./pages/admin/AdminFunds";
import AdminPoints from "./pages/admin/AdminPoints";
import AdminRevenueShare from "./pages/admin/AdminRevenueShare";
import Landing from "./pages/Landing";

function AppRouter() {
  return (
    <Switch>
      {/* Landing */}
      <Route path="/landing" component={Landing} />
      {/* Auth */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      {/* User */}
      <Route path="/" component={Dashboard} />
      <Route path="/exchange-api" component={ExchangeApi} />
      <Route path="/strategy" component={Strategy} />
      <Route path="/orders" component={Orders} />
      <Route path="/earnings" component={Earnings} />
      <Route path="/team" component={Team} />
      <Route path="/funds" component={Funds} />
      <Route path="/points" component={Points} />
      <Route path="/invite" component={Invite} />
      {/* Admin */}
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/signals" component={AdminSignalSources} />
      <Route path="/admin/orders" component={AdminOrders} />
      <Route path="/admin/funds" component={AdminFunds} />
      <Route path="/admin/points" component={AdminPoints} />
      <Route path="/admin/revenue-share" component={AdminRevenueShare} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Detect base path from the current URL (supports both / and /copy/ deployments)
const BASE_PATH = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <LangProvider>
          <TooltipProvider>
            <Toaster />
            <Router base={BASE_PATH}>
              <AppRouter />
            </Router>
          </TooltipProvider>
        </LangProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
