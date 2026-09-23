import { useEffect, useMemo, useState } from 'react';

/** 列表默认首屏条数：兼顾"一眼看到规模"与渲染性能 */
export const DEFAULT_LIST_PAGE_SIZE = 40;

/**
 * 渐进渲染：数据仍全量加载（统计与筛选需要完整数据），但只渲染前 N 条，
 * 由用户点"加载更多"递增。这样数据规模增长时 DOM 节点数保持有界。
 * 当筛选条件变化（列表内容变化）时自动回到首屏条数。
 */
export const useProgressiveList = <T>(
  items: readonly T[],
  pageSize: number = DEFAULT_LIST_PAGE_SIZE,
  /**
   * 筛选条件签名：只有筛选/搜索条件变化时才回到首屏，
   * 数据刷新（新增/删除一条）不会把用户已展开的列表收回，
   * 同时数量相同的另一组筛选结果也能正确重置。
   */
  filterKey: string = '',
) => {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [filterKey, pageSize]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = items.length > visibleItems.length;

  const loadMore = () => setVisibleCount(count => count + pageSize);

  return {
    visibleItems,
    hasMore,
    loadMore,
    total: items.length,
    visibleCount: visibleItems.length,
    /** 列表是否被窗口化（用于决定是否展示"已显示 x / y"页脚） */
    windowed: items.length > pageSize,
  };
};
