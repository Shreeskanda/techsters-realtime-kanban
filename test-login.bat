@echo off
cd /d "d:\skanda\sample\KINETIQ\techsters-realtime-kanban"
npx vercel curl https://techsters-realtime-kanban.vercel.app/api/auth/login -- -s -X POST -H "Content-Type: application/json" -d "{\"email\":\"alice@techsters.dev\",\"password\":\"password123\"}"
