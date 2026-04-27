export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-gray-400 animate-in fade-in duration-500">
      <div className="text-8xl mb-6 opacity-50">🐼</div>
      <h1 className="text-2xl font-bold text-panda-black mb-2">{title}</h1>
      <p>此功能模块正在开发中...</p>
    </div>
  );
}
