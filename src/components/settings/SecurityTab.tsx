import type { SecurityTabProps } from './types';

export function SecurityTab({ securityData, setSecurityData, isSaving, handleSecuritySave }: SecurityTabProps) {
  return (
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
  );
}