@echo off
cd /d "d:\skanda\sample\KINETIQ\techsters-realtime-kanban"
git add -A
git commit -m "feat: Member & User Lobby plus Admin/Member/User create and login"
git push origin main
echo --- pushing done, now deploying ---
npx vercel deploy --prod --yes
