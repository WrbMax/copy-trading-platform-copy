/**
 * AlphaRoute Platform — Legal Agreements & Risk Disclosures
 * Version 1.0 | Effective Date: 2026-01-01
 *
 * Two agreement sets:
 * 1. USER_AGREEMENT — shown at registration (Terms of Service + Risk Disclosure)
 * 2. STRATEGY_RISK — shown when activating a strategy (Trading Risk Confirmation)
 */

export const USER_AGREEMENT = {
  zh: {
    title: "用户服务协议与风险披露声明",
    effectiveDate: "生效日期：2026年1月1日",
    sections: [
      {
        heading: "一、服务性质声明",
        body: `AlphaRoute（以下简称"本平台"）是一个提供 AI 量化策略信号跟随服务的技术平台。本平台不构成任何形式的投资顾问、资产管理人或受监管金融机构。本平台所提供的策略信号、历史数据、预期收益等信息，仅供用户参考，不构成任何投资建议或盈利承诺。

用户在本平台进行的所有交易行为，均通过用户自行持有的第三方交易所账户及 API 密钥执行。本平台不直接持有、保管或控制用户的任何数字资产。`,
      },
      {
        heading: "二、免责声明",
        body: `在法律允许的最大范围内，本平台明确声明以下免责事项：

（1）**交易亏损免责**：数字资产交易具有高度波动性，市场价格可能在极短时间内大幅波动。用户因使用本平台策略信号而产生的任何交易亏损，本平台不承担任何赔偿责任。

（2）**技术风险免责**：本平台可能因服务器故障、网络中断、交易所 API 异常、系统维护等技术原因导致策略信号延迟、丢失或执行失败。上述情形导致的任何损失，本平台不承担责任。

（3）**历史表现免责**：本平台展示的历史收益率、胜率、最大回撤等数据，均为历史表现记录，不代表未来实际收益。过往业绩不构成对未来收益的保证或暗示。

（4）**第三方风险免责**：用户使用的第三方交易所可能存在流动性不足、提现限制、账户冻结、平台倒闭等风险。因第三方交易所原因导致的任何损失，本平台不承担责任。

（5）**用户操作免责**：因用户自行修改 API 权限、手动干预持仓、设置不当倍数或其他用户操作行为导致的损失，本平台不承担责任。

（6）**不可抗力免责**：因战争、自然灾害、政府监管政策变化、区块链网络拥堵等不可抗力因素导致的损失，本平台不承担责任。`,
      },
      {
        heading: "三、风险提示",
        body: `用户在注册并使用本平台前，须充分了解并接受以下风险：

（1）**本金损失风险**：数字资产交易可能导致本金部分或全部损失。请仅使用您能够承受全部损失的资金进行交易。

（2）**杠杆放大风险**：本平台策略涉及合约交易，杠杆效应将同比例放大盈利与亏损。高倍数设置可能在短时间内导致仓位爆仓。

（3）**市场极端风险**：在市场剧烈波动、黑天鹅事件或流动性危机期间，止损指令可能无法按预期价格成交，实际亏损可能超出预期。

（4）**API 安全风险**：用户须妥善保管 API 密钥，避免泄露。本平台建议仅授予交易权限，严禁授予提现权限。因 API 密钥泄露导致的资产损失，本平台不承担责任。

（5）**策略适用性风险**：不同市场环境下，同一策略的表现可能存在显著差异。本平台策略在特定市场条件下可能持续产生亏损。`,
      },
      {
        heading: "四、用户承诺",
        body: `用户注册并使用本平台，即表示用户：

（1）已年满 18 周岁，具有完全民事行为能力；
（2）已充分阅读、理解并自愿接受本协议全部条款；
（3）所使用的资金来源合法，不涉及任何违法所得；
（4）理解并接受数字资产交易的全部风险，并自行承担所有交易结果；
（5）不会以任何方式将本平台的服务损失归咎于本平台或其运营方。`,
      },
      {
        heading: "五、协议变更",
        body: `本平台保留随时修改本协议的权利。协议更新后，本平台将通过站内通知或页面公告的方式告知用户。用户继续使用本平台服务，视为接受修改后的协议。如用户不同意修改内容，应立即停止使用本平台并关闭账户。`,
      },
    ],
    checkboxLabel: "我已阅读并同意《用户服务协议》与《风险披露声明》",
    readFullText: "阅读完整协议",
    close: "关闭",
    agree: "我已阅读并同意",
  },

  en: {
    title: "Terms of Service & Risk Disclosure",
    effectiveDate: "Effective Date: January 1, 2026",
    sections: [
      {
        heading: "1. Nature of Service",
        body: `AlphaRoute (hereinafter "the Platform") is a technology platform that provides AI-driven quantitative strategy signal-following services. The Platform does not constitute any form of investment advisor, asset manager, or regulated financial institution. Strategy signals, historical data, expected returns, and other information provided by the Platform are for reference purposes only and do not constitute investment advice or profit guarantees.

All trading activities conducted by users on the Platform are executed through the user's own third-party exchange accounts and API keys. The Platform does not directly hold, custody, or control any user's digital assets.`,
      },
      {
        heading: "2. Disclaimer of Liability",
        body: `To the maximum extent permitted by applicable law, the Platform expressly disclaims the following liabilities:

(1) **Trading Losses**: Digital asset trading is highly volatile, and market prices may fluctuate significantly within a very short period. The Platform bears no liability for any trading losses incurred by users as a result of using the Platform's strategy signals.

(2) **Technical Risks**: The Platform may experience strategy signal delays, losses, or execution failures due to server failures, network interruptions, exchange API anomalies, system maintenance, or other technical reasons. The Platform bears no liability for any losses resulting from such circumstances.

(3) **Historical Performance**: Historical return rates, win rates, maximum drawdown, and other data displayed on the Platform are historical performance records and do not represent future actual returns. Past performance does not guarantee or imply future results.

(4) **Third-Party Risks**: Third-party exchanges used by users may be subject to risks including insufficient liquidity, withdrawal restrictions, account freezes, or platform insolvency. The Platform bears no liability for any losses caused by third-party exchanges.

(5) **User Actions**: The Platform bears no liability for losses caused by users modifying API permissions, manually intervening in positions, setting inappropriate multipliers, or other user actions.

(6) **Force Majeure**: The Platform bears no liability for losses caused by force majeure events including war, natural disasters, changes in government regulatory policies, or blockchain network congestion.`,
      },
      {
        heading: "3. Risk Disclosure",
        body: `Before registering and using the Platform, users must fully understand and accept the following risks:

(1) **Principal Loss Risk**: Digital asset trading may result in partial or total loss of principal. Only use funds that you can afford to lose entirely.

(2) **Leverage Amplification Risk**: Platform strategies involve contract trading. Leverage will proportionally amplify both profits and losses. High multiplier settings may result in liquidation within a short period.

(3) **Extreme Market Risk**: During periods of severe market volatility, black swan events, or liquidity crises, stop-loss orders may not be executed at expected prices, and actual losses may exceed expectations.

(4) **API Security Risk**: Users must safeguard their API keys and prevent disclosure. The Platform recommends granting trading permissions only — withdrawal permissions must never be granted. The Platform bears no liability for asset losses resulting from API key disclosure.

(5) **Strategy Suitability Risk**: The performance of the same strategy may vary significantly under different market conditions. Platform strategies may generate sustained losses under certain market conditions.`,
      },
      {
        heading: "4. User Representations",
        body: `By registering and using the Platform, the user represents that:

(1) The user is at least 18 years of age and has full legal capacity;
(2) The user has fully read, understood, and voluntarily accepted all terms of this Agreement;
(3) The funds used are from lawful sources and do not involve any illegal proceeds;
(4) The user understands and accepts all risks of digital asset trading and bears sole responsibility for all trading outcomes;
(5) The user will not hold the Platform or its operators liable for any service-related losses in any manner.`,
      },
      {
        heading: "5. Agreement Amendments",
        body: `The Platform reserves the right to modify this Agreement at any time. Upon updates, the Platform will notify users via in-platform notifications or page announcements. Continued use of the Platform's services constitutes acceptance of the amended Agreement. If a user does not agree to the amendments, they should immediately cease using the Platform and close their account.`,
      },
    ],
    checkboxLabel: "I have read and agree to the Terms of Service and Risk Disclosure",
    readFullText: "Read Full Agreement",
    close: "Close",
    agree: "I Have Read and Agree",
  },
} as const;

export const STRATEGY_RISK = {
  zh: {
    title: "策略启动风险确认",
    subtitle: "请在启用策略前仔细阅读以下风险提示",
    items: [
      {
        id: "loss",
        icon: "⚠️",
        label: "本金损失风险",
        desc: "我理解数字资产合约交易具有高度风险，可能导致本金部分或全部损失。我仅使用本人能够承受全部损失的闲置资金。",
      },
      {
        id: "leverage",
        icon: "📊",
        label: "杠杆与爆仓风险",
        desc: "我理解倍数设置将放大盈亏比例。在极端行情下，高倍数可能导致仓位被强制平仓（爆仓），损失全部保证金。",
      },
      {
        id: "noguarantee",
        icon: "📈",
        label: "收益不保证",
        desc: "我理解平台展示的历史收益率、预期月化等数据均为历史表现，不构成对未来收益的任何承诺或保证。",
      },
      {
        id: "platform",
        icon: "🔒",
        label: "平台免责",
        desc: "我理解 AlphaRoute 仅提供策略信号技术服务，不承担因市场波动、技术故障、交易所风险等原因导致的任何交易亏损责任。",
      },
      {
        id: "independent",
        icon: "✅",
        label: "独立决策",
        desc: "本次启用策略为本人独立决策，与任何第三方建议无关。本人自愿承担全部交易风险与结果。",
      },
    ],
    confirmAll: "我已阅读并理解以上全部风险提示，自愿启用策略",
    activateBtn: "确认并启用策略",
    saveBtn: "仅保存（暂不启用）",
    mustCheckAll: "请勾选全部风险确认项后方可启用策略",
  },

  en: {
    title: "Strategy Activation Risk Confirmation",
    subtitle: "Please read the following risk disclosures carefully before activating a strategy",
    items: [
      {
        id: "loss",
        icon: "⚠️",
        label: "Principal Loss Risk",
        desc: "I understand that digital asset contract trading carries high risk and may result in partial or total loss of principal. I will only use idle funds that I can afford to lose entirely.",
      },
      {
        id: "leverage",
        icon: "📊",
        label: "Leverage & Liquidation Risk",
        desc: "I understand that multiplier settings will proportionally amplify profits and losses. Under extreme market conditions, high multipliers may result in forced liquidation, losing all margin.",
      },
      {
        id: "noguarantee",
        icon: "📈",
        label: "No Earnings Guarantee",
        desc: "I understand that historical return rates, expected monthly returns, and similar data displayed on the Platform are historical records only and do not constitute any promise or guarantee of future returns.",
      },
      {
        id: "platform",
        icon: "🔒",
        label: "Platform Disclaimer",
        desc: "I understand that AlphaRoute provides only strategy signal technology services and bears no liability for any trading losses resulting from market volatility, technical failures, exchange risks, or other causes.",
      },
      {
        id: "independent",
        icon: "✅",
        label: "Independent Decision",
        desc: "This strategy activation is my independent decision, unrelated to any third-party advice. I voluntarily assume all trading risks and outcomes.",
      },
    ],
    confirmAll: "I have read and understood all of the above risk disclosures and voluntarily activate this strategy",
    activateBtn: "Confirm & Activate Strategy",
    saveBtn: "Save Only (Do Not Activate)",
    mustCheckAll: "Please check all risk confirmation items before activating the strategy",
  },
} as const;
