import { Context, Schema } from 'koishi'

export const name = 'electric-fee'
export const inject = ['database']

export interface Config {
  currencyUnit: string
}

export const Config: Schema<Config> = Schema.object({
  currencyUnit: Schema.string().default('元').description('货币单位显示'),
})

declare module 'koishi' {
  interface Tables {
    electric_payment: ElectricPayment
  }
}

interface ElectricPayment {
  id: number
  amount: number
  date: Date
  channelId: string
  userId: string
}

export function apply(ctx: Context, config: Config) {
  ctx.model.extend('electric_payment', {
    id: 'integer',
    amount: 'float',
    date: 'timestamp',
    channelId: 'string',
    userId: 'string'
  }, { autoInc: true })

  // 主命令
  ctx.command('电费', '电费管理系统')
    .usage('👉 使用以下子命令操作：\n' +
      '▸ 交电费 [金额] - 记录电费缴纳\n' +
      '▸ 统计电费 - 查看个人缴费记录\n' +
      '▸ 删除交费 [序号] - 删除指定记录')
    .action(({ session }) => {
      return `⚡ 费用管理系统使用举例 ⚡\n` +
        '────────────────\n' +
        '1️⃣ 记录缴费：交电费 200\n' +
        '2️⃣ 查看记录：统计电费\n' +
        '3️⃣ 删除记录：删除交费 1\n' +
        `当前货币单位：${config.currencyUnit}\n` +
        '────────────────\n' +
        '输入 \\help 功能名 查看详细帮助'
    })

  // 交费子命令
  ctx.command('电费')
    .subcommand('交电费 <金额:number>', '记录电费缴纳')
    .alias('缴费')
    .usage(`示例：交电费 200\n（记录${config.currencyUnit}为单位的电费缴纳）`)
    .action(async ({ session }, amount) => {
      if (!amount || amount <= 0) return '金额需大于0'

      try {
        await ctx.database.create('electric_payment', {
          amount: Number(amount.toFixed(2)),
          date: new Date(),
          channelId: session.channelId,
          userId: session.userId
        })
        return `✅ 成功记录电费 ${amount.toFixed(2)} ${config.currencyUnit}`
      } catch (e) {
        return '📛 记录失败，请联系管理员'
      }
    })

  // 查询子命令
  ctx.command('电费')
    .subcommand('统计电费', '查看个人缴费记录')
    .alias('查电费')
    .action(async ({ session }) => {
      try {
        const records = await ctx.database.get('electric_payment', {
          channelId: session.channelId,
          userId: session.userId
        }, { sort: { date: 'asc' } })

        if (!records.length) return '📭 您尚未缴纳过电费'

        let output = `📆 您的缴费记录（${config.currencyUnit}）\n══════════════\n`
        records.forEach((record, index) => {
          const date = new Date(record.date)
            .toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })
            .replace(/\//g, '年')
            .replace(/\//g, '月')
            .replace(' ', '日 ')

          output += `🔢 记录 ${index + 1}\n` +
            `⏰ ${date}\n` +
            `💰 ${record.amount.toFixed(2)} ${config.currencyUnit}\n` +
            '══════════════\n'
        })
        return output + `💳 累计总额：${records.reduce((sum, r) => sum + r.amount, 0).toFixed(2)
          } ${config.currencyUnit}`
      } catch (e) {
        return '📛 查询失败，请稍后重试'
      }
    })

  // 删除子命令
  ctx.command('电费')
    .subcommand('删除交费 <序号:number>', '删除指定记录')
    .alias('删除缴费')
    .action(async ({ session }, index) => {
      if (!index || index <= 0) return '⚠️ 请输入有效序号'

      try {
        const records = await ctx.database.get('electric_payment', {
          channelId: session.channelId,
          userId: session.userId
        }, { sort: { date: 'asc' } })

        if (index > records.length) return '⚠️ 序号超出范围'
        const target = records[index - 1]

        await ctx.database.remove('electric_payment', { id: target.id })
        return `🗑️ 已删除记录 ${index}（原金额：${target.amount.toFixed(2)
          } ${config.currencyUnit}）`
      } catch (e) {
        return '📛 删除失败，请检查序号'
      }
    })
}