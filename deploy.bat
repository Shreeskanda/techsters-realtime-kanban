@echo off
cd /d "d:\skanda\sample\KINETIQ\techsters-realtime-kanban"
git add -A
git commit -m "feat: open project creation, role selection on register, remove fake data"
git push origin main
echo --- pushing done, now deploying ---
npx vercel deploy --prod --yes
