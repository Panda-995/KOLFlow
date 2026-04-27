import { useState } from 'react';
import { Server, ArrowRight, Loader2, AlertCircle, CheckCircle, Wifi } from 'lucide-react';
import { clsx } from 'clsx';

export default function ServerConnect() {
  const [serverUrl, setServerUrl] = useState(localStorage.getItem('kolflow_server_url') || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const testConnection = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      let url = serverUrl.trim();
      
      if (!url) {
        setError('请输入服务器地址');
        setIsLoading(false);
        return;
      }

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
      }
      
      url = url.replace(/\/$/, '');

      console.log('Testing connection to:', url);

      const testUrl = `${url}/api/health`;
      
      const xhr = new XMLHttpRequest();
      xhr.timeout = 10000;
      
      xhr.onload = function() {
        console.log('XHR Response status:', xhr.status);
        if (xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText);
            console.log('Health check response:', data);
            localStorage.setItem('kolflow_server_url', url);
            setSuccess(true);
            setError(null);
            
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          } catch (e) {
            setError('服务器响应格式错误');
          }
        } else {
          setError(`服务器响应异常 (状态码: ${xhr.status})`);
        }
        setIsLoading(false);
      };
      
      xhr.onerror = function() {
        console.error('XHR error');
        setError('无法连接到服务器，请检查网络和地址');
        setIsLoading(false);
      };
      
      xhr.ontimeout = function() {
        console.error('XHR timeout');
        setError('连接超时，请检查服务器是否运行');
        setIsLoading(false);
      };
      
      xhr.open('GET', testUrl, true);
      xhr.send();
      
    } catch (e: any) {
      setError('无法连接到服务器');
      console.error('Connection error:', e);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-panda-black flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10 mb-4">
              <Wifi size={40} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              <span>KOL</span>
              <span className="text-white/60">Flow</span>
            </h1>
            <p className="text-white/50 text-sm mt-2">连接到您的商单管理服务器</p>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-white/70 text-sm font-medium mb-2 block">
                服务器地址
              </label>
              <div className="relative">
                <Server size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="192.168.101.94:3000"
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 outline-none focus:border-white/40 transition-all"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 p-3 bg-green-500/20 border border-green-500/30 rounded-xl text-green-400 text-sm">
                <CheckCircle size={16} />
                <span>连接成功！正在加载...</span>
              </div>
            )}

            <div className="text-white/30 text-xs">
              提示：请确保手机和服务器在同一局域网，且服务器正在运行
            </div>
          </div>

          <button
            onClick={testConnection}
            disabled={isLoading}
            className={clsx(
              "w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all",
              "bg-white text-panda-black",
              isLoading && "opacity-70 cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <ArrowRight size={18} />
            )}
            <span>{isLoading ? '正在连接...' : '连接服务器'}</span>
          </button>

          <p className="text-white/40 text-xs text-center mt-4">
            格式：IP地址:端口<br />
            例如：192.168.101.94:3000
          </p>
        </div>
      </div>
    </div>
  );
}