import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PlusCircle, LogOut, User as UserIcon, LayoutDashboard, FileText, FolderKanban, Users, Sparkles } from 'lucide-react';
import { AiAssistantDrawer } from './AiAssistantDrawer';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAiOpen, setIsAiOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) return null;

  const isActive = (path: string) => location.pathname === path;
  const isManager = user.role === 'manager';

  return (
    <>
      <header className="sticky top-0 z-30 bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              to={isManager ? '/manager/dashboard' : '/reports'}
              className="flex items-center gap-2 text-primary font-semibold text-base hover:opacity-90"
            >
              <div className="w-8 h-8 rounded-card bg-accent text-white flex items-center justify-center font-bold text-sm">
                WR
              </div>
              <span>Weekly Report</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {isManager ? (
                <>
                  <Link
                    to="/manager/dashboard"
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-card transition-colors ${
                      isActive('/manager/dashboard')
                        ? 'bg-subsurface text-primary'
                        : 'text-muted hover:text-primary hover:bg-subsurface'
                    }`}
                  >
                    <LayoutDashboard className="w-4 h-4 text-accent" />
                    Dashboard
                  </Link>

                  <Link
                    to="/reports"
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-card transition-colors ${
                      isActive('/reports')
                        ? 'bg-subsurface text-primary'
                        : 'text-muted hover:text-primary hover:bg-subsurface'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-muted" />
                    Reports
                  </Link>

                  <Link
                    to="/manager/projects"
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-card transition-colors ${
                      isActive('/manager/projects')
                        ? 'bg-subsurface text-primary'
                        : 'text-muted hover:text-primary hover:bg-subsurface'
                    }`}
                  >
                    <FolderKanban className="w-4 h-4 text-muted" />
                    Projects
                  </Link>

                  <Link
                    to="/manager/users"
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-card transition-colors ${
                      isActive('/manager/users')
                        ? 'bg-subsurface text-primary'
                        : 'text-muted hover:text-primary hover:bg-subsurface'
                    }`}
                  >
                    <Users className="w-4 h-4 text-muted" />
                    Team
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/reports"
                    className={`px-3 py-1.5 text-sm font-medium rounded-card transition-colors ${
                      isActive('/reports')
                        ? 'bg-subsurface text-primary'
                        : 'text-muted hover:text-primary hover:bg-subsurface'
                    }`}
                  >
                    My Reports
                  </Link>

                  <Link
                    to="/reports/new"
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-card transition-colors ${
                      isActive('/reports/new')
                        ? 'bg-subsurface text-primary'
                        : 'text-muted hover:text-primary hover:bg-subsurface'
                    }`}
                  >
                    <PlusCircle className="w-4 h-4 text-accent" />
                    New Report
                  </Link>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {isManager && (
              <button
                onClick={() => setIsAiOpen(true)}
                title="Open AI Team Assistant"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-accent bg-accent/10 hover:bg-accent/15 border border-accent/20 rounded-card transition-colors shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="hidden sm:inline">AI Assistant</span>
              </button>
            )}

            <div className="flex items-center gap-2 text-sm pl-1">
              <div className="w-8 h-8 rounded-full bg-subsurface border border-border flex items-center justify-center text-muted">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-sm font-medium text-primary leading-tight">{user.email}</div>
                <div className="text-xs text-muted capitalize">{user.role.replace('_', ' ')}</div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="Sign Out"
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-muted hover:text-primary hover:bg-subsurface rounded-card transition-colors border border-border"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* AI Assistant Drawer for Manager */}
      {isManager && (
        <AiAssistantDrawer isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} />
      )}
    </>
  );
};

