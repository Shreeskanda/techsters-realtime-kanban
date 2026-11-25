# Contributing to TechSters – Collaborative Kanban

**Hackathon:** AVISHKAR'26  
**Team:** TechSters (`AV26-00734FF57E`)

## Branch Ownership & Workflow

| Role | Branch | Primary Ownership |
| :--- | :--- | :--- |
| Backend Developer | `feature/backend` | Express APIs, JWT auth, RBAC middleware, validation |
| Frontend Developer | `feature/frontend` | React UI, Tailwind CSS, Kanban drag-and-drop, modals |
| Database Engineer | `feature/database` | PostgreSQL, Prisma schema, migrations, seed scripts |
| Integration & DevOps | `feature/integration` | Socket.IO sync, API integration, CSV export, Docker, tests |

## Rules
1. Never commit `.env` or secrets.
2. Each team member commits their own work to their respective feature branch.
3. Open Pull Requests from feature branches into `develop`.
4. `main` is kept stable for final demo and deployment.
5. Use meaningful commit messages (e.g., `feat(backend): add RBAC middleware`).
