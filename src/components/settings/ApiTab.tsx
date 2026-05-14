import { Copy, RefreshCw, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { ApiTabProps } from './types';

const API_ENDPOINTS = [
  { category: '商单', endpoints: [
    ['GET', '/orders', '获取列表'],
    ['POST', '/orders', '创建商单'],
    ['PUT', '/orders/:id', '更新商单'],
    ['DEL', '/orders/:id', '删除商单'],
  ]},
  { category: '待办', endpoints: [
    ['GET', '/todos', '获取列表'],
    ['POST', '/todos', '创建待办'],
    ['PUT', '/todos/:id', '更新待办'],
  ]},
  { category: '品牌', endpoints: [
    ['GET', '/brands', '获取列表'],
    ['POST', '/brands', '创建品牌'],
    ['PUT', '/brands/:id', '更新品牌'],
    ['DEL', '/brands/:id', '删除品牌'],
  ]},
  { category: '账单', endpoints: [
    ['GET', '/payments', '获取列表'],
    ['POST', '/payments', '创建账单'],
    ['PUT', '/payments/:id', '更新账单'],
    ['DEL', '/payments/:id', '删除账单'],
  ]},
  { category: '其他', endpoints: [
    ['GET', '/statistics', '统计数据'],
    ['GET', '/settings', '用户设置'],
    ['GET', '/logs', '操作日志'],
    ['GET', '/export', '导出数据'],
  ]},
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-700',
  POST: 'bg-green-100 text-green-700',
  PUT: 'bg-yellow-100 text-yellow-700',
  DEL: 'bg-red-100 text-red-700',
};

export function ApiTab({ 
  settings, 
  isTestingApi, 
  testApiConnection, 
  handleGenerateApiKey, 
  apiKeyConfirm,
  setApiKeyConfirm,
  confirmGenerateApiKey,
  copyCurlExample: _copyCurlExample, 
  copyFullConfig, 
  copyToClipboard 
}: ApiTabProps) {
  const [showDocs, setShowDocs] = useState(false);

  return (
    <div className="card-sketch p-6 bg-white">
      <h2 className="text-lg font-bold mb-4">API 设置</h2>
      
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-500 mb-1 block">API Key</label>
            <input
              type="text"
              readOnly
              value={settings?.apiKey || '尚未生成'}
              className="w-full px-3 py-2 bg-gray-50 border border-border rounded-lg text-sm font-mono"
            />
          </div>
          {settings?.apiKey && (
            <button onClick={() => copyToClipboard(settings?.apiKey || '')} className="p-2 border border-border rounded-lg text-gray-500 hover:bg-gray-50" title="复制">
              <Copy size={16} />
            </button>
          )}
          <button
            onClick={testApiConnection}
            disabled={isTestingApi || !settings?.apiKey}
            className="px-3 py-2 border border-border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
          >
            {isTestingApi ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            测试
          </button>
          <button onClick={handleGenerateApiKey} className="px-3 py-2 bg-panda-black text-white rounded-lg text-sm hover:bg-panda-black/90 flex items-center gap-1">
            <RefreshCw size={14} />
            {settings?.apiKey ? '重新生成' : '生成'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-500 mb-1 block">服务器地址</label>
            <input
              type="text"
              readOnly
              value={typeof window !== 'undefined' ? window.location.origin : ''}
              className="w-full px-3 py-2 bg-gray-50 border border-border rounded-lg text-sm font-mono"
            />
          </div>
          <button onClick={() => copyToClipboard(typeof window !== 'undefined' ? window.location.origin : '')} className="p-2 border border-border rounded-lg text-gray-500 hover:bg-gray-50" title="复制">
            <Copy size={16} />
          </button>
        </div>

        <div className="p-3 bg-gray-50 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">快速测试命令</span>
            <button onClick={copyFullConfig} className="text-xs text-accent hover:underline flex items-center gap-1">
              <Copy size={12} />
              复制
            </button>
          </div>
          <code className="text-xs text-gray-500 block">
            curl "{typeof window !== 'undefined' ? window.location.origin : ''}/api/external/orders?token={settings?.apiKey || 'YOUR_KEY'}"
          </code>
        </div>

        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
          <div className="flex items-center gap-2 text-xs">
            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">URL参数</span>
            <code className="bg-white px-2 py-0.5 rounded">?token=YOUR_KEY</code>
            <span className="text-gray-400">或</span>
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">Header</span>
            <code className="bg-white px-2 py-0.5 rounded">Bearer YOUR_KEY</code>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <button 
            onClick={() => setShowDocs(!showDocs)}
            className="flex items-center justify-between w-full text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <span>API 接口文档</span>
            {showDocs ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          
          {showDocs && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-gray-500">基础路径: <code className="bg-gray-100 px-1 rounded">/api/external</code></p>
              
              {API_ENDPOINTS.map(({ category, endpoints }) => (
                <div key={category}>
                  <h4 className="text-xs font-bold text-gray-400 mb-1">{category}</h4>
                  <div className="grid gap-1">
                    {endpoints.map(([method, path, desc]) => (
                      <div key={`${category}-${method}-${path}`} className="flex items-center gap-2 text-xs py-0.5">
                        <span className={`px-1.5 py-0.5 rounded font-medium w-8 text-center ${METHOD_COLORS[method]}`}>{method}</span>
                        <code className="text-gray-600">{path}</code>
                        <span className="text-gray-400">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {apiKeyConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-bold mb-2">确认生成新 API Key</h3>
            <p className="text-sm text-gray-600 mb-4">生成新的 API Key 将导致旧的 API Key 失效。确定要继续吗？</p>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setApiKeyConfirm(false)}
                className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button 
                onClick={confirmGenerateApiKey}
                className="px-4 py-2 bg-panda-black text-white rounded-lg text-sm hover:bg-panda-black/90"
              >
                确认生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}