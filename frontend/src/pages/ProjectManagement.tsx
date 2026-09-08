import React, { useEffect, useState } from 'react';
import { projectsApi, usersApi } from '../api/client';
import {
  FolderKanban,
  Plus,
  Edit2,
  Check,
  X,
  Trash2,
  Users,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export const ProjectManagement: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New Project Form state
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // Member assignment state
  const [selectedProjectForMember, setSelectedProjectForMember] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [projRes, userRes] = await Promise.all([
        projectsApi.listProjects({ limit: 100, active: 'all' }),
        usersApi.listUsers({ limit: 100 }),
      ]);
      setProjects(projRes.data || []);
      setUsers(userRes.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      await projectsApi.createProject({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      setSuccess('Project created successfully.');
      setNewName('');
      setNewDesc('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create project.');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditDesc(p.description || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDesc('');
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    setError(null);
    try {
      await projectsApi.updateProject(id, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
      });
      setSuccess('Project updated successfully.');
      cancelEdit();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update project.');
    }
  };

  const handleToggleActive = async (p: any) => {
    const action = p.active ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} "${p.name}"? Existing reports remain safe.`)) return;

    setError(null);
    try {
      if (p.active) {
        await projectsApi.deleteProject(p.id); // Soft delete
        setSuccess(`Project "${p.name}" deactivated.`);
      } else {
        await projectsApi.updateProject(p.id, { active: true });
        setSuccess(`Project "${p.name}" reactivated.`);
      }
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update project status.');
    }
  };

  const handleAssignMember = async (projectId: string) => {
    if (!selectedUserId) return;
    setError(null);
    try {
      await projectsApi.assignMember(projectId, selectedUserId);
      setSuccess('Member assigned to project successfully.');
      setSelectedProjectForMember(null);
      setSelectedUserId('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to assign member.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-primary">Project Management</h1>
        <p className="text-sm text-muted mt-0.5">
          Create, update, and manage team projects and assigned members in list view
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

      {/* Create New Project Card (Inline Form, Not a Modal) */}
      <div className="p-6 bg-surface border border-border rounded-card shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold text-primary flex items-center gap-2">
            <Plus className="w-4 h-4 text-accent" />
            Add New Project
          </h2>
          <p className="text-xs text-muted">Create a new organizational category for weekly reports</p>
        </div>

        <form onSubmit={handleCreateProject} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-primary mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Infrastructure Modernization"
              className="w-full px-3.5 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-primary mb-1">Description</label>
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Brief summary of objectives"
              className="w-full px-3.5 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={creating}
              className="w-full sm:w-auto px-5 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-card transition-colors shadow-sm disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>

      {/* Projects List View */}
      <div className="p-6 bg-surface border border-border rounded-card shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h2 className="text-base font-semibold text-primary flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-accent" />
              Existing Projects
            </h2>
            <p className="text-xs text-muted">All active and archived initiatives</p>
          </div>
          <span className="text-xs text-muted font-medium">{projects.length} total projects</span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs text-muted">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="py-16 text-center text-xs text-muted">No projects found. Add one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-subsurface text-xs font-medium text-muted uppercase">
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Members</th>
                  <th className="py-2.5 px-3">Reports</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projects.map((p) => {
                  const isEditing = editingId === p.id;
                  const isAssigning = selectedProjectForMember === p.id;

                  return (
                    <tr key={p.id} className="hover:bg-canvas transition-colors">
                      <td className="py-3 px-3 font-medium text-primary">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="px-2 py-1 text-xs border border-border rounded w-full"
                          />
                        ) : (
                          <span>{p.name}</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-xs text-muted">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className="px-2 py-1 text-xs border border-border rounded w-full"
                          />
                        ) : (
                          <span>{p.description || '—'}</span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full font-medium border ${
                            p.active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {p.active ? 'Active' : 'Deactivated'}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-xs text-muted">
                        {p._count?.project_members || 0} members
                      </td>

                      <td className="py-3 px-3 text-xs text-muted">
                        {p._count?.reports || 0} reports
                      </td>

                      <td className="py-3 px-3 text-right space-x-2 whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(p.id)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                              title="Save changes"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 text-muted hover:bg-subsurface rounded"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(p)}
                              className="p-1 text-muted hover:text-primary hover:bg-subsurface rounded"
                              title="Edit project"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() =>
                                setSelectedProjectForMember(isAssigning ? null : p.id)
                              }
                              className="p-1 text-muted hover:text-accent hover:bg-subsurface rounded"
                              title="Assign team member"
                            >
                              <Users className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleToggleActive(p)}
                              className={`p-1 rounded ${
                                p.active
                                  ? 'text-muted hover:text-red-600 hover:bg-subsurface'
                                  : 'text-emerald-600 hover:bg-emerald-50'
                              }`}
                              title={p.active ? 'Deactivate (Soft Delete)' : 'Reactivate'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Member Assignment Drawer/Inline Box */}
        {selectedProjectForMember && (
          <div className="p-4 bg-accent-subtle border border-accent-border rounded-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
            <div className="text-xs text-accent font-medium">
              Assign a team member to selected project:
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="px-3 py-1.5 text-xs bg-surface border border-border rounded-input text-primary"
              >
                <option value="">Select User</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} ({u.role.replace('_', ' ')})
                  </option>
                ))}
              </select>

              <button
                onClick={() => handleAssignMember(selectedProjectForMember)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-card"
              >
                Assign
              </button>

              <button
                onClick={() => setSelectedProjectForMember(null)}
                className="p-1 text-muted hover:text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
