import {
  Download,
  ExternalLink,
  FileText,
  Heart,
  Mail,
  MessageSquareWarning,
  ShieldCheck,
  X,
  ZoomIn,
} from 'lucide-react';
import type { AboutTabProps } from './types';

const APP_DOWNLOAD_URL =
  import.meta.env.VITE_APP_DOWNLOAD_URL?.trim() ||
  'https://github.com/Panda-995/KOLFlow/releases/latest';

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

          {/* 合规与支持 */}
          <div className="p-6 bg-white rounded-2xl border border-border/40">
            <h3 className="text-base font-bold text-panda-black mb-2 flex items-center gap-2">
              <ShieldCheck size={18} />
              合规与支持
            </h3>
            <p className="text-xs text-gray-500 leading-5 mb-4">
              您可以随时查看隐私规则、个人信息清单及第三方共享清单，也可以通过下列渠道进行投诉、举报或问题反馈。
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="/privacy-policy.html"
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 rounded-xl border border-border/30 hover:border-panda-black/30 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-panda-black"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-panda-black">
                  <FileText size={16} />
                  隐私政策
                  <ExternalLink size={14} className="ml-auto text-gray-400" />
                </span>
                <span className="block mt-1 text-xs text-gray-500">了解各项业务功能如何处理个人信息</span>
              </a>

              <a
                href="/privacy-policy.html#personal-information-lists"
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 rounded-xl border border-border/30 hover:border-panda-black/30 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-panda-black"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-panda-black">
                  <ShieldCheck size={16} />
                  个人信息“双清单”
                  <ExternalLink size={14} className="ml-auto text-gray-400" />
                </span>
                <span className="block mt-1 text-xs text-gray-500">查看已收集信息及与第三方共享信息</span>
              </a>

              <a
                href="https://github.com/Panda-995/KOLFlow/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 rounded-xl border border-border/30 hover:border-panda-black/30 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-panda-black"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-panda-black">
                  <MessageSquareWarning size={16} />
                  投诉、举报与问题反馈
                  <ExternalLink size={14} className="ml-auto text-gray-400" />
                </span>
                <span className="block mt-1 text-xs text-gray-500">通过 GitHub Issues 提交并跟踪处理进度</span>
              </a>

              <a
                href={APP_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 rounded-xl border border-border/30 hover:border-panda-black/30 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-panda-black"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-panda-black">
                  <Download size={16} />
                  APP 下载与更新
                  <ExternalLink size={14} className="ml-auto text-gray-400" />
                </span>
                <span className="block mt-1 text-xs text-gray-500">获取已构建的 Android APP 与版本说明</span>
              </a>
            </div>

            <div className="mt-4 rounded-xl bg-gray-50 p-4 text-xs text-gray-600 leading-5">
              <p><strong className="text-panda-black">开发者与发布者：</strong>熊猫不是猫QAQ（个人开发者，非企业主体）</p>
              <p><strong className="text-panda-black">注册/办公地址：</strong>个人开发者远程办公，无企业注册地址或固定对外办公场所</p>
              <p className="flex flex-wrap items-center gap-x-1">
                <strong className="text-panda-black">个人信息保护负责人及投诉邮箱：</strong>
                <a
                  href="mailto:676096193@qq.com"
                  className="inline-flex items-center gap-1 font-medium text-panda-black underline underline-offset-2"
                >
                  <Mail size={13} />
                  676096193@qq.com
                </a>
              </p>
              <p className="mt-1 text-gray-500">
                KOLFlow 为自托管软件；若由其他组织或个人部署，当前实例的实际运营者及办公信息以该部署者公示为准。
              </p>
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
