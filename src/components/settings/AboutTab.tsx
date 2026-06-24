import { Heart, X, ZoomIn } from 'lucide-react';
import type { AboutTabProps } from './types';

export function AboutTab({ previewImage, setPreviewImage }: AboutTabProps) {
  return (
    <>
      <div className="card-sketch p-6 bg-white">
        <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
          <Heart size={20} className="text-accent" />
          关于 KOLFlow
        </h2>
        <div className="space-y-6">
          {/* 项目介绍 */}
          <div className="p-6 bg-gradient-to-br from-gray-50 to-white rounded-2xl border border-border/30">
            <h3 className="text-xl font-bold text-panda-black mb-4 flex items-center gap-2">
              🐼 KOLFlow
              <span className="text-sm font-normal text-gray-400">达人商单流管理系统</span>
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              KOLFlow 是一款专为 KOL/达人设计的商单管理系统，帮助您轻松管理每一笔商业合作。
              从商单创建、进度跟踪到财务结算，让繁琐的商单管理变得简单高效。
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { icon: '📊', title: '仪表盘', desc: '收入统计、月度目标' },
                { icon: '📦', title: '商单管理', desc: '创建、编辑、状态跟踪' },
                { icon: '✅', title: '待办日历', desc: '任务管理、日历视图' },
                { icon: '💰', title: '账单管理', desc: '收支统计、结算状态' },
              ].map((feature) => (
                <div key={feature.title} className="p-3 bg-white rounded-xl border border-border/20 text-center">
                  <div className="text-2xl mb-1">{feature.icon}</div>
                  <div className="text-xs font-bold text-panda-black">{feature.title}</div>
                  <div className="text-[10px] text-gray-400">{feature.desc}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="px-2 py-1 bg-gray-100 rounded-lg">React 19</span>
              <span className="px-2 py-1 bg-gray-100 rounded-lg">TypeScript</span>
              <span className="px-2 py-1 bg-gray-100 rounded-lg">Tailwind CSS</span>
              <span className="px-2 py-1 bg-gray-100 rounded-lg">SQLite</span>
            </div>
          </div>

          {/* 二维码区域 */}
          <div className="space-y-4">
            {/* 上方两个方图：小程序和赞赏码 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 bg-white rounded-2xl border-2 border-panda-black/10 hover:border-panda-black/30 transition-colors">
                <div className="text-center">
                  <div className="inline-block p-3 bg-gray-50 rounded-xl mb-3 relative group cursor-pointer" onClick={() => setPreviewImage('/小程序.jpg')}>
                    <img
                      src="/小程序.jpg"
                      alt="小程序二维码"
                      className="w-32 h-32 object-contain rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                      <ZoomIn className="text-white" size={24} />
                    </div>
                  </div>
                  <h4 className="font-bold text-panda-black text-sm">微信小程序</h4>
                  <p className="text-xs text-gray-400 mt-1">扫码体验小程序版本</p>
                </div>
              </div>
              <div className="p-5 bg-white rounded-2xl border-2 border-panda-black/10 hover:border-panda-black/30 transition-colors">
                <div className="text-center">
                  <div className="inline-block p-3 bg-gray-50 rounded-xl mb-3 relative group cursor-pointer" onClick={() => setPreviewImage('/赞赏码.png')}>
                    <img
                      src="/赞赏码.png"
                      alt="赞赏码"
                      className="w-32 h-32 object-contain rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                      <ZoomIn className="text-white" size={24} />
                    </div>
                  </div>
                  <h4 className="font-bold text-panda-black text-sm">赞赏码</h4>
                  <p className="text-xs text-gray-400 mt-1">感谢您的支持</p>
                </div>
              </div>
            </div>

            {/* 下方横图：公众号 */}
            <div className="p-5 bg-white rounded-2xl border-2 border-panda-black/10 hover:border-panda-black/30 transition-colors">
              <div className="text-center">
                <div className="inline-block p-3 bg-gray-50 rounded-xl mb-3 relative group cursor-pointer" onClick={() => setPreviewImage('/公众号.png')}>
                  <img
                    src="/公众号.png"
                    alt="微信公众号"
                    className="w-full max-w-md object-contain rounded-lg"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                    <ZoomIn className="text-white" size={24} />
                  </div>
                </div>
                <h4 className="font-bold text-panda-black text-sm">微信公众号</h4>
                <p className="text-xs text-gray-400 mt-1">关注获取最新动态和教程</p>
              </div>
            </div>
          </div>

          {/* 版权信息 */}
          <div className="pt-4 border-t border-border/30 text-center">
            <p className="text-xs text-gray-400">
              Made with ❤️ by 熊猫不是猫QAQ
            </p>
            <p className="text-[10px] text-gray-300 mt-1">
              © 2024-2026 熊猫不是猫QAQ · GNU AGPL v3.0
            </p>
            <p className="text-[10px] text-gray-300 mt-1">
              本软件不提供任何担保，您可以依照 AGPL v3.0 的条款再分发。
            </p>
            <a
              href="https://github.com/Panda-995/KOLFlow"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-panda-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-panda-black focus-visible:ring-offset-2"
            >
              查看项目源码与开源协议
            </a>
          </div>
        </div>
      </div>

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
            onClick={() => setPreviewImage(null)}
          >
            <X size={24} />
          </button>
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
