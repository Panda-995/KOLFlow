// 共享常量和工具

// 邀请码（支持环境变量配置）
export const VALID_INVITE_CODE = process.env.INVITE_CODE || 'panda995';

// 商单类型映射
export const ORDER_TYPE_MAP: Record<string, string> = {
  '付费': 'paid',
  '付费合作': 'paid',
  '置换': 'product_exchange',
  '置换合作': 'product_exchange',
  '直发': 'direct',
  '直发合作': 'direct'
};

// 商单状态映射
export const ORDER_STATUS_MAP: Record<string, string> = {
  '进行中': 'in_progress',
  '已完成': 'completed',
  '已取消': 'cancelled'
};

// Excel字段映射
export const EXCEL_FIELD_MAP: Record<string, string> = {
  '标题': 'title',
  '商单名称': 'title',
  '类型': 'type',
  '合作类型': 'type',
  '金额': 'actualAmount',
  '实际金额': 'actualAmount',
  '品牌': 'brandName',
  '品牌名称': 'brandName',
  '平台': 'platforms',
  '发布平台': 'platforms',
  '接单日期': 'acceptDate',
  '提交日期': 'submitDate',
  '交稿日期': 'submitDate',
  '状态': 'status',
  '备注': 'remark'
};