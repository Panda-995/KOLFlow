import { Upload } from 'lucide-react';
import type { ProfileTabProps } from './types';

export function ProfileTab({ formData, setFormData, fileInputRef, handleAvatarChange }: ProfileTabProps) {
  return (
    <div className="card-sketch p-6 bg-white">
      <h2 className="text-lg font-bold mb-6">个人资料</h2>
      <div className="space-y-4">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center text-2xl font-bold text-white overflow-hidden border border-border">
            {formData.avatar ? (
              <img src={formData.avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              formData.displayName.charAt(0) || '博'
            )}
          </div>
          <div>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleAvatarChange} 
            />
            <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
              <Upload size={16} />
              更换头像
            </button>
            <p className="text-xs text-gray-400 mt-2">支持 JPG, PNG 格式，建议尺寸 200x200</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-600">显示名称</label>
            <input 
              type="text" 
              value={formData.displayName} 
              onChange={e => setFormData({...formData, displayName: e.target.value})}
              className="w-full px-4 py-2 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm" 
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-600">邮箱地址</label>
            <input 
              type="email" 
              value={formData.email} 
              onChange={e => setFormData({...formData, email: e.target.value})}
              className="w-full px-4 py-2 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm" 
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-gray-600">个人简介</label>
            <textarea 
              rows={3} 
              value={formData.bio} 
              onChange={e => setFormData({...formData, bio: e.target.value})}
              className="w-full px-4 py-2 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm resize-none"
            ></textarea>
          </div>
        </div>
      </div>
    </div>
  );
}