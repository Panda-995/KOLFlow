import type { NotificationsTabProps } from './types';

export function NotificationsTab({ formData, setFormData, reportFrequency, setReportFrequency }: NotificationsTabProps) {
  return (
    <div className="space-y-6">
      <div className="card-sketch p-6 bg-white">
        <h2 className="text-lg font-bold mb-6">通知设置</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-bg-tertiary rounded-xl">
            <div>
              <div className="font-medium text-panda-black">商单即将到期提醒</div>
              <div className="text-sm text-gray-500">在商单截止日期前3天发送通知</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={formData.orderReminder}
                onChange={e => setFormData({...formData, orderReminder: e.target.checked})}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-bg-tertiary rounded-xl">
            <div>
              <div className="font-medium text-panda-black">每周数据汇总</div>
              <div className="text-sm text-gray-500">在通知中心生成当前周期的收入与商单汇总</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={formData.weeklyReport}
                onChange={e => setFormData({...formData, weeklyReport: e.target.checked})}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
            </label>
          </div>
        </div>
      </div>

      <div className="card-sketch p-6 bg-white">
        <h2 className="text-lg font-bold mb-4">报告设置</h2>
        <div className="space-y-4">
          <div className="p-4 bg-bg-tertiary rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-panda-black">自动报告频率</div>
                <div className="text-sm text-gray-500">设置通知中心自动生成汇总的周期</div>
              </div>
              <select
                value={reportFrequency}
                onChange={e => setReportFrequency(e.target.value as 'weekly' | 'monthly')}
                className="px-4 py-2 bg-white border border-border rounded-xl text-sm outline-none focus:border-accent"
              >
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
