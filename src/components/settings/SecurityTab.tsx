import { Trash2 } from 'lucide-react';
import type { SecurityTabProps } from './types';

export function SecurityTab({
  securityData,
  setSecurityData,
  isSaving,
  handleSecuritySave,
  deletionPassword,
  setDeletionPassword,
  isDeletingAccount,
  requestAccountDeletion,
}: SecurityTabProps) {
  return (
    <div className="space-y-6">
      <div className="card-sketch p-6 bg-white">
        <h2 className="text-lg font-bold mb-6">账号安全</h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-600">登录账号 (邮箱)</label>
            <input
              type="email"
              value={securityData.email}
              onChange={e => setSecurityData({...securityData, email: e.target.value})}
              className="w-full px-4 py-2 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-600">原密码</label>
            <input
              type="password"
              value={securityData.oldPassword || ''}
              onChange={e => setSecurityData({...securityData, oldPassword: e.target.value})}
              className="w-full px-4 py-2 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
              placeholder="请输入原密码以验证身份"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-600">新密码</label>
            <input
              type="password"
              value={securityData.password}
              onChange={e => setSecurityData({...securityData, password: e.target.value})}
              className="w-full px-4 py-2 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
              placeholder="至少6位，包含字母和数字"
            />
            <p className="text-xs text-gray-400">密码需至少6位，且包含字母和数字</p>
          </div>
          <div className="pt-2">
            <button onClick={handleSecuritySave} disabled={isSaving} className="btn-sketch py-2 px-6 disabled:opacity-50">
              {isSaving ? '保存中...' : '更新账号与密码'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 bg-white rounded-2xl border border-danger/30">
        <h2 className="text-lg font-bold text-danger mb-2 flex items-center gap-2">
          <Trash2 size={19} />
          注销账号
        </h2>
        <p className="text-sm text-gray-600 leading-6 mb-4">
          注销后，当前账号以及商单、品牌、账单、待办、素材、日志和设置等关联数据将被永久删除且无法恢复。
          建议您先在“数据管理”中导出备份。
        </p>
        <div className="space-y-1.5">
          <label htmlFor="account-deletion-password" className="text-sm font-medium text-gray-600">
            当前密码
          </label>
          <input
            id="account-deletion-password"
            type="password"
            autoComplete="current-password"
            value={deletionPassword}
            onChange={e => setDeletionPassword(e.target.value)}
            className="w-full px-4 py-2 bg-bg-tertiary border border-transparent focus:border-danger focus:bg-white rounded-xl outline-none transition-all text-sm"
            placeholder="输入当前密码以确认本人操作"
          />
        </div>
        <div className="pt-4">
          <button
            type="button"
            onClick={requestAccountDeletion}
            disabled={isDeletingAccount || !deletionPassword}
            className="inline-flex items-center gap-2 py-2 px-5 rounded-xl bg-danger text-white font-medium text-sm hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            <Trash2 size={16} />
            {isDeletingAccount ? '正在注销...' : '永久注销账号'}
          </button>
        </div>
      </div>
    </div>
  );
}
