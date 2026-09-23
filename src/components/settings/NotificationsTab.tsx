import type { NotificationsTabProps } from './types';
import Select from '../common/Select';

export function NotificationsTab({ formData, setFormData, reportFrequency, setReportFrequency }: NotificationsTabProps) {
  return (
    <div className="space-y-6">
      <div className="card-sketch p-6 bg-panda-white">
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
              <div className="switch"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-bg-tertiary rounded-xl">
            <div>
              <div className="font-medium text-panda-black">周期数据汇总</div>
              <div className="text-sm text-gray-500">打开应用时，在通知中心查看上一个完整周期的收入与商单汇总</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={formData.weeklyReport}
                onChange={e => setFormData({...formData, weeklyReport: e.target.checked})}
              />
              <div className="switch"></div>
            </label>
          </div>
        </div>
      </div>

      <div className="card-sketch p-6 bg-panda-white">
        <h2 className="text-lg font-bold mb-4">报告设置</h2>
        <div className="space-y-4">
          <div className="p-4 bg-bg-tertiary rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-panda-black">自动报告频率</div>
                <div className="text-sm text-gray-500">按北京时间，每周一汇总上周一至周日，每月1日汇总上月</div>
              </div>
              <Select
                value={reportFrequency}
                onChange={value => setReportFrequency(value as 'weekly' | 'monthly')}
                className="w-24 flex-shrink-0"
                aria-label="报告频率"
                options={[{ value: 'weekly', label: '每周' }, { value: 'monthly', label: '每月' }]}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
