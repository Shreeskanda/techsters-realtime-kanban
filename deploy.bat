@echo off
cd /d "d:\skanda\sample\KINETIQ\techsters-realtime-kanban"
git add -A
git commit -m "fix: prevent localhost API URL in production bundle"
git push origin main
echo --- pushing done, now deploying ---
npx vercel deploy --prod --yes
