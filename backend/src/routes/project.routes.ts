import { Router } from 'express';
import { projectController } from '../controllers/project.controller';
import { requireRole } from '../middleware/auth.middleware';

const router = Router();

// List all projects (paginated, all authenticated users)
router.get('/', projectController.listProjects);

// Get single project by ID (all authenticated users)
router.get('/:id', projectController.getProjectById);

// Create a new project (Manager only)
router.post('/', requireRole('manager'), projectController.createProject);

// Update a project (Manager only)
router.put('/:id', requireRole('manager'), projectController.updateProject);

// Soft delete a project (Manager only)
router.delete('/:id', requireRole('manager'), projectController.deleteProject);

// Assign a team member to a project (Manager only)
router.post('/:id/members', requireRole('manager'), projectController.assignMember);

export default router;
