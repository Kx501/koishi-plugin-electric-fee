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
        '输入 /help 功能名 查看详细帮助'
    })

  // 交费子命令优化后的代码
  ctx.command('电费')
    .subcommand('交电费 <金额:number>', '记录电费缴纳')
    .alias('缴费')
    .usage(`示例：交电费 200\n（记录${config.currencyUnit}为单位的电费缴纳）`)
    .action(async ({ session }, amount) => {
      // 精确校验逻辑
      if (typeof amount !== 'number' || isNaN(amount)) {
        return '❌ 请输入有效的数字金额'
      }

      // 精确到分的最小金额校验
      const minAmount = 0.01
      if (amount < minAmount) {
        return `❌ 金额不能小于最小单位（${minAmount}${config.currencyUnit}）`
      }

      // 严格两位小数校验
      const validatedAmount = Math.round(amount * 100) / 100
      if (Math.abs(amount - validatedAmount) > 1e-6) {
        return '❌ 金额最多支持两位小数'
      }

      try {
        await ctx.database.create('electric_payment', {
          amount: validatedAmount,  // 存储精确计算后的值
          date: new Date(),
          channelId: session.channelId,
          userId: session.userId
        })
        return `✅ 成功记录电费 ${validatedAmount.toFixed(2)} ${config.currencyUnit}`
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

        if (!records.length) return '📭 你尚未缴纳过电费'

        let output = `📆 你的缴费记录（${config.currencyUnit}）\n══════════════\n`
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

  // 删除子命令优化（支持批量删除）
  ctx.command('电费')
    .subcommand('.删 <序号:string>', '删除指定记录')
    .alias('删除')
    .usage('支持格式：\n' +
      '▸ 单个删除：电费 删 3\n' +
      '▸ 批量删除：电费 删 1-5')
    .action(async ({ session }, input) => {
      if (!input) return '⚠️ 请输入删除序号或范围'

      // 解析序号范围
      const parseRange = (str: string) => {
        const match = str.match(/^(\d+)(?:-(\d+))?$/)
        if (!match) return null
        const start = parseInt(match[1])
        const end = match[2] ? parseInt(match[2]) : start
        return start <= end ? Array.from({ length: end - start + 1 }, (_, i) => start + i) : null
      }

      // 获取有效记录
      const records = await ctx.database.get('electric_payment', {
        channelId: session.channelId,
        userId: session.userId
      }, { sort: { date: 'asc' } })

      if (!records.length) return '📭 当前没有可删除的记录'

      // 处理输入
      const indexes = parseRange(input)
      if (!indexes || indexes.some(i => i < 1 || i > records.length)) {
        return `⚠️ 无效序号范围，当前记录数：${records.length}`
      }

      // 去重并排序
      const uniqueIndexes = [...new Set(indexes)].sort((a, b) => a - b)

      // 获取目标ID
      const targets = uniqueIndexes
        .map(i => records[i - 1]?.id)
        .filter(id => id !== undefined)

      if (!targets.length) return '⚠️ 没有找到可删除的记录'

      try {
        // 执行批量删除
        await ctx.database.remove('electric_payment', { id: targets })

        return `🗑️ 已删除 ${targets.length} 条记录：\n` +
          uniqueIndexes.map(i => {
            const amount = records[i - 1].amount.toFixed(2)
            return `▸ 序号 ${i}（${amount}）- ${config.currencyUnit}`
          }).join('\n')
      } catch (e) {
        ctx.logger.error('批量删除失败:', e)
        return '📛 删除操作未完成，请检查输入'
      }
    })
}