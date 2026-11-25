@echo off
cd /d "d:\skanda\sample\KINETIQ\techsters-realtime-kanban"
git add -A
git commit -m "feat: homepage landing page with login modal, clean user names"
git push origin main
echo --- pushing done, now deploying ---
npx vercel deploy --prod --yes
