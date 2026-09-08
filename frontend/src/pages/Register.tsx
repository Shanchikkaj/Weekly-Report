import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';

export const Register: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'team_member' | 'manager'>('team_member');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);

    try {
      await register({ email, password, role });
      navigate('/reports', { replace: true });
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to create account. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-center items-center px-4 sm:px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-card bg-accent text-white font-bold text-base mb-3">
            WR
          </div>
          <h1 className="text-2xl font-semibold text-primary">Create your account</h1>
          <p className="text-sm text-muted mt-1">Get started with weekly progress tracking</p>
        </div>

        <div className="bg-surface border border-border rounded-card p-6 sm:p-8 shadow-sm">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-card">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-primary mb-1.5" htmlFor="email">
                Work Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@company.com"
                className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-primary mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Minimum 8 characters"
                className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-primary mb-1.5">
                Account Role
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('team_member')}
                  className={`p-3 text-left border rounded-card transition-colors ${
                    role === 'team_member'
                      ? 'border-accent bg-accent-subtle text-accent'
                      : 'border-border bg-surface text-muted hover:border-muted'
                  }`}
                >
                  <div className="text-sm font-medium text-primary">Team Member</div>
                  <div className="text-xs text-muted mt-0.5">Author & submit reports</div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('manager')}
                  className={`p-3 text-left border rounded-card transition-colors ${
                    role === 'manager'
                      ? 'border-accent bg-accent-subtle text-accent'
                      : 'border-border bg-surface text-muted hover:border-muted'
                  }`}
                >
                  <div className="text-sm font-medium text-primary">Manager</div>
                  <div className="text-xs text-muted mt-0.5">Review & approvals</div>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-3 py-2.5 px-4 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white text-sm font-medium rounded-card transition-colors flex items-center justify-center"
            >
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-center text-xs text-muted">
            Already have an account?{' '}
            <Link to="/login" className="text-accent hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
