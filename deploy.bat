@echo off
cd /d "d:\skanda\sample\KINETIQ\techsters-realtime-kanban"
git add -A
git commit -m "feat: ERP landing page, remove demo accounts, open registration"
git push origin main
echo --- pushing done, now deploying ---
npx vercel deploy --prod --yes
