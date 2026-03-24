# 策略跟单平台 (Copy Trading Platform)

> 一套面向加密货币合约交易的多交易所自动跟单系统，支持多级推荐分成、BSC 链充值、积分体系。

---

## 目录

1. [系统概述](#系统概述)
2. [技术栈](#技术栈)
3. [项目结构](#项目结构)
4. [核心模块说明](#核心模块说明)
5. [数据库表结构](#数据库表结构)
6. [跟单引擎工作原理](#跟单引擎工作原理)
7. [收益分成逻辑](#收益分成逻辑)
8. [充值与资金流转](#充值与资金流转)
9. [API 接口总览](#api-接口总览)
10. [前端页面说明](#前端页面说明)
11. [生产部署说明](#生产部署说明)
12. [已知问题与待办](#已知问题与待办)

---

## 系统概述

本平台允许用户绑定自己的交易所 API，订阅平台提供的信号源策略，由系统自动在用户账户上执行与信号源相同方向的合约订单（跟单）。平台从用户盈利中按比例扣除分成，并通过多级推荐链将分成分配给各级推荐人。

**核心业务流程：**

```
信号源账户（OKX）持仓变化
        ↓ WebSocket 实时推送
   跟单引擎检测到变化
        ↓
   查询所有订阅该信号源的用户
        ↓
   按用户配置的倍数，在用户的交易所账户下单
        ↓
   平仓时查询交易所成交详情（盈亏）
        ↓
   自动触发收益分成（差额多级分成）
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| UI 组件库 | shadcn/ui + Tailwind CSS 4 |
| 前后端通信 | tRPC 11（类型安全 RPC，无需手写 REST） |
| 后端框架 | Express 4 + Node.js |
| 数据库 | MySQL / TiDB（通过 Drizzle ORM） |
| 实时通信 | WebSocket（OKX 私有频道） |
| 链上操作 | ethers.js（BSC 链 HD 钱包） |
| 身份认证 | Manus OAuth + 邮箱验证码 |
| 加密存储 | AES-256-GCM（API Key 加密） |
| 测试框架 | Vitest |

---

## 项目结构

```
copy-trading-platform/
├── client/                     # 前端 React 应用
│   ├── src/
│   │   ├── pages/              # 页面组件
│   │   │   ├── Home.tsx        # 首页（账户总览）
│   │   │   ├── Strategy.tsx    # 策略中心（订阅/取消订阅）
│   │   │   ├── Orders.tsx      # 订单记录
│   │   │   ├── Earnings.tsx    # 我的收益（分成明细）
│   │   │   ├── Team.tsx        # 团队收益（推荐链管理）
│   │   │   ├── Funds.tsx       # 充值提现
│   │   │   ├── Points.tsx      # 积分中心
│   │   │   ├── ExchangeApi.tsx # API 绑定
│   │   │   ├── Invite.tsx      # 邀请好友
│   │   │   └── admin/          # 后台管理页面
│   │   │       ├── AdminDashboard.tsx    # 管理总览
│   │   │       ├── AdminUsers.tsx        # 用户管理（含分成比例设置）
│   │   │       ├── AdminOrders.tsx       # 全平台订单监控
│   │   │       ├── AdminFunds.tsx        # 充提审核
│   │   │       ├── AdminSignalSources.tsx # 信号源管理
│   │   │       ├── AdminRevenueShare.tsx  # 分成记录
│   │   │       └── AdminPoints.tsx       # 积分管理
│   │   ├── components/         # 公共组件（DashboardLayout 等）
│   │   ├── contexts/           # React Context
│   │   └── lib/trpc.ts         # tRPC 客户端绑定
│
├── server/                     # 后端 Node.js 服务
│   ├── copy-engine.ts          # 【核心】跟单引擎
│   ├── revenue-share.ts        # 【核心】收益分成计算
│   ├── bsc-wallet.ts           # BSC 链 HD 钱包 + 充值扫描
│   ├── db.ts                   # 数据库查询函数
│   ├── crypto.ts               # AES 加密/解密
│   ├── email.ts                # 邮件发送（验证码）
│   ├── storage.ts              # S3 文件存储
│   ├── binance-client.ts       # Binance 合约 API
│   ├── okx-client.ts           # OKX 合约 API
│   ├── bybit-client.ts         # Bybit 合约 API
│   ├── bitget-client.ts        # Bitget 合约 API
│   ├── gate-client.ts          # Gate.io 合约 API
│   └── routers/                # tRPC 路由（API 接口）
│       ├── auth.ts             # 登录/注册/登出
│       ├── strategy.ts         # 策略/信号源/订单
│       ├── exchange.ts         # 交易所 API 绑定
│       ├── funds.ts            # 充值/提现/余额
│       ├── points.ts           # 积分操作
│       └── user.ts             # 用户管理/分成比例设置
│
├── drizzle/
│   └── schema.ts               # 数据库表定义（单一数据源）
│
└── shared/                     # 前后端共享常量
```

---

## 核心模块说明

### 1. 跟单引擎（`server/copy-engine.ts`）

跟单引擎是整个系统的核心，负责实时监听信号源持仓变化并自动下单。

**工作流程：**

1. **启动时**：从数据库读取所有 `isActive=true` 的信号源，为每个信号源建立 OKX WebSocket 私有频道连接
2. **初始同步**：连接成功后先快照当前持仓状态（baseline），不执行任何交易，防止重启时重复下单
3. **持仓变化检测**：每次收到 WebSocket 推送时，对比当前持仓与 baseline，检测以下变化类型：
   - `open_long` / `open_short`：新开多/空仓
   - `close_long` / `close_short`：完全平多/空仓
   - `add_long` / `add_short`：加仓
   - `reduce_long` / `reduce_short`：减仓
4. **执行跟单**：查询所有订阅该信号源且启用的用户策略，并发执行跟单下单
5. **平仓后处理**：平仓成功后等待 2 秒，查询交易所订单详情获取成交均价和已实现盈亏，更新订单记录并触发收益分成
6. **余额检查**：开仓前检查用户平台余额，余额 ≤ 0 时自动禁用该用户所有策略

**数量计算逻辑：**

信号源使用 OKX 合约（以张数计量），各交易所的数量单位不同：

| 交易所 | 数量单位 | 转换方式 |
|--------|----------|----------|
| OKX | 张数（contracts） | 直接使用，乘以用户倍数 |
| Binance | 基础资产数量（如 ETH） | `张数 × ctVal（合约面值）` |
| Bybit | USDT 价值 | `张数 × ctVal × 当前价格` |
| Bitget | 张数 | 直接使用 |
| Gate.io | 张数 | 直接使用 |

**Binance 大整数精度问题（已修复）：**

Binance 返回的 `orderId` 是超过 JavaScript 安全整数范围（2^53）的大整数。标准 `JSON.parse` 会丢失精度。修复方案：使用 `res.text()` 获取原始响应，用正则将 `orderId` 字段的大整数转为字符串后再解析。

### 2. 收益分成（`server/revenue-share.ts`）

采用**差额多级分成**模型，确保每一级推荐人只赚取差额部分，总分成不超过交易者被扣比例。

**计算示例：**

```
推荐链：A（管理员，ratio=10%）→ B（推荐人，ratio=10%）→ C（交易者，ratio=30%）
C 盈利 100 USDT

C 被扣：100 × 30% = 30 USDT
B 获得：100 × (30% - 10%) = 20 USDT  ← C的比例减去B自己的比例
A 获得：100 × (10% - 0%)  = 10 USDT  ← B的比例减去A自己的比例（或0）
```

**规则约束：**
- 分成比例上限：**70%**（硬编码，不可配置）
- 给下级设置的比例不能低于自己的比例
- 只有盈利订单才触发分成（`netPnl > 0`）
- 如果交易者没有推荐人，分成归平台（管理员账户）

### 3. BSC 充值（`server/bsc-wallet.ts`）

使用 HD 钱包（BIP-44）为每个用户派生独立的 BSC 充值地址，支持 USDT（BEP-20）充值。

**充值检测双重机制：**
- **BSCScan API**：通过交易哈希检测转账记录（精确，但依赖第三方 API）
- **RPC 余额快照**：直接查询链上余额变化（去中心化，作为备选）

每 3 分钟自动扫描一次，检测到充值后自动入账用户余额并记录流水。

### 4. API Key 加密（`server/crypto.ts`）

用户的交易所 API Key、Secret、Passphrase 均使用 **AES-256-GCM** 对称加密存储，密钥来自环境变量，数据库中只存储密文。

---

## 数据库表结构

| 表名 | 说明 |
|------|------|
| `users` | 用户基本信息，含余额、积分、分成比例、推荐关系 |
| `exchange_apis` | 用户绑定的交易所 API（加密存储） |
| `signal_sources` | 信号源（策略），含 OKX API 凭证 |
| `user_strategies` | 用户订阅的策略，含倍数和启用状态 |
| `signal_logs` | 每次信号触发的记录，含执行统计 |
| `copy_orders` | 每笔跟单订单，含开平仓价、盈亏、分成扣除 |
| `revenue_share_records` | 每笔分成的明细（谁分给谁、多少） |
| `deposit_addresses` | 用户的 BSC 充值地址（HD 钱包派生） |
| `deposits` | 充值记录（待审核/已批准/已拒绝） |
| `withdrawals` | 提现记录（含审核流程） |
| `fund_transactions` | 资金流水账本（充值/提现/分成收入/分成支出） |
| `points_transactions` | 积分流水（兑换/转账/管理员操作） |
| `system_config` | 系统配置键值对 |
| `email_verification_codes` | 邮箱验证码 |

---

## 跟单引擎工作原理

```
[OKX WebSocket 私有频道]
        |
        | positions 频道推送
        ↓
[detectChanges()] ← 对比 baseline 快照
        |
        ├── 无变化 → 忽略
        |
        └── 有变化 → [executeSignal()]
                          |
                          ├── 创建 signal_log 记录
                          |
                          └── 并发执行 [executeForUser()] × N 个用户
                                    |
                                    ├── 检查用户余额（为0则暂停策略）
                                    ├── 获取交易所 API 凭证（解密）
                                    ├── 计算下单数量（考虑倍数和交易所单位）
                                    ├── 调用对应交易所 API 下单
                                    ├── 记录 copy_order
                                    |
                                    └── 如果是平仓操作：
                                              |
                                              ├── 等待 2 秒（交易所结算）
                                              ├── 查询订单详情（成交价、盈亏）
                                              ├── 更新 copy_order 为 closed 状态
                                              └── 触发 processRevenueShare()
```

---

## 收益分成逻辑

```
用户 C 平仓盈利
        ↓
processRevenueShare(copyOrderId, traderId, netPnl)
        ↓
查询 C 的 revenueShareRatio（如 30%）
        ↓
totalDeducted = netPnl × 30%
        ↓
getUserReferralChain(C) → [B(10%), A(10%)]
        ↓
差额计算循环：
  childRatio = 30%（C 的比例）
  B: diff = 30% - 10% = 20%，B 获得 netPnl × 20%
  childRatio = 10%（B 的比例）
  A: diff = 10% - 0%  = 10%，A 获得 netPnl × 10%
        ↓
从 C 的余额扣除 totalDeducted
向 B、A 各自余额增加对应金额
记录 fund_transactions 流水
记录 revenue_share_records 明细
更新 copy_order.revenueShareDeducted
```

---

## 充值与资金流转

**充值流程：**
1. 用户在"充值提现"页面获取专属 BSC 地址（首次使用时从 HD 钱包派生）
2. 用户向该地址转入 USDT（BEP-20）
3. 系统每 3 分钟自动扫描，检测到转账后自动入账
4. 也支持用户手动提交充值凭证（交易哈希），由管理员审核

**提现流程：**
1. 用户填写提现地址和金额
2. 系统扣除余额并创建提现申请
3. 管理员在后台审核，批准后手动打款并填写交易哈希

**资金流水类型（`fund_transactions.type`）：**

| 类型 | 说明 |
|------|------|
| `deposit` | 充值入账 |
| `withdrawal` | 提现出账 |
| `revenue_share_in` | 收到推荐分成 |
| `revenue_share_out` | 被扣除分成 |
| `admin_adjust` | 管理员手动调整 |

---

## API 接口总览

所有接口通过 tRPC 暴露，前端使用 `trpc.*.useQuery()` / `trpc.*.useMutation()` 调用。

### auth 路由
| 接口 | 类型 | 说明 |
|------|------|------|
| `auth.me` | query | 获取当前登录用户信息 |
| `auth.login` | mutation | 邮箱+验证码登录 |
| `auth.register` | mutation | 注册新账户 |
| `auth.sendCode` | mutation | 发送邮箱验证码 |
| `auth.logout` | mutation | 登出 |

### strategy 路由
| 接口 | 类型 | 说明 |
|------|------|------|
| `strategy.list` | query | 获取所有信号源列表（公开） |
| `strategy.myStrategies` | query | 获取我订阅的策略 |
| `strategy.subscribe` | mutation | 订阅策略 |
| `strategy.unsubscribe` | mutation | 取消订阅 |
| `strategy.updateMultiplier` | mutation | 修改跟单倍数 |
| `strategy.orders` | query | 查询我的订单记录 |
| `strategy.adminOrders` | query | 管理员查询所有订单 |
| `strategy.adminSignalSources` | query | 管理员查询信号源 |
| `strategy.createSignalSource` | mutation | 管理员创建信号源 |
| `strategy.updateSignalSource` | mutation | 管理员更新信号源 |
| `strategy.simulateClose` | mutation | 管理员手动触发平仓分成 |

### exchange 路由
| 接口 | 类型 | 说明 |
|------|------|------|
| `exchange.list` | query | 获取我绑定的 API |
| `exchange.add` | mutation | 添加交易所 API |
| `exchange.delete` | mutation | 删除 API |
| `exchange.test` | mutation | 测试 API 连通性 |

### funds 路由
| 接口 | 类型 | 说明 |
|------|------|------|
| `funds.depositAddress` | query | 获取充值地址 |
| `funds.submitDeposit` | mutation | 提交充值凭证 |
| `funds.withdraw` | mutation | 申请提现 |
| `funds.transactions` | query | 查询资金流水 |
| `funds.adminDeposits` | query | 管理员查询充值申请 |
| `funds.adminApproveDeposit` | mutation | 管理员批准充值 |
| `funds.adminWithdrawals` | query | 管理员查询提现申请 |
| `funds.adminApproveWithdrawal` | mutation | 管理员批准提现 |

### user 路由
| 接口 | 类型 | 说明 |
|------|------|------|
| `user.adminList` | query | 管理员查询用户列表 |
| `user.setRevenueShare` | mutation | 管理员设置用户分成比例 |
| `user.setInviteeRevenueShare` | mutation | 推荐人设置下级分成比例 |
| `user.teamInfo` | query | 查询我的团队信息 |
| `user.revenueShareRecords` | query | 查询分成明细 |

### points 路由
| 接口 | 类型 | 说明 |
|------|------|------|
| `points.balance` | query | 查询积分余额 |
| `points.redeem` | mutation | 兑换积分（每月一次） |
| `points.transfer` | mutation | 转让积分给他人 |
| `points.adminAdjust` | mutation | 管理员调整积分 |

---

## 前端页面说明

| 页面 | 路径 | 说明 |
|------|------|------|
| 首页（账户总览） | `/` | 显示余额、盈亏、分成统计、启用中的策略 |
| 策略中心 | `/strategy` | 浏览信号源，订阅/取消订阅，设置倍数 |
| 订单记录 | `/orders` | 查看所有跟单订单，含盈亏和分成扣除 |
| 我的收益 | `/earnings` | 分成收入/支出明细，累计统计 |
| 团队收益 | `/team` | 推荐链管理，给下级设置分成比例 |
| 充值提现 | `/funds` | 获取充值地址，申请提现，查看流水 |
| 积分中心 | `/points` | 积分余额，兑换，转让 |
| API 绑定 | `/exchange-api` | 绑定/管理交易所 API Key |
| 邀请好友 | `/invite` | 查看邀请码，生成邀请链接 |
| 后台管理 | `/admin/*` | 仅管理员可见 |

---

## 生产部署说明

**服务器：** `47.254.255.242`（阿里云 ECS）

**进程管理：** PM2（`pm2 list` 查看状态）

**进程名：** `copy-trading`

**部署路径：** `/www/wwwroot/copy-trading/`

**Web 服务：** Nginx 反向代理，`/copy/` 路径映射到 Node.js 服务（端口 3001）

**访问地址：** `http://47.254.255.242/copy/`

**构建命令：**
```bash
# 在沙盒环境构建
cd /home/ubuntu/copy-trading-platform
VITE_BASE_PATH=/copy/ npx vite build --base /copy/

# 打包上传
tar czf /tmp/deploy.tar.gz dist/ server/ shared/ drizzle/ package.json pnpm-lock.yaml
scp /tmp/deploy.tar.gz root@47.254.255.242:/tmp/

# 在服务器上部署
cd /www/wwwroot/copy-trading
tar xzf /tmp/deploy.tar.gz
pm2 restart copy-trading --update-env
```

**环境变量（在 PM2 ecosystem.config.js 中配置）：**

| 变量名 | 说明 |
|--------|------|
| `DATABASE_URL` | MySQL 连接字符串 |
| `JWT_SECRET` | Session Cookie 签名密钥 |
| `ENCRYPTION_KEY` | API Key 加密密钥（AES-256） |
| `BSC_MASTER_MNEMONIC` | HD 钱包助记词（充值地址派生） |
| `BSC_MAIN_WALLET` | 归集钱包地址 |
| `BSCSCAN_API_KEY` | BSCScan API Key |
| `EMAIL_HOST` / `EMAIL_USER` / `EMAIL_PASS` | 邮件服务器配置 |

---

## 已知问题与待办

| 问题 | 优先级 | 说明 |
|------|--------|------|
| User 517 ReduceOnly 持续报错 | 高 | 该用户无持仓但收到平仓信号，需在平仓前检查用户持仓 |
| BTC 策略信号源 API 凭证失效 | 高 | OKX WebSocket 登录持续返回 4001，需更新 API Key |
| 历史订单数据不完整 | 中 | 之前因 DB bug 未记录盈亏，可写追溯脚本从交易所补全 |
| 收益分成差额计算已修复 | ✅ | 差额多级分成逻辑已修复并通过 9 个单元测试 |
| Binance orderId 精度问题已修复 | ✅ | 使用 text() + 正则保护大整数精度 |

---

## 单元测试

```bash
cd copy-trading-platform
pnpm test
```

当前测试覆盖：
- `server/revenue-share.test.ts`：9 个收益分成差额计算测试
- `server/close-order.test.ts`：17 个平仓盈亏计算测试（含各交易所）
- `server/copy-trading.test.ts`：33 个集成测试
- `server/auth.logout.test.ts`：1 个认证测试

---

*文档生成时间：2026-03-24*
