import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ScrollToAnchor from './components/ScrollToAnchor';

const EditorPage = lazy(() => import('./pages/EditorPage'));
const CheckoutReturnPage = lazy(() => import('./pages/CheckoutReturnPage'));

function LoadingScreen(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div
        aria-hidden="true"
        className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900"
      />
    </div>
  );
}

function App(): JSX.Element {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToAnchor />
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/checkout-return" element={<CheckoutReturnPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/editor" element={<EditorPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
