import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usersApi } from '../api/client';
import {
  Users,
  UserPlus,
  Shield,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Invite user form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'team_member' | 'manager'>('team_member');
  const [inviting, setInviting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await usersApi.listUsers({ limit: 100 });
      setUsers(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load user roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setInviting(true);
    setError(null);
    setSuccess(null);

    try {
      await usersApi.createUser({
        email: newEmail.trim(),
        password: newPassword.trim() || undefined,
        role: newRole,
      });
      setSuccess(`User ${newEmail} created successfully.`);
      setNewEmail('');
      setNewPassword('');
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create user.');
    } finally {
      setInviting(false);
    }
  };

  const handleToggleRole = async (user: any) => {
    const nextRole = user.role === 'manager' ? 'team_member' : 'manager';
    setError(null);
    setSuccess(null);

    try {
      await usersApi.updateRole(user.id, nextRole);
      setSuccess(`Role updated to ${nextRole.replace('_', ' ')} for ${user.email}.`);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to update user role.');
    }
  };

  const handleToggleStatus = async (user: any) => {
    const nextStatus = !user.active;
    setError(null);
    setSuccess(null);

    try {
      await usersApi.updateStatus(user.id, nextStatus);
      setSuccess(`User account ${nextStatus ? 'activated' : 'deactivated'}.`);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to update user status.');
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-primary">Team & User Management</h1>
        <p className="text-sm text-muted mt-0.5">
          Administer team members, assign organizational roles, and control account statuses
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-card flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-card flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Add User Card */}
      <div className="p-6 bg-surface border border-border rounded-card shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold text-primary flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-accent" />
            Add Team Member
          </h2>
          <p className="text-xs text-muted">Register a new account or manager directly by email</p>
        </div>

        <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-primary mb-1">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="w-full px-3.5 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-primary mb-1">Temporary Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Default: Welcome123!"
              className="w-full px-3.5 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-primary mb-1">Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as any)}
              className="w-full px-3.5 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
            >
              <option value="team_member">Team Member</option>
              <option value="manager">Manager</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              disabled={inviting}
              className="w-full px-5 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-card transition-colors shadow-sm disabled:opacity-60"
            >
              {inviting ? 'Adding...' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>

      {/* User Roster Table */}
      <div className="p-6 bg-surface border border-border rounded-card shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h2 className="text-base font-semibold text-primary flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" />
              Team Roster
            </h2>
            <p className="text-xs text-muted">All active registered accounts</p>
          </div>
          <span className="text-xs text-muted font-medium">{users.length} members</span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs text-muted">Loading team roster...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-subsurface text-xs font-medium text-muted uppercase">
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Reports</th>
                  <th className="py-2.5 px-3">Joined</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-canvas transition-colors">
                    <td className="py-3 px-3 font-medium text-primary">
                      <Link
                        to={`/manager/members/${u.id}`}
                        className="hover:text-accent flex items-center gap-1.5"
                      >
                        <span>{u.email}</span>
                        <ExternalLink className="w-3 h-3 text-muted" />
                      </Link>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs rounded-full font-medium border ${
                          u.role === 'manager'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {u.role === 'manager' && <Shield className="w-3 h-3 text-accent" />}
                        <span className="capitalize">{u.role.replace('_', ' ')}</span>
                      </span>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full font-medium border ${
                          u.active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {u.active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-xs text-muted">
                      {u._count?.reports || 0} reports
                    </td>

                    <td className="py-3 px-3 text-xs text-muted whitespace-nowrap">
                      {formatDate(u.created_at)}
                    </td>

                    <td className="py-3 px-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleRole(u)}
                        className="text-xs font-medium text-muted hover:text-primary px-2 py-1 rounded hover:bg-subsurface transition-colors"
                        title="Change role"
                      >
                        Switch to {u.role === 'manager' ? 'Member' : 'Manager'}
                      </button>

                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                          u.active
                            ? 'text-muted hover:text-red-600 hover:bg-subsurface'
                            : 'text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title={u.active ? 'Deactivate account' : 'Activate account'}
                      >
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
