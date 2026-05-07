#!/bin/bash
# 健康检查脚本：检查服务是否正常响应，不正常则自动恢复
LOG=/www/wwwroot/copy-trading/logs/healthcheck.log
MAX_LOG_SIZE=102400

# 限制日志大小
if [ -f "$LOG" ] && [ $(stat -c%s "$LOG" 2>/dev/null || echo 0) -gt $MAX_LOG_SIZE ]; then
  tail -200 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# 检查 PM2 进程是否在线
PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; apps=json.load(sys.stdin); app=[a for a in apps if a['name']=='copy-trading']; print(app[0]['pm2_env']['status'] if app else 'not_found')" 2>/dev/null)

if [ "$PM2_STATUS" != "online" ]; then
  echo "[$TIMESTAMP] WARN: PM2 status=$PM2_STATUS, restarting..." >> "$LOG"
  cd /www/wwwroot/copy-trading && pm2 delete copy-trading 2>/dev/null
  sleep 2
  pm2 start ecosystem.config.cjs >> "$LOG" 2>&1
  echo "[$TIMESTAMP] INFO: Service restarted" >> "$LOG"
  exit 0
fi

# 检查 HTTP 接口是否正常响应（401=密码错误但服务正常，200=正常）
HTTP_CODE=$(curl -sk -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:3001/api/trpc/auth.login \
  -X POST -H 'Content-Type: application/json' \
  -d '{"json":{"email":"health@check.com","password":"healthcheck"}}' 2>/dev/null)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
  echo "[$TIMESTAMP] OK: HTTP $HTTP_CODE" >> "$LOG"
else
  echo "[$TIMESTAMP] WARN: HTTP $HTTP_CODE (unexpected), restarting service..." >> "$LOG"
  cd /www/wwwroot/copy-trading && pm2 delete copy-trading 2>/dev/null
  sleep 2
  pm2 start ecosystem.config.cjs >> "$LOG" 2>&1
  echo "[$TIMESTAMP] INFO: Service restarted due to HTTP $HTTP_CODE" >> "$LOG"
fi
