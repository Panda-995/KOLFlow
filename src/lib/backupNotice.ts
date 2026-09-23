/**
 * 备份预警文案：导出/上传返回的 exportWarnings 必须让用户看见——
 * "备份已生成"不等于"备份可恢复"（集合条数或体积超过导入上限时无法直接恢复）。
 */
export const extractExportWarnings = (payload: unknown): string[] => {
  if (!payload || typeof payload !== 'object') return [];
  const warnings = (payload as { exportWarnings?: unknown }).exportWarnings;
  if (!Array.isArray(warnings)) return [];
  return warnings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

/** 成功导出但有风险时的提示；没有风险时返回 null（由调用方给出普通成功提示） */
export const formatExportWarningMessage = (warnings: string[], prefix: string): string | null => {
  if (warnings.length === 0) return null;
  return `${prefix}：${warnings.join('；')}`;
};

export const BACKUP_RISK_UPDATED_EVENT = 'kolflow:backup-risk-updated';

export type BackupRisk = {
  warnings: string[];
  at: string;
  /** 风险来自本地导出还是 WebDAV 上传 */
  source: 'export' | 'webdav';
};

const RISK_BASE_KEY = 'kolflow.backupRisk';

// 按账号分键：换账号后不应看到上一个账号的备份风险
const scopedRiskKey = (): string => {
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;
  return `${RISK_BASE_KEY}:${encodeURIComponent(userId || 'anonymous')}`;
};

/**
 * 记录"最近一次备份存在可恢复性风险"。
 * 光靠 3 秒的提示用户读不完，这里留一份可回看的记录（数据管理页展示），
 * 下一次导出/上传没有风险时自动清除。
 */
export const saveBackupRisk = (warnings: string[], source: BackupRisk['source']): void => {
  if (typeof window === 'undefined') return;
  if (warnings.length === 0) {
    localStorage.removeItem(scopedRiskKey());
  } else {
    const risk: BackupRisk = { warnings, at: new Date().toISOString(), source };
    localStorage.setItem(scopedRiskKey(), JSON.stringify(risk));
  }
  window.dispatchEvent(new Event(BACKUP_RISK_UPDATED_EVENT));
};

export const loadBackupRisk = (): BackupRisk | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(scopedRiskKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackupRisk;
    if (!parsed || !Array.isArray(parsed.warnings) || parsed.warnings.length === 0) return null;
    return {
      warnings: parsed.warnings.filter((item): item is string => typeof item === 'string'),
      at: typeof parsed.at === 'string' ? parsed.at : new Date().toISOString(),
      source: parsed.source === 'webdav' ? 'webdav' : 'export',
    };
  } catch {
    return null;
  }
};

export const clearBackupRisk = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(scopedRiskKey());
  window.dispatchEvent(new Event(BACKUP_RISK_UPDATED_EVENT));
};
