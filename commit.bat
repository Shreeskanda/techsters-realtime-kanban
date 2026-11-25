@echo off
cd /d "d:\skanda\sample\KINETIQ\techsters-realtime-kanban"
git add -A
git commit -m "fix: vercel deployment tsx deps io singleton services config"
git push origin main
