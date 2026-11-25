@echo off
cd /d "d:\skanda\sample\KINETIQ\techsters-realtime-kanban\backend"
npx prisma db execute --stdin << EOF
UPDATE "User" SET name = 'Alice' WHERE email = 'alice@techsters.dev' AND name = 'Alice (Admin)';
UPDATE "User" SET name = 'Bob'   WHERE email = 'bob@techsters.dev'   AND name = 'Bob (Member)';
UPDATE "User" SET name = 'Carol' WHERE email = 'carol@techsters.dev' AND name = 'Carol (Viewer)';
EOF
