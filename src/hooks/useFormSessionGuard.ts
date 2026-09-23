import { useCallback, useRef } from 'react';

/**
 * 表单会话令牌：每次打开/关闭弹窗都会作废此前发出的令牌。
 *
 * 保存请求返回后先比对令牌，再决定是否关闭弹窗——
 * 否则"第一张表单保存中 → 关闭 → 打开第二张并填写 → 第一张的响应返回"
 * 会把用户正在填写的第二张表单关掉，输入直接丢失。
 */
export const useFormSessionGuard = () => {
  const sessionRef = useRef(0);

  /** 作废此前令牌并开启新会话（打开、关闭弹窗时调用） */
  const invalidateFormSession = useCallback((): number => {
    sessionRef.current += 1;
    return sessionRef.current;
  }, []);

  /** 记录发起请求时所属的表单会话 */
  const captureFormSession = useCallback((): number => sessionRef.current, []);

  /** 该令牌代表的表单是否仍是当前这一个 */
  const isFormSessionCurrent = useCallback((token: number): boolean => sessionRef.current === token, []);

  return { invalidateFormSession, captureFormSession, isFormSessionCurrent };
};
