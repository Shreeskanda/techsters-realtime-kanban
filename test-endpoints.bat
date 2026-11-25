@echo off
cd /d "d:\skanda\sample\KINETIQ\techsters-realtime-kanban"
echo --- Check email endpoint ---
npx vercel curl https://techsters-realtime-kanban.vercel.app/api/auth/check-email -- -s -X POST -H "Content-Type: application/json" -d "{\"email\":\"alice@techsters.dev\"}"
echo.
echo --- Frontend SPA check ---
npx vercel curl https://techsters-realtime-kanban.vercel.app/ -- -s -o nul -w "HTTP status: %%{http_code}"
echo.
